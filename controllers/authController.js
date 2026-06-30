const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');

// Só é alcançado se o middleware verificarToken validar o cookie HttpOnly.
exports.verificarSessao = (req, res) => {
    res.json({ ok: true, usuario: { id: req.usuario.id, nome: req.usuario.nome_usuario } });
};

exports.registrar = asyncHandler(async (req, res) => {
    const { nome, email, senha } = req.body;

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);

    const novoUsuario = await pool.query(
        'INSERT INTO usuarios (nome_usuario, email, senha_hash) VALUES ($1, $2, $3) RETURNING *',
        [nome, email, senhaHash]
    );

    res.status(201).json(novoUsuario.rows[0]);
});

exports.login = asyncHandler(async (req, res) => {
    const { email, senha } = req.body;

    const usuario = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);

    if (usuario.rows.length === 0) {
        return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.rows[0].senha_hash);
    if (!senhaValida) {
        return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
        { id: usuario.rows[0].id, nome_usuario: usuario.rows[0].nome_usuario },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.cookie('m20_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 86400000
    });

    res.json({
        usuario: {
            id: usuario.rows[0].id,
            nome: usuario.rows[0].nome_usuario,
            tema_interface: usuario.rows[0].tema_interface || 'padrao'
        }
    });
});

exports.logout = asyncHandler(async (req, res) => {
    res.clearCookie('m20_token');
    res.json({ mensagem: 'Logout efetuado' });
});

exports.dashboardResumo = async (req, res) => {
    const userId = req.usuario.id;
    try {
        const queryNarrador = await pool.query(
            `SELECT c.id, c.nome, c.status, s.nome AS sistema_nome
               FROM cronicas c
               LEFT JOIN sistemas s ON s.id = c.sistema_id
              WHERE c.narrador_id = $1
              ORDER BY c.criado_em DESC`,
            [userId]
        );
        const queryJogador = await pool.query(`
            SELECT c.id as cronica_id, c.nome as cronica_nome, c.status, s.nome AS sistema_nome
            FROM cronica_jogadores cj
            JOIN cronicas c ON cj.cronica_id = c.id
            LEFT JOIN sistemas s ON s.id = c.sistema_id
            WHERE cj.usuario_id = $1
            ORDER BY c.criado_em DESC
        `, [userId]);

        res.json({ narrando: queryNarrador.rows, jogando: queryJogador.rows });
    } catch (err) {
        console.error("Erro ao carregar resumo do dashboard:", err);
        res.status(500).json({ erro: 'Erro interno ao carregar perfil.' });
    }
};