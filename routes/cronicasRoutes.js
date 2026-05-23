const express = require('express');
const router = express.Router();
const pool = require('../db'); // Conexão com o banco
const verificarToken = require('../middlewares/auth'); // O segurança da porta
const { checarAcessoCronica } = require('../middlewares/permissoes');

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

// Rota completa para o painel
router.get('/:id/comunidade', verificarToken, async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario.id;

    try {
        // Busca a crônica
        const cronica = await pool.query('SELECT * FROM cronicas WHERE id = $1', [id]);
        if (cronica.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });

        // Verifica acesso
        const acesso = await checarAcessoCronica(usuarioId, id);
        if (!acesso.temAcesso) return res.status(403).json({ erro: 'Acesso negado.' });

        // Busca abas
        const abas = await pool.query('SELECT * FROM cronica_abas WHERE cronica_id = $1', [id]);

        res.json({
            cronica: cronica.rows[0],
            abas: abas.rows,
            papel: acesso.papel,
            is_narrador: acesso.papel === 'narrador'
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao carregar comunidade.' });
    }
});

// Exporta o roteador
module.exports = router;