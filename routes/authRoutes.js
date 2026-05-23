const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Traz a conexão com o banco

const JWT_SECRET = process.env.JWT_SECRET || 'grimorio_secreto_m20_super_seguro';

// Rota de Registro
router.post('/registro', async (req, res) => {
    const { nome, email, senha, papel } = req.body;
    
    try {
        // Encriptar a senha antes de salvar no banco
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        // Inserir o novo jogador ou narrador
        const novoUsuario = await pool.query(
            'INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4) RETURNING *',
            [nome, email, senhaHash, papel || 'jogador']
        );

        res.status(201).json(novoUsuario.rows[0]);
    } catch (err) {
        console.error('Erro ao registrar:', err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// Rota de Login
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        // Buscar o usuário pelo email
        const usuario = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (usuario.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Comparar a senha digitada com a criptografada no banco
        const senhaValida = await bcrypt.compare(senha, usuario.rows[0].senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Gerar o token de acesso
        const token = jwt.sign(
            { id: usuario.rows[0].id, papel: usuario.rows[0].papel },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ token, usuario: { id: usuario.rows[0].id, nome: usuario.rows[0].nome, papel: usuario.rows[0].papel } });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

// Exporta o roteador para o server.js usar
module.exports = router;