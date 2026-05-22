const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db'); 
require('dotenv').config();

// Importamos a função de segurança para as rotas que precisam de login
const verificarToken = require('../middlewares/auth');

// ==========================================
// 1. ROTA DE REGISTRO (/auth/registrar)
// ==========================================
router.post('/registrar', async (req, res) => {
    const { nome_usuario, email, senha } = req.body;

    try {
        const usuarioExiste = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        
        if (usuarioExiste.rows.length > 0) {
            return res.status(400).json({ erro: 'Este email já está em uso.' });
        }

        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);

        const novoUsuario = await pool.query(
            `INSERT INTO usuarios (nome_usuario, email, senha_hash) 
             VALUES ($1, $2, $3) RETURNING id, nome_usuario, email`,
            [nome_usuario, email, senhaHash]
        );

        res.status(201).json({ 
            mensagem: 'Usuário registrado com sucesso!', 
            usuario: novoUsuario.rows[0] 
        });

    } catch (err) {
        console.error("Erro no registro:", err);
        res.status(500).json({ erro: 'Erro interno ao registrar usuário.' });
    }
});

// ==========================================
// 2. ROTA DE LOGIN (/auth/login)
// ==========================================
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        // 1. Verifica se o usuário existe
        const usuarioQuery = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        
        if (usuarioQuery.rows.length === 0) {
            return res.status(401).json({ erro: 'Email ou senha incorretos.' });
        }

        const usuario = usuarioQuery.rows[0];

        // 2. Verifica se a senha bate com o hash salvo
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Email ou senha incorretos.' });
        }

        // 3. Gera o Token JWT blindado usando a variável do .env
        const token = jwt.sign(
            { id: usuario.id, nome: usuario.nome_usuario },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // 4. Retorna o token para o front-end
        res.json({ 
            mensagem: 'Login realizado com sucesso!', 
            token: token, 
            usuario: { id: usuario.id, nome: usuario.nome_usuario } 
        });

    } catch (err) {
        console.error("Erro no login:", err);
        res.status(500).json({ erro: 'Erro interno ao realizar login.' });
    }
});

// ==========================================
// 3. ROTA: RESUMO DO DASHBOARD (Usado na profile.html)
// ==========================================
router.get('/dashboard-resumo', verificarToken, async (req, res) => {
    const usuarioId = req.usuario.id;

    try {
        // Busca as crônicas onde o usuário é o narrador absoluto
        const queryNarrando = await pool.query(
            'SELECT id, nome, banner_url FROM cronicas WHERE narrador_id = $1',
            [usuarioId]
        );

        // Busca as crônicas onde o usuário foi convidado a jogar
        const queryJogando = await pool.query(`
            SELECT c.id, c.nome, c.banner_url, j.papel 
            FROM cronicas c
            JOIN cronica_jogadores j ON c.id = j.cronica_id
            WHERE j.usuario_id = $1
        `, [usuarioId]);

        res.json({
            narrando: queryNarrando.rows,
            jogando: queryJogando.rows
        });

    } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
        res.status(500).json({ erro: 'Erro ao buscar o resumo do seu grimório.' });
    }
});

module.exports = router;