const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;  // Добавяме cloudinary
const app = express();
const port = 3000;

// Конфигуриране на Cloudinary
cloudinary.config({
  cloud_name: 'dhhlacol1',  // Cloud Name
  api_key: '359592344316647',  // API Key
  api_secret: 'd9LIHVmoBnqXqPRnJYkEs-vqjv8'  // API Secret
});

// Проверка дали директорията за временни файлове съществува
const tempDir = 'uploads/temp/';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Конфигурация на multer за качване на файлове във временна папка
const tempStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);  // Пътят към временната директория
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: tempStorage });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Функция за намиране на следващия свободен номер за папка
function getNextFolderNumber() {
  const submissionsDir = path.join(__dirname, 'submissions');
  const existingDirs = fs.readdirSync(submissionsDir).filter(item => fs.statSync(path.join(submissionsDir, item)).isDirectory());
  let maxNumber = 0;

  existingDirs.forEach(dir => {
    const number = parseInt(dir.split('.')[0]); // Вземаме само първата част преди точката
    if (!isNaN(number) && number > maxNumber) {
      maxNumber = number;
    }
  });

  return maxNumber + 1;
}

function getUniqueFileName(ownerDir, fileName) {
  let newPath = path.join(ownerDir, fileName);
  let count = 1;

  // Проверка дали файлът съществува и добавяне на суфикс, ако е необходимо
  while (fs.existsSync(newPath)) {
    const extname = path.extname(fileName);
    const basename = path.basename(fileName, extname);
    newPath = path.join(ownerDir, `${basename}_${count}${extname}`);
    count++;
  }

  return newPath;
}

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

  // Преместване на файловете в Cloudinary и запазване на URL адреса
  const uploadPromises = Object.keys(files).map(key => {
    return Promise.all(files[key].map(file => {
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(file.path, { 
          public_id: `${ownerDir}/${file.originalname}`, // Път в Cloudinary
          resource_type: "auto" // За автоматично разпознаване на типа (изображение, видео и т.н.)
        }, (error, result) => {
          if (error) {
            reject(error);
          } else {
            console.log(`File uploaded to Cloudinary: ${result.secure_url}`);
            resolve(result.secure_url); // Записваме URL адреса на каченото в Cloudinary
          }
        });
      });
    }));
  });

  // Изчакваме всички качвания да завършат
  Promise.all(uploadPromises.flat()).then((fileUrls) => {
    // Съхраняване на информацията в JSON файл в папката на собственика
    const submission = {
      formData: formData,
      files: fileUrls
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
  }).catch((err) => {
    console.error('Error uploading files to Cloudinary:', err);
    res.status(500).send('Error uploading files');
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
