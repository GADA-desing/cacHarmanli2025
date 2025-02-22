require('dotenv').config(); // Добавете това най-отгоре

const express = require('express');
const helmet = require('helmet'); // Добавен пакет
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const port = process.env.PORT || 3000;

// ========== Cloudinary конфигурация ==========
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// ========== НОВО: Конфигурация за сигурност ==========
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], 
        styleSrc: ["'self'", "'unsafe-inline'"], 
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        connectSrc: ["'self'", "https://api.cloudinary.com"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
  })
);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  next();
});

// ========== Оригинална функционалност (без съкращения) ==========

// Функция за намиране на следващия номер на папка
async function getNextFolderNumber() {
  try {
    // Извличане на всички подпапки в "submissions" от Cloudinary
    const result = await cloudinary.api.sub_folders('submissions');
    const folders = result.folders.map(folder => folder.name);

    // Филтриране на папките с формат "число.име"
    const numbers = folders
      .map(name => {
        const match = name.match(/^(\d+)\./); // Взима числото преди първата точка
        return match ? parseInt(match[1]) : 0;
      })
      .filter(num => !isNaN(num) && num > 0);

    // Сортиране на числата и намиране на следващия номер
    numbers.sort((a, b) => a - b);
    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  } catch (error) {
    console.error('Грешка при извличане на папки:', error);
    return 1; // Ако има грешка, започваме от 1
  }
}

// Конфигурация за Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Запазваме номера на папката в req обекта, за да го използваме за всички файлове
    if (!req.folderNumber) {
      req.folderNumber = await getNextFolderNumber();
    }
    const owner = req.body.owner.trim().replace(/\s+/g, '_');
    const folder = `submissions/${req.folderNumber}.${owner}`;

    return {
      folder: folder,
      allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
      public_id: `${Date.now()}-${path.parse(file.originalname).name}`,
    };
  },
});

