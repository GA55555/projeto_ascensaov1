const express = require('express');
const router = express.Router();
const MidiaController = require('../controllers/midiaController');
const verificarToken = require('../middlewares/auth');
const upload = require('../config/upload'); // Importa o Multer configurado

// ==========================================
// SEGURANÇA: Whitelist de Pastas
// ==========================================
const pastasPermitidas = ['capas', 'posts', 'avatares', 'cards', 'social', 'fundos', 'entidades', 'nucleos'];

const validarDestino = (req, res, next) => {
    const { tipo } = req.params;
    
    if (!pastasPermitidas.includes(tipo)) {
        return res.status(400).json({ erro: `Destino '${tipo}' inválido ou não autorizado.` });
    }
    
    next();
};

// ==========================================
// ROTAS DE UPLOAD
// ==========================================
// A ordem dos middlewares importa: 
// 1. Está logado? -> 2. A pasta é válida? -> 3. Guarda as imagens -> 4. Devolve as URLs
router.post('/upload/:tipo', verificarToken, validarDestino, upload.array('imagens', 4), MidiaController.uploadImagens);

module.exports = router;