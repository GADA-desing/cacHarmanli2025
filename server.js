const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2; // за Cloudinary

const app = express();  // Създаване на express приложение
const port = process.env.PORT || 3000; // Порът може да бъде зададен от Render

// Проверка дали директорията за временни файлове съществува
const tempDir = path.join(__dirname, 'uploads', 'temp');
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

const upload = multer({ storage: tempStorage });  // Дефиниране на upload с multer

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Добавяне на middleware за JSON данни

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

// Маршрут за приемане на форма за качване
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

  // Преместване на файловете в папката на собственика, като добавяме суфикс при конфликт
  Object.keys(files).forEach(key => {
    files[key].forEach(file => {
      const tempPath = path.join(__dirname, file.path);
      const newFilePath = getUniqueFileName(ownerDir, file.originalname);

      // Лог за изходния път и целевия път
      console.log(`Moving file: ${tempPath} -> ${newFilePath}`);

      // Проверка дали целевата директория съществува, ако не - създаване на директорията
      const targetDir = path.dirname(newFilePath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });  // Създава целевата директория, ако не съществува
        console.log(`Created target directory: ${targetDir}`);
      }

      // Преместване на файла
      try {
        fs.renameSync(tempPath, newFilePath);
        console.log(`File moved successfully: ${newFilePath}`);
      } catch (err) {
        console.error('Error moving file:', err);
      }
    });
  });

  // Съхраняване на информацията в JSON файл в папката на собственика
  const submission = {
    formData: formData,
    files: files
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
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
