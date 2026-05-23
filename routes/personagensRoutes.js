const express = require('express');
const router = express.Router();
const pool = require('../db'); // Sua conexão com o banco
const verificarToken = require('../middlewares/auth'); // O middleware que criamos

// Rota: Buscar todos os personagens do jogador logado
router.get('/', verificarToken, async (req, res) => {
    try {
        // req.usuario.id foi injetado pelo verificarToken!
        const result = await pool.query(
            'SELECT * FROM personagens WHERE usuario_id = $1',
            [req.usuario.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar personagens:', err);
        res.status(500).json({ error: 'Erro no servidor ao acessar o grimório.' });
    }
});

// Rota: Criar um novo personagem
router.post('/', verificarToken, async (req, res) => {
    // Aqui extraímos os dados básicos que vêm do frontend
    const { nome, tradicao, essencia, natureza, comportamento } = req.body;
    
    try {
        const novoPersonagem = await pool.query(
            `INSERT INTO personagens 
            (usuario_id, nome, tradicao, essencia, natureza, comportamento) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.usuario.id, nome, tradicao, essencia, natureza, comportamento]
        );
        
        // Retorna a ficha recém-criada com o status 201 (Created)
        res.status(201).json(novoPersonagem.rows[0]);
    } catch (err) {
        console.error('Erro ao criar personagem:', err);
        res.status(500).json({ error: 'Erro no servidor ao forjar a ficha.' });
    }
});

// Exporte o roteador
module.exports = router;