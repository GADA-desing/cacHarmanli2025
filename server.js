const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Конфигурация на multer за качване на файлове във временна папка
const tempStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/temp/');
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: tempStorage });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.post('/submit', upload.fields([{ name: 'pedigree', maxCount: 1 }, { name: 'payment', maxCount: 1 }]), (req, res) => {
  const formData = req.body;
  const files = req.files;
  const owner = formData.owner.trim().replace(/\s+/g, '_');

  // Проверка и създаване на папка за всеки собственик
  const ownerDir = path.join(__dirname, 'submissions', owner);
  if (!fs.existsSync(ownerDir)) {
    fs.mkdirSync(ownerDir, { recursive: true });
  }

  // Преместване на файловете в папката на собственика
  if (files) {
    Object.keys(files).forEach(key => {
      files[key].forEach(file => {
        const tempPath = path.join(__dirname, file.path);
        const newPath = path.join(ownerDir, file.originalname);
        fs.renameSync(tempPath, newPath);
      });
    });
  }

  // Съхраняване на информацията в JSON файл в папката на собственика
  const submission = {
    formData: formData,
    files: files
  };

  fs.writeFile(path.join(ownerDir, `${owner}.json`), JSON.stringify(submission, null, 2), (err) => {
    if (err) {
      console.error('Error saving submission:', err);
      res.status(500).send('Error saving submission');
    } else {
      console.log('Submission saved successfully');
      res.send('Form submitted successfully!');
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
