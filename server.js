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

const upload = multer({ storage: tempStorage });

// Конфигуриране на CloudinaryStorage за качване директно в Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'submissions',  // Папка за съхранение в Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
  },
});

const uploadCloudinary = multer({ storage: storage });

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

  // Подготовка за качване на файлове в Cloudinary
  const uploadPromises = [];

  Object.keys(files).forEach(key => {
    files[key].forEach(file => {
      const filePath = path.join(__dirname, file.path);
      
      // Качване в Cloudinary
      const uploadPromise = cloudinary.uploader.upload(filePath, {
        folder: `submissions/${folderNumber}.${owner}/`,  // Папка за съхранение в Cloudinary
        public_id: file.originalname.split('.')[0],    // Публично ID на файла
        resource_type: 'auto'  // Автоматично откриване на типа на ресурса
      }).then(result => {
        // След успешното качване, изтриваме локалния файл
        fs.unlinkSync(filePath); // Изтриваме локалния файл
        return result;
      }).catch(err => {
        console.error('Error uploading to Cloudinary:', err);
      });

      uploadPromises.push(uploadPromise);
    });
  });

  // Изчакваме всички качвания да завършат
  try {
    const uploadResults = await Promise.all(uploadPromises);
    console.log('All files uploaded to Cloudinary:', uploadResults);
  } catch (err) {
    console.error('Error uploading files:', err);
    return res.status(500).send('Error uploading files to Cloudinary.');
  }

  // Съхраняване на информацията в JSON файл в папката на собственика
  const submission = {
    formData: formData,
    files: files
  };

  let jsonPath = path.join(ownerDir, `${owner}.json`);
  jsonPath = getUniqueFileName(ownerDir, `${owner}.json`);

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
