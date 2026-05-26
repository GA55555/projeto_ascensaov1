const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;

// Rota de Registro
router.post('/registro', async (req, res) => {
    const { nome, email, senha } = req.body;  // ← sem "papel"
    
    try {
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);

        const novoUsuario = await pool.query(
            'INSERT INTO usuarios (nome_usuario, email, senha_hash) VALUES ($1, $2, $3) RETURNING *',
            [nome, email, senhaHash]  // ← sem papel
        );

        res.status(201).json(novoUsuario.rows[0]);
    } catch (err) {
        console.error('Erro ao registrar:', err);
        res.status(500).json({ erro: 'Erro no servidor' });
    }
});

// Rota de Login
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const usuario = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        
        if (usuario.rows.length === 0) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.rows[0].senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Credenciais inválidas' });
        }

        // ✅ Token simplificado (sem papel)
        const token = jwt.sign(
            { id: usuario.rows[0].id, nome_usuario: usuario.rows[0].nome_usuario },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // ✅ Resposta sem papel
        res.json({ 
            token, 
            usuario: { 
                id: usuario.rows[0].id, 
                nome: usuario.rows[0].nome_usuario
            } 
        });

    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ erro: 'Erro no servidor' });
    }
});

module.exports = router;