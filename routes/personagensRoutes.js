const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middlewares/auth');

// ROTA: Listar personagens do usuário
router.get('/', verificarToken, async (req, res) => {
    const userId = req.usuario.id;
    // ... lógica de listar magos ...
});

// ROTA: Evoluir um personagem
router.post('/:id/evoluir', verificarToken, async (req, res) => {
    // ... lógica de gastar EXP e salvar ficha ...
});

module.exports = router;