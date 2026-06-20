const pool = require('../db');

// ── DIREÇÃO DE CENA (FASE 17): CRUD de world_cenas ──
// Layouts de cena efêmeros, ISOLADOS do world_boards e do nucleo_id dos nós (mover um
// ator na cena NÃO altera world_nodes). Tudo escopado por cronica_id (anti-IDOR 3.3.1),
// parametrizado (6.2) e DML-only (4.1 — a tabela foi criada pelo DBA).

exports.listarCenas = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const r = await pool.query(
            `SELECT id, nome, criado_em, atualizado_em
               FROM world_cenas WHERE cronica_id = $1 ORDER BY atualizado_em DESC`,
            [cronicaId]
        );
        res.json(r.rows);
    } catch (err) {
        console.error('Erro ao listar cenas:', err);
        res.status(500).json({ erro: 'Erro ao listar cenas.' });
    }
};

exports.buscarCena = async (req, res) => {
    const { cronicaId, cenaId } = req.params;
    try {
        const r = await pool.query(
            `SELECT id, nome, dados, criado_em, atualizado_em
               FROM world_cenas WHERE id = $1 AND cronica_id = $2`,
            [cenaId, cronicaId]
        );
        if (r.rows.length === 0) return res.status(404).json({ erro: 'Cena não encontrada.' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('Erro ao buscar cena:', err);
        res.status(500).json({ erro: 'Erro ao carregar a cena.' });
    }
};

exports.criarCena = async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, dados } = req.body;
    try {
        const r = await pool.query(
            `INSERT INTO world_cenas (cronica_id, nome, dados)
             VALUES ($1, $2, $3::jsonb)
             RETURNING id, nome, dados, criado_em, atualizado_em`,
            [cronicaId, nome, JSON.stringify(dados || { colunas: [], atores: {} })]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('Erro ao criar cena:', err);
        res.status(500).json({ erro: 'Erro ao criar a cena.' });
    }
};

exports.atualizarCena = async (req, res) => {
    const { cronicaId, cenaId } = req.params;
    const { nome, dados } = req.body;
    try {
        // COALESCE: atualiza só os campos enviados; sempre carimba atualizado_em.
        const r = await pool.query(
            `UPDATE world_cenas
                SET nome = COALESCE($1, nome),
                    dados = COALESCE($2::jsonb, dados),
                    atualizado_em = now()
              WHERE id = $3 AND cronica_id = $4
              RETURNING id, nome, dados, criado_em, atualizado_em`,
            [nome ?? null, dados ? JSON.stringify(dados) : null, cenaId, cronicaId]
        );
        if (r.rows.length === 0) return res.status(404).json({ erro: 'Cena não encontrada.' });
        res.json(r.rows[0]);
    } catch (err) {
        console.error('Erro ao atualizar cena:', err);
        res.status(500).json({ erro: 'Erro ao salvar a cena.' });
    }
};

exports.deletarCena = async (req, res) => {
    const { cronicaId, cenaId } = req.params;
    try {
        const r = await pool.query(
            `DELETE FROM world_cenas WHERE id = $1 AND cronica_id = $2 RETURNING id`,
            [cenaId, cronicaId]
        );
        if (r.rows.length === 0) return res.status(404).json({ erro: 'Cena não encontrada.' });
        res.json({ mensagem: 'Cena removida.' });
    } catch (err) {
        console.error('Erro ao deletar cena:', err);
        res.status(500).json({ erro: 'Erro ao remover a cena.' });
    }
};
