const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2; // за Cloudinary
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // за съхранение в Cloudinary

const app = express();
const port = process.env.PORT || 3000;

// Настройка на Cloudinary с вашите креденциали
cloudinary.config({
  cloud_name: 'dhhlacol1',  // Заменете с вашето име на облак
  api_key: '359592344316647',        // Заменете с вашия API ключ
  api_secret: 'd9LIHVmoBnqXqPRnJYkEs-vqjv8'   // Заменете с вашия API секрет
});

// Конфигурация на Multer за качване директно в Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'submissions',  // Папката, в която ще качвате файловете
    allowedFormats: ['jpg', 'jpeg', 'png'],  // Формати, които ще се качват
    transformation: [{ width: 500, height: 500, crop: 'limit' }]  // Преобразувания за изображенията
  }
});

const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Функция за намиране на следващия свободен номер за папка
function getNextFolderNumber() {
  const submissionsDir = path.join(__dirname, 'submissions');
  const existingDirs = fs.readdirSync(submissionsDir).filter(item => fs.statSync(path.join(submissionsDir, item)).isDirectory());
  let maxNumber = 0;

  existingDirs.forEach(dir => {
    const number = parseInt(dir.split('.')[0]);
    if (!isNaN(number) && number > maxNumber) {
      maxNumber = number;
    }
  });

  return maxNumber + 1;
}

function getUniqueFileName(ownerDir, fileName) {
  let newPath = path.join(ownerDir, fileName);
  let count = 1;

  while (fs.existsSync(newPath)) {
    const extname = path.extname(fileName);
    const basename = path.basename(fileName, extname);
    newPath = path.join(ownerDir, `${basename}_${count}${extname}`);
    count++;
  }

  return newPath;
}

app.post('/submit', upload.fields([{ name: 'pedigree', maxCount: 1 }, { name: 'payment', maxCount: 1 }]), async (req, res) => {
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

  const owner = formData.owner.trim().replace(/\s+/g, '_');
  const folderNumber = getNextFolderNumber();
  const ownerDir = path.join(__dirname, 'submissions', `${folderNumber}.${owner}`);

  if (!fs.existsSync(ownerDir)) {
    fs.mkdirSync(ownerDir, { recursive: true });
  }

  // Записване на линковете към Cloudinary в подадената информация
  const submission = {
    formData: formData,
    files: {}
  };

  // За всяко качено изображение
  Object.keys(files).forEach(key => {
    files[key].forEach(file => {
      submission.files[key] = {
        secure_url: file.path,  // Линк към каченото изображение в Cloudinary
        originalname: file.originalname  // Името на файла
      };
    });
  });

  // Съхраняване на информацията в JSON файл в папката на собственика
  const jsonPath = getUniqueFileName(ownerDir, `${owner}.json`);

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
