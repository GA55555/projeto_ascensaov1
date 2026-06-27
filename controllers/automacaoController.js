const pool = require('../db');
const oraculoSync = require('../services/oraculoSync');

exports.listarAutomacoes = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(`
            SELECT 
                t.id,
                t.ativo,
                t.condition_json->>'evento_id' AS evento_id,
                t.effect_json->>'tipo_nome' AS tipo_nome,
                t.effect_json->'parametros' AS parametros,
                e.nome AS evento_nome
            FROM world_triggers t
            LEFT JOIN world_events e ON (t.condition_json->>'evento_id')::uuid = e.id
            WHERE t.cronica_id = $1
            ORDER BY t.id DESC
        `, [cronicaId]);
        res.json(query.rows);
    } catch (err) {
        console.error('Erro ao listar automações:', err);
        res.status(500).json({ erro: 'Erro ao buscar automações.' });
    }
};

exports.criarAutomacao = async (req, res) => {
    try {
        const { cronicaId } = req.params;
        const { evento_id, tipo_nome, parametros } = req.body;

        // Chamamos a função nativa do banco. O Node.js não precisa lidar com a formatação.
        const result = await pool.query(
            `SELECT criar_world_trigger($1, $2, $3, $4::jsonb) AS trigger_criado`,
            [cronicaId, evento_id, tipo_nome, JSON.stringify(parametros || {})]
        );

        const criado = result.rows[0].trigger_criado;
        // F2: indexa a automação no Oráculo (texto curto condição→efeito), fire-and-forget (Regra 2.7).
        // O id pode vir como objeto (linha) ou uuid cru, conforme a função do banco → extrai defensivo.
        const novoId = (criado && typeof criado === 'object') ? criado.id : criado;
        if (novoId) oraculoSync.reindexarAutomacao(cronicaId, novoId);
        res.status(201).json(criado);
    } catch (err) {
        res.status(500).json({ erro: 'Erro no banco', detalhe: err.message });
    }
};

exports.deletarAutomacao = async (req, res) => {
    const { id, cronicaId } = req.params;
    try {
        await pool.query('DELETE FROM world_triggers WHERE id = $1', [id]);
        // F2: remove o vetor da automação apagada (escopo cronica_id da URL — imune a IDOR de doc).
        oraculoSync.removerEntidade(cronicaId, id);
        res.json({ mensagem: 'Automação deletada.' });
    } catch (err) {
        console.error('Erro ao deletar automação:', err);
        res.status(500).json({ erro: 'Erro ao deletar automação.' });
    }
};

exports.toggleStatusAutomacao = async (req, res) => {
    const { id, cronicaId } = req.params;
    const { ativo } = req.body;
    try {
        await pool.query('UPDATE world_triggers SET ativo = $1 WHERE id = $2', [ativo, id]);
        // F2: o estado armada/desarmada faz parte do texto indexado → re-indexa (Regra 4.2).
        oraculoSync.reindexarAutomacao(cronicaId, id);
        res.json({ mensagem: `Automação ${ativo ? 'armada' : 'desarmada'} com sucesso.` });
    } catch (err) {
        console.error('Erro ao alternar automação:', err);
        res.status(500).json({ erro: 'Erro ao atualizar automação.' });
    }
};