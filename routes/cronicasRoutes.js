const express = require('express');
const router = express.Router();
const pool = require('../db'); // Conexão com o banco
const verificarToken = require('../middlewares/auth'); // O segurança da porta
const { checarAcessoCronica } = require('../middlewares/permissoes'); // O middleware de mesa

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
        [req.usuario.id, nome, descricao, sistema_id, capa_url]  // ← 5 itens
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

// =======================================================
// ROTA DO PAINEL DA COMUNIDADE
// =======================================================
router.get('/:cronicaId/comunidade', verificarToken, checarAcessoCronica, async (req, res) => {
    const { cronicaId } = req.params;

    try {
        // Busca a crônica
        const cronica = await pool.query('SELECT * FROM cronicas WHERE id = $1', [cronicaId]);
        if (cronica.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });

        // Busca abas
        const abas = await pool.query('SELECT * FROM cronica_abas WHERE cronica_id = $1', [cronicaId]);

        // O middleware checarAcessoCronica já descobriu o papel do usuário e guardou no req.acesso!
        res.json({
            cronica: cronica.rows[0],
            abas: abas.rows,
            papel: req.acesso, 
            is_narrador: req.acesso === 'narrador'
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao carregar comunidade.' });
    }
});

router.put('/:cronicaId/status', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { status } = req.body;
    const usuarioId = req.usuario.id;

    const statusPermitidos = ['ativa', 'inativa', 'terminada'];
    if (!statusPermitidos.includes(status)) {
        return res.status(400).json({ erro: 'Status inválido. Use: ativa, inativa ou terminada.' });
    }

    try {
        const dataTermino = status === 'terminada' ? new Date() : null;

        const result = await pool.query(
            `UPDATE cronicas 
             SET status = $1, data_termino = $2
             WHERE id = $3 AND narrador_id = $4 
             RETURNING *`,
            [status, dataTermino, cronicaId, usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode alterar o status.' });
        }

        res.json({ 
            mensagem: `Crônica ${status === 'ativa' ? 'ativada' : status === 'inativa' ? 'pausada' : 'finalizada'}!`,
            cronica: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao alterar status da crônica.' });
    }
});

// =======================================================
// ABAS DA COMUNIDADE
// =======================================================
router.post('/:cronicaId/abas', verificarToken, checarAcessoCronica, async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, tipo } = req.body;

    try {
        if (req.acesso !== 'narrador') {
            return res.status(403).json({ erro: 'Apenas o narrador pode criar abas.' });
        }

        const result = await pool.query(
            `INSERT INTO cronica_abas (cronica_id, nome, tipo) VALUES ($1, $2, $3) RETURNING *`,
            [cronicaId, nome, tipo || 'restrita']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno ao criar a aba.' });
    }
});

router.delete('/:cronicaId/abas/:abaId', verificarToken, checarAcessoCronica, async (req, res) => {
    const { cronicaId, abaId } = req.params;

    try {
        if (req.acesso !== 'narrador') {
            return res.status(403).json({ erro: 'Apenas o narrador pode deletar abas.' });
        }

        await pool.query('DELETE FROM cronica_abas WHERE id = $1 AND cronica_id = $2', [abaId, cronicaId]);
        res.json({ mensagem: 'Aba deletada com sucesso.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar a aba.' });
    }
});

// =======================================================
// DELETAR CRÔNICA
// =======================================================
router.delete('/:cronicaId', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const result = await pool.query(
            'DELETE FROM cronicas WHERE id = $1 AND narrador_id = $2 RETURNING id',
            [cronicaId, usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode deletar a crônica.' });
        }

        res.json({ mensagem: 'Crônica e todos os seus registros foram apagados.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar crônica.' });
    }
});

// ==========================================
// ROTAS DE AUTOMAÇÕES
// ==========================================










module.exports = router;