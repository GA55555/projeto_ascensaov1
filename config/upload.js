const multer = require('multer');
const path = require('path');
const fs = require('fs');

const caminhosUpload = [
    'public/uploads/avatares',
    'public/uploads/capas',
    'public/uploads/social',
    'public/uploads/cards',
    'public/uploads/posts',
    'public/uploads/fichas'
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

// --- PDFs (Gaveta de Fichas) ---
const storagePdf = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/fichas'),
    filename: (req, file, cb) => cb(null, `${Date.now()}.pdf`)
});

const filtroPdf = (req, file, cb) => {
    const extValida = path.extname(file.originalname).toLowerCase() === '.pdf';
    const mimeValido = file.mimetype === 'application/pdf';
    if (extValida && mimeValido) return cb(null, true);
    cb(new Error('Apenas ficheiros PDF são permitidos.'));
};

const uploadPdf = multer({
    storage: storagePdf,
    fileFilter: filtroPdf,
    limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports = upload;
module.exports.uploadPdf = uploadPdf;
