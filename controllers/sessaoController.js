const pool = require('../db');

// =======================================================
// SESSÕES (DIÁRIOS DE CAMPANHA)
// =======================================================

exports.listarSessoes = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        // Agora juntamos a tabela de núcleos para puxar o nome (nucleo_nome)
        const query = await pool.query(
            `SELECT s.*, n.nome AS nucleo_nome 
             FROM sessoes s
             LEFT JOIN entidade_nucleos n ON s.nucleo_id = n.id
             WHERE s.cronica_id = $1 
             ORDER BY s.data_sessao DESC NULLS LAST, s.criado_em DESC`,
            [cronicaId]
        );
        res.json(query.rows);
    } catch (err) {
        console.error('❌ Erro ao listar sessões:', err);
        res.status(500).json({ erro: 'Erro ao buscar sessões.' });
    }
};
exports.criarSessao = async (req, res) => {
    const { cronicaId } = req.params;
    const { titulo, data_sessao, resumo, status, nucleo_id, entidades, eventos, automacoes, desfechos } = req.body;

    if (!titulo) return res.status(400).json({ erro: 'O título da sessão é obrigatório.' });

    try {
        const result = await pool.query(
            `INSERT INTO sessoes 
             (cronica_id, titulo, data_sessao, resumo, status, nucleo_id, entidades, eventos, automacoes, desfechos)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb) 
             RETURNING *`,
            [
                cronicaId, 
                titulo, 
                data_sessao || null, 
                resumo || '', 
                status || 'planejada', 
                nucleo_id || null,
                JSON.stringify(entidades || []), 
                JSON.stringify(eventos || []), 
                JSON.stringify(automacoes || []), 
                JSON.stringify(desfechos || [])
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Erro ao criar sessão:', err);
        res.status(500).json({ erro: 'Erro ao registrar sessão.' });
    }
};

exports.editarSessao = async (req, res) => {
    const { id } = req.params;
    const { titulo, data_sessao, resumo, status, nucleo_id, entidades, eventos, automacoes, desfechos } = req.body;

    try {
        const result = await pool.query(
            `UPDATE sessoes
             SET titulo = $1, data_sessao = $2, resumo = $3, status = $4, nucleo_id = $5,
                 entidades = $6::jsonb, eventos = $7::jsonb, automacoes = $8::jsonb, desfechos = $9::jsonb
             WHERE id = $10 
             RETURNING *`,
            [
                titulo, 
                data_sessao || null, 
                resumo || '', 
                status || 'planejada', 
                nucleo_id || null,
                JSON.stringify(entidades || []), 
                JSON.stringify(eventos || []), 
                JSON.stringify(automacoes || []), 
                JSON.stringify(desfechos || []),
                id
            ]
        );
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Sessão não encontrada.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Erro ao editar sessão:', err);
        res.status(500).json({ erro: 'Erro ao atualizar sessão.' });
    }
};

exports.deletarSessao = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM sessoes WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Sessão não encontrada.' });
        res.json({ mensagem: 'Sessão apagada dos registros.' });
    } catch (err) {
        console.error('❌ Erro ao deletar sessão:', err);
        res.status(500).json({ erro: 'Erro ao deletar sessão.' });
    }
};