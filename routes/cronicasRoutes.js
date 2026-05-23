const express = require('express');
const router = express.Router();
const pool = require('../db'); // Conexão com o banco
const verificarToken = require('../middlewares/auth'); // O segurança da porta

// Rota: Buscar todas as crônicas criadas pelo narrador logado
router.get('/', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM cronicas WHERE narrador_id = $1',
            [req.usuario.id] // Busca apenas as crônicas deste usuário
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar crônicas:', err);
        res.status(500).json({ error: 'Erro no servidor ao acessar os registros.' });
    }
});

// Rota: Criar uma nova crônica (Apenas para Narradores)
router.post('/', verificarToken, async (req, res) => {
    // Verificação extra de segurança: o usuário é realmente um narrador?
    if (req.usuario.papel !== 'narrador') {
        return res.status(403).json({ error: 'Acesso negado. Apenas narradores podem tecer novas crônicas.' });
    }

    const { titulo, descricao, sistema } = req.body;
    
    try {
        const novaCronica = await pool.query(
            `INSERT INTO cronicas (narrador_id, titulo, descricao, sistema) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [req.usuario.id, titulo, descricao, sistema || 'Mago: A Ascensão']
        );
        
        res.status(201).json(novaCronica.rows[0]);
    } catch (err) {
        console.error('Erro ao criar crônica:', err);
        res.status(500).json({ error: 'Erro no servidor ao forjar a nova crônica.' });
    }
});

// Exporta o roteador
module.exports = router;