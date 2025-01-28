const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;  // Добавено Cloudinary

const app = express();  // Създаване на express приложение
const port = process.env.PORT || 3000; // Порът може да бъде зададен от Render

// Вашата настройка на multer и останалата част от кода продължават тук...




app.post('/submit', upload.fields([{ name: 'pedigree', maxCount: 1 }, { name: 'payment', maxCount: 1 }]), (req, res) => {
  const formData = req.body;
  const files = req.files;

  // Проверка за липсващи полета
  if (
    !formData.owner || 
    !formData.email || 
    !formData.phone || 
    !files || 
    !files.pedigree || 
    !files.payment
  ) {
    return res.status(400).send('Всички задължителни полета трябва да бъдат попълнени и файловете качени.');
  }

  console.log('Received formData:', formData);
  console.log('Received files:', files);

  const owner = formData.owner.trim().replace(/\s+/g, '_');

  // Генериране на уникално име на папката с номер и име на собственика
  const folderNumber = getNextFolderNumber();
  const ownerDir = path.join(__dirname, 'submissions', `${folderNumber}.${owner}`);

  // Създаване на папката за собственика
  if (!fs.existsSync(ownerDir)) {
    fs.mkdirSync(ownerDir, { recursive: true });
    console.log(`Created directory for owner: ${ownerDir}`);
  }

  // Качване на файловете в Cloudinary
  const uploadToCloudinary = (file) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(file.path, { resource_type: "auto" }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url); // Връща URL на каченото изображение
        }
      });
    });
  };

  const fileUploadPromises = [];

  // Качваме всички файлове в Cloudinary и съхраняваме URL-ите
  Object.keys(files).forEach(key => {
    files[key].forEach(file => {
      const fileUploadPromise = uploadToCloudinary(file)
        .then(url => {
          console.log(`File uploaded successfully: ${url}`);
          return { field: key, url: url };
        })
        .catch(err => {
          console.error('Error uploading file:', err);
          return { field: key, error: err };
        });

      fileUploadPromises.push(fileUploadPromise);
    });
  });

  // Изчакваме да завърши качването на всички файлове
  Promise.all(fileUploadPromises)
    .then(uploadedFiles => {
      // Съхраняваме информацията за заявката, включително URL адресите на файловете
      const submission = {
        formData: formData,
        files: uploadedFiles
      };

      // Генериране на уникален JSON файл
      let jsonPath = path.join(ownerDir, `${owner}.json`);
      jsonPath = getUniqueFileName(ownerDir, `${owner}.json`);

      console.log(`Saving submission to: ${jsonPath}`);

      fs.writeFile(jsonPath, JSON.stringify(submission, null, 2), (err) => {
        if (err) {
          console.error('Error saving submission:', err);
          res.status(500).send('Error saving submission');
        } else {
          console.log('Submission saved successfully');
          res.send('Вашата заявка беше изпратена успешно!');
        }
      });
    })
    .catch(err => {
      console.error('Error uploading files:', err);
      res.status(500).send('Грешка при качването на файловете в Cloudinary.');
    });
});
