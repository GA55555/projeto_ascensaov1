const multer = require('multer');
const fs = require('fs');

const caminhosUpload = [
    'public/uploads/avatares',
    'public/uploads/capas',
    'public/uploads/social',
    'public/uploads/cards',
    'public/uploads/posts'
];

caminhosUpload.forEach(pasta => {
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
});

const MIMETYPES_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const filtroImagens = (req, file, cb) => {
    if (MIMETYPES_PERMITIDOS.has(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido. Apenas JPEG, PNG e WebP são aceites.'));
};

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: filtroImagens,
    limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = upload;