const uploadCloudinary = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Маршрут за обработка на формата
app.post('/submit', uploadCloudinary.fields([
  { name: 'pedigree', maxCount: 1 },
  { name: 'payment', maxCount: 1 }
]), async (req, res) => {
  try {
    const formData = req.body;
    const files = req.files;

    // Добавяме повече логове
    console.log('Получени данни:', formData);
    console.log('Получени файлове:', files);

    // Валидация
    if (!formData.owner || !formData.email || !formData.phone || !files?.pedigree || !files?.payment) {
      console.log('Липсващи задължителни полета:', {
        owner: !formData.owner,
        email: !formData.email,
        phone: !formData.phone,
        pedigree: !files?.pedigree,
        payment: !files?.payment
      });
      return res.status(400).send('Всички полета са задължителни!');
    }

    const owner = formData.owner.trim().replace(/\s+/g, '_');
    const cloudinaryFolder = `submissions/${req.folderNumber}.${owner}`;

    // Използваме правилните имена на полетата от формата
    const dogName = formData.name || '';
    
    // Форматиране на датата
    const formatDate = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleDateString('bg-BG', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit'
      });
    };
    const birthDate = formatDate(formData.birthdate);
    
    // Превод на пола
    const gender = formData.sex === 'male' ? 'Мъжки' : 
                  formData.sex === 'female' ? 'Женски' : '';
    
    // Превод на класа
    const classTranslations = {
      'baby': 'Бебе (от 3 до 6 месеца)',
      'puppy': 'Подрастващи (от 6 до 9 месеца)',
      'junior': 'Млади (от 9 до 18 месеца)',
      'intermedia': 'Междинен (от 15 до 24 месеца)',
      'open': 'Отворен (над 15 месеца)',
      'working': 'Работен (над 15 месеца)',
      'champion': 'Шампион (над 15 месеца)',
      'veteran': 'Ветерани (Над 8 години)'
    };
    const dogClass = classTranslations[formData.class] || '';
    
    const color = formData.color || '';
    const variety = formData.variety || '';
    const father = formData.father || '';
    const mother = formData.mother || '';
    const regnumber = formData.regnumber || '';
    const microchip = formData.microchip || '';
    const breeder = formData.breeder || '';
    const address = formData.address || '';

    // Създаване на текстово съдържание
    const textContent = `
ДАННИ НА СОБСТВЕНИКА
-------------------
Име и фамилия: ${formData.owner}
E-mail: ${formData.email}
Телефон: ${formData.phone}
Адрес: ${address}

ДАННИ НА КУЧЕТО
--------------
Име на кучето: ${dogName}
Порода: ${formData.breed}
Пол: ${gender}
Цвят: ${color}
Разновидност: ${variety}
Баща: ${father}
Майка: ${mother}
№ Племенна книга: ${regnumber}
№ Микрочип: ${microchip}
Производител: ${breeder}
Клас: ${dogClass}
Дата на раждане: ${birthDate}

ПРИКАЧЕНИ ФАЙЛОВЕ
----------------
Родословие: ${files.pedigree[0].path}
Платежен документ: ${files.payment[0].path}
    `.trim();

    // Записване на временен текстов файл
    const txtPath = path.join(__dirname, 'temp.txt');
    fs.writeFileSync(txtPath, textContent, 'utf8');

    // Качване на текстовия файл в Cloudinary
    const txtUpload = await cloudinary.uploader.upload(txtPath, {
      folder: cloudinaryFolder,
      resource_type: 'raw',
      public_id: `${owner}_data.txt`
    });

    // Изтриване на временния текстов файл
    fs.unlinkSync(txtPath);

    // Обновяваме и JSON структурата
    const submission = {
      "Данни на собственика": {
        "Име и фамилия": formData.owner,
        "E-mail": formData.email,
        "Телефон": formData.phone,
        "Адрес": address
      },
      "Данни на кучето": {
        "Име на кучето": dogName,
        "Порода": formData.breed,
        "Пол": gender,
        "Цвят": color,
        "Разновидност": variety,
        "Баща": father,
        "Майка": mother,
        "№ Племенна книга": regnumber,
        "№ Микрочип": microchip,
        "Производител": breeder,
        "Клас": dogClass,
        "Дата на раждане": birthDate
      },
      "Прикачени файлове": {
        "Родословие": files.pedigree[0].path,
        "Платежен документ": files.payment[0].path
      }
    };

    const jsonPath = path.join(__dirname, 'temp.json');
    fs.writeFileSync(jsonPath, JSON.stringify(submission, null, 2));

    const jsonUpload = await cloudinary.uploader.upload(jsonPath, {
      folder: cloudinaryFolder,
      resource_type: 'auto',
      public_id: `${owner}_data`
    });

    fs.unlinkSync(jsonPath);

    console.log('Успешно качени файлове в:', cloudinaryFolder);
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            .success-message {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              background: rgba(39, 174, 96, 0.9);
              color: white;
              padding: 30px;
              border-radius: 8px;
              text-align: center;
              font-family: Arial, sans-serif;
              font-size: 24px;
              width: 90%;
              max-width: 400px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            }
            @media (max-width: 480px) {
              .success-message {
                font-size: 20px;
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="success-message">Данните са изпратени успешно! ✅</div>
          <script>
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    // Подробно логване на грешката
    console.error('Детайли за грешката:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).send('Грешка при обработка на заявката');
  }
});

// Функция за поддържане на сървъра активен
function keepAlive() {
    app.get('/ping', (req, res) => {
        res.send('pong');
    });

    // Изпращаме ping на всеки 14 минути
    setInterval(() => {
        const https = require('https');
        https.get('https://cacharmanli2025.onrender.com//ping', (resp) => {
            resp.on('data', () => {});
            resp.on('end', () => console.log('Ping успешен'));
        }).on('error', (err) => {
            console.log('Ping грешка:', err.message);
        });
    }, 14 * 60 * 1000);
}

app.listen(port, () => {
    console.log(`Сървърът работи на http://localhost:${port}`);
    keepAlive(); // Стартираме функцията за поддържане на активност
});