const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middlewares/auth');
const bcrypt = require('bcrypt');

// Buscar perfil completo
router.get('/', verificarToken, async (req, res) => {
    try {
        const usuario = await pool.query(
            'SELECT id, nome_usuario, email, avatar_url FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );

        const perfis = await pool.query(`
            SELECT pc.*, c.nome as cronica_nome
            FROM perfis_cronica pc
            JOIN cronicas c ON pc.cronica_id = c.id
            WHERE pc.usuario_id = $1
        `, [req.usuario.id]);

        res.json({
            usuario: usuario.rows[0],
            perfis_cronica: perfis.rows
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao carregar perfil.' });
    }
});

// Atualizar nome e email
router.put('/dados', verificarToken, async (req, res) => {
    const { nome_usuario, email } = req.body;

    try {
        const result = await pool.query(
            `UPDATE usuarios SET nome_usuario = $1, email = $2 
             WHERE id = $3 RETURNING id, nome_usuario, email`,
            [nome_usuario, email, req.usuario.id]
        );
        res.json({ mensagem: 'Dados atualizados!', usuario: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Email ou nome já em uso.' });
        res.status(500).json({ erro: 'Erro ao atualizar dados.' });
    }
});

// Alterar senha
router.put('/senha', verificarToken, async (req, res) => {
    const { senha_atual, nova_senha } = req.body;

    try {
        const usuario = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
        const senhaValida = await bcrypt.compare(senha_atual, usuario.rows[0].senha_hash);
        
        if (!senhaValida) return res.status(401).json({ erro: 'Senha atual incorreta.' });

        const salt = await bcrypt.genSalt(10);
        const novaHash = await bcrypt.hash(nova_senha, salt);

        await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [novaHash, req.usuario.id]);
        res.json({ mensagem: 'Senha alterada com sucesso!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao alterar senha.' });
    }
});

// Atualizar avatar padrão
router.put('/avatar', verificarToken, async (req, res) => {
    const { avatar_url } = req.body;

    try {
        await pool.query('UPDATE usuarios SET avatar_url = $1 WHERE id = $2', [avatar_url, req.usuario.id]);
        res.json({ mensagem: 'Avatar atualizado!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar avatar.' });
    }
});

// Salvar/atualizar perfil por crônica
router.put('/cronica/:cronicaId', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { apelido, avatar_url } = req.body;

    try {
        await pool.query(`
            INSERT INTO perfis_cronica (usuario_id, cronica_id, apelido, avatar_url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (usuario_id, cronica_id) 
            DO UPDATE SET apelido = EXCLUDED.apelido, avatar_url = EXCLUDED.avatar_url
        `, [req.usuario.id, cronicaId, apelido, avatar_url]);

        res.json({ mensagem: 'Perfil da crônica atualizado!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao salvar perfil da crônica.' });
    }
});

module.exports = router;