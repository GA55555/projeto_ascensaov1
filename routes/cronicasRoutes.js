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

router.post('/', verificarToken, async (req, res) => {
    const { nome, descricao, sistema_id, capa_url } = req.body;

    try {
        const novaCronica = await pool.query(
            `INSERT INTO cronicas (narrador_id, nome, descricao, sistema_id, capa_url) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.usuario.id, nome, descricao, sistema_id || 1, capa_url]
        );
        
        // Cria a aba "Feed Geral" automaticamente
        await pool.query(
            `INSERT INTO cronica_abas (cronica_id, nome, tipo) VALUES ($1, 'Feed Geral', 'geral')`,
            [novaCronica.rows[0].id]
        );
        
        res.status(201).json(novaCronica.rows[0]);
    } catch (err) {
        console.error('Erro ao criar crônica:', err);
        res.status(500).json({ erro: 'Erro no servidor ao forjar a nova crônica.' });
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

router.put('/:id/status', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const usuarioId = req.usuario.id;

    const statusPermitidos = ['ativa', 'inativa', 'terminada'];
    if (!statusPermitidos.includes(status)) {
        return res.status(400).json({ erro: 'Status inválido. Use: ativa, inativa ou terminada.' });
    }

    try {
        // Determina o valor de data_termino ANTES da query
        const dataTermino = status === 'terminada' ? new Date() : null;

        const result = await pool.query(
            `UPDATE cronicas 
             SET status = $1, 
                 data_termino = $2
             WHERE id = $3 AND narrador_id = $4 
             RETURNING *`,
            [status, dataTermino, id, usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode alterar o status.' });
        }

        res.json({ 
            mensagem: `Crônica ${status === 'ativa' ? 'ativada' : status === 'inativa' ? 'pausada' : 'finalizada'}!`,
            cronica: result.rows[0]
        });
    } catch (err) {
        console.error('Erro ao atualizar status:', err);
        res.status(500).json({ erro: 'Erro ao alterar status da crônica.' });
    }
});

// Deletar crônica (imediatamente, com confirmação)
router.delete('/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const result = await pool.query(
            'DELETE FROM cronicas WHERE id = $1 AND narrador_id = $2 RETURNING id',
            [id, usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode deletar a crônica.' });
        }

        res.json({ mensagem: 'Crônica e todos os seus registros foram apagados.' });
    } catch (err) {
        console.error('Erro ao deletar crônica:', err);
        res.status(500).json({ erro: 'Erro ao deletar crônica.' });
    }
});
// Exporta o roteador
module.exports = router;