const asyncHandler = require('../utils/asyncHandler');
const pool = require('../db');
const automacaoService = require('../services/automacaoService');

// =======================================================
// GUARDS DE PROPRIEDADE (anti-IDOR) — Regra 3.3
// Tabelas-filhas (world_flags, event_flag_weights, event_nucleos) não têm
// cronica_id; estes helpers confirmam que o node/evento pertence à crônica da
// rota ANTES de qualquer mutação. Nomes de tabela fixos + queries parametrizadas
// (Regra 6.2 — sem concatenação dinâmica).
// =======================================================
async function nodePertenceACronica(nodeId, cronicaId) {
    const r = await pool.query('SELECT 1 FROM world_nodes WHERE id = $1 AND cronica_id = $2', [nodeId, cronicaId]);
    return r.rows.length > 0;
}
async function eventoPertenceACronica(eventoId, cronicaId) {
    const r = await pool.query('SELECT 1 FROM world_events WHERE id = $1 AND cronica_id = $2', [eventoId, cronicaId]);
    return r.rows.length > 0;
}


// =======================================================
// ENTIDADES (NODES)
// =======================================================
exports.listarNodes = async (req, res) => {
    const { cronicaId } = req.params;
    const { nucleo_id } = req.query;

    try {
        let queryStr = `
            SELECT n.id, n.nome, n.tipo, n.parent_node_id, n.nucleo_id, n.criado_em,
                   en.nome as nucleo_nome,
                   COALESCE(json_agg(json_build_object('key', f.flag_key, 'value', f.flag_value)) FILTER (WHERE f.id IS NOT NULL), '[]') as flags
            FROM world_nodes n
            LEFT JOIN world_flags f ON n.id = f.node_id
            LEFT JOIN entidade_nucleos en ON n.nucleo_id = en.id
            WHERE n.cronica_id = $1
        `;
        const params = [cronicaId];
        let paramIdx = 2;

        if (nucleo_id) {
            if (nucleo_id === '__none__') {
                queryStr += ` AND n.nucleo_id IS NULL`;
            } else {
                queryStr += ` AND n.nucleo_id = $${paramIdx}`;
                params.push(nucleo_id);
                paramIdx++;
            }
        }

        queryStr += ` GROUP BY n.id, en.nome ORDER BY n.criado_em DESC`;
        const query = await pool.query(queryStr, params);
        res.json(query.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar nós do mundo.' });
    }
};

exports.criarNode = async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, tipo, nucleo_id } = req.body;
    try {
        const novoNode = await pool.query(
            "INSERT INTO world_nodes (cronica_id, nome, tipo, status, nucleo_id) VALUES ($1, $2, $3, 'aprovado', $4) RETURNING *",
            [cronicaId, nome, tipo, nucleo_id || null]
        );
        res.status(201).json(novoNode.rows[0]);
    } catch (err) {
        console.error("ERRO FATAL NA FORJA:", err);
        res.status(500).json({ erro: 'Erro interno ao forjar entidade.' });
    }
};

exports.editarNode = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    const { nome } = req.body;
    try {
        // IDOR: amarra o node à crônica da rota — impede editar nós de outra crônica.
        const result = await pool.query('UPDATE world_nodes SET nome = $1 WHERE id = $2 AND cronica_id = $3 RETURNING *', [nome, nodeId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        res.json({ mensagem: 'Entidade atualizada!', node: result.rows[0] });
    } catch (err) {
        console.error('Erro ao editar entidade:', err);
        res.status(500).json({ erro: 'Erro ao editar entidade.' });
    }
};

exports.deletarNode = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    try {
        // IDOR: só apaga se o node pertencer à crônica da rota.
        const result = await pool.query('DELETE FROM world_nodes WHERE id = $1 AND cronica_id = $2 RETURNING id', [nodeId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        res.json({ mensagem: 'Entidade e vínculos apagados.' });
    } catch (err) {
        console.error('Erro ao deletar entidade:', err);
        res.status(500).json({ erro: 'Erro ao deletar entidade.' });
    }
};

exports.atualizarNucleoNode = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    const { nucleo_id } = req.body;
    try {
        // IDOR: só associa núcleo a um node da própria crônica.
        const result = await pool.query('UPDATE world_nodes SET nucleo_id = $1 WHERE id = $2 AND cronica_id = $3 RETURNING id', [nucleo_id || null, nodeId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        res.json({ mensagem: 'Núcleo atualizado.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao associar núcleo.' });
    }
};

// =======================================================
// FLAGS (VARIÁVEIS DE MUNDO)
// =======================================================
exports.criarFlag = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    const { flag_key } = req.body; // já validado, nunca vazio

    if (!(await nodePertenceACronica(nodeId, cronicaId))) return res.status(404).json({ erro: 'Entidade não encontrada.' });
    try {
        await pool.query(
            "INSERT INTO world_flags (node_id, flag_key, flag_value) VALUES ($1, $2, FALSE)",
            [nodeId, flag_key.trim().toLowerCase().replace(/\s+/g, '_')]
        );
        res.status(201).json({ mensagem: 'Nova flag forjada.' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Flag já existe.' });
        res.status(500).json({ erro: 'Erro ao criar flag.' });
    }
};

exports.atualizarFlag = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    const { flag_key, flag_value } = req.body;

    if (!(await nodePertenceACronica(nodeId, cronicaId))) return res.status(404).json({ erro: 'Entidade não encontrada.' });
    try {
        const upsertQuery = `
            INSERT INTO world_flags (node_id, flag_key, flag_value)
            VALUES ($1, $2, $3)
            ON CONFLICT (node_id, flag_key) 
            DO UPDATE SET flag_value = EXCLUDED.flag_value, atualizado_em = NOW();
        `;
        await pool.query(upsertQuery, [nodeId, flag_key, flag_value]);

        const eventosAfetados = await pool.query(`
            SELECT event_id FROM event_flag_weights 
            WHERE node_id = $1 AND flag_key = $2
        `, [nodeId, flag_key]);

        const avisos = [];

        for (let row of eventosAfetados.rows) {
            const eventId = row.event_id;

            const eventoInfo = await pool.query('SELECT nome, pool_maxima FROM world_events WHERE id = $1', [eventId]);
            if (eventoInfo.rows.length === 0) continue;
            const { nome, pool_maxima } = eventoInfo.rows[0];

            const somaQuery = await pool.query(`
                SELECT COALESCE(SUM(w.peso), 0) as total
                FROM event_flag_weights w
                JOIN world_flags f ON w.node_id = f.node_id AND w.flag_key = f.flag_key
                WHERE w.event_id = $1 AND f.flag_value = TRUE
            `, [eventId]);

            let novoPool = somaQuery.rows[0].total;
            let novoStatus;

            if (novoPool >= pool_maxima) {
                if (novoPool > pool_maxima) novoPool = pool_maxima;
                avisos.push(`${nome} (${novoPool}/${pool_maxima})`);
                novoStatus = 'alerta_pronto';
                await pool.query(`
                    UPDATE world_events SET pool_atual = $1, status = $2, ultima_excedida_em = NOW() WHERE id = $3
                `, [novoPool, novoStatus, eventId]);

                // Dispara automações
                console.log(`Evento ${eventId} (${nome}) atingiu o limite! Disparando motor...`);
                automacaoService.agendarDisparo(eventId, cronicaId);
            } else {
                novoStatus = 'monitorando';
                await pool.query(`
                    UPDATE world_events SET pool_atual = $1, status = $2 WHERE id = $3
                `, [novoPool, novoStatus, eventId]);
            }
        }
        res.json({ mensagem: 'Realidade alterada.', avisos });
    } catch (err) {
        console.error("Erro no Motor de Eventos:", err);
        res.status(500).json({ erro: 'Erro ao atualizar estado.' });
    }
};
exports.listarNucleosSessao = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query("SELECT id, nome FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'sessao' ORDER BY nome ASC", [cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar núcleos de sessões.' }); }
};

exports.renomearFlag = async (req, res) => {
    const { cronicaId, nodeId, flagKey } = req.params;
    const { novo_nome } = req.body;

    if (!(await nodePertenceACronica(nodeId, cronicaId))) return res.status(404).json({ erro: 'Entidade não encontrada.' });

    try {
        await pool.query('BEGIN');
        await pool.query('UPDATE world_flags SET flag_key = $1 WHERE node_id = $2 AND flag_key = $3', [novo_nome, nodeId, flagKey]);
        await pool.query('UPDATE event_flag_weights SET flag_key = $1 WHERE node_id = $2 AND flag_key = $3', [novo_nome, nodeId, flagKey]);
        await pool.query('COMMIT');
        res.json({ mensagem: 'Flag renomeada com sucesso.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        if (err.code === '23505') return res.status(400).json({ erro: 'Já existe uma flag com este nome.' });
        console.error('Erro ao renomear flag:', err);
        res.status(500).json({ erro: 'Erro ao renomear flag.' });
    }
};

exports.deletarFlag = async (req, res) => {
    const { cronicaId, nodeId, flagKey } = req.params;

    if (!(await nodePertenceACronica(nodeId, cronicaId))) return res.status(404).json({ erro: 'Entidade não encontrada.' });
    try {
        await pool.query('BEGIN');
        const eventosVinculados = await pool.query('SELECT DISTINCT event_id FROM event_flag_weights WHERE node_id = $1 AND flag_key = $2', [nodeId, flagKey]);

        await pool.query('DELETE FROM event_flag_weights WHERE node_id = $1 AND flag_key = $2', [nodeId, flagKey]);
        await pool.query('DELETE FROM world_flags WHERE node_id = $1 AND flag_key = $2', [nodeId, flagKey]);

        // Recalcular eventos vinculados
        for (let row of eventosVinculados.rows) {
            const eventId = row.event_id;
            const eventoInfo = await pool.query('SELECT pool_maxima FROM world_events WHERE id = $1', [eventId]);
            if (eventoInfo.rows.length === 0) continue;
            
            const somaQuery = await pool.query(`
                SELECT COALESCE(SUM(w.peso), 0) as total
                FROM event_flag_weights w
                JOIN world_flags f ON w.node_id = f.node_id AND w.flag_key = f.flag_key
                WHERE w.event_id = $1 AND f.flag_value = TRUE
            `, [eventId]);

            const novoPool = somaQuery.rows[0].total;
            if (novoPool >= eventoInfo.rows[0].pool_maxima) {
                await pool.query(`UPDATE world_events SET pool_atual = $1, status = 'alerta_pronto', ultima_excedida_em = NOW() WHERE id = $2`, [novoPool, eventId]);
                automacaoService.agendarDisparo(eventId, cronicaId);
            } else {
                await pool.query(`UPDATE world_events SET pool_atual = $1, status = 'monitorando' WHERE id = $2`, [novoPool, eventId]);
            }
        }
        await pool.query('COMMIT');
        res.json({ mensagem: 'Flag e seus vínculos removidos. Eventos recalculados.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Erro ao deletar flag:', err);
        res.status(500).json({ erro: 'Erro ao deletar flag.' });
    }
};

// =======================================================
// NÚCLEOS (ENTIDADES E EVENTOS)
// =======================================================
exports.listarNucleosEntidade = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query("SELECT id, nome FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'entidade' ORDER BY nome ASC", [cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar núcleos de entidades.' }); }
};

exports.criarNucleoEntidade = async (req, res) => {
    const { cronicaId } = req.params;
    const { nome } = req.body;
        try {
        const novo = await pool.query("INSERT INTO entidade_nucleos (cronica_id, nome, tipo) VALUES ($1, $2, 'entidade') RETURNING *", [cronicaId, nome.trim()]);
        res.status(201).json(novo.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao criar núcleo.' }); }
};

exports.renomearNucleoEntidade = async (req, res) => {
    const { cronicaId, nucleoId } = req.params;
    const { nome } = req.body;
    try {
        const result = await pool.query('UPDATE entidade_nucleos SET nome = $1 WHERE id = $2 AND cronica_id = $3 RETURNING *', [nome.trim(), nucleoId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao renomear núcleo.' }); }
};

exports.excluirNucleoEntidade = async (req, res) => {
    const { cronicaId, nucleoId } = req.params;
    try {
        const result = await pool.query('DELETE FROM entidade_nucleos WHERE id = $1 AND cronica_id = $2 RETURNING id', [nucleoId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json({ mensagem: 'Núcleo excluído.' });
    } catch (err) {
        // Caso a FK world_nodes.nucleo_id não seja ON DELETE SET NULL: falha graciosamente (não 500 opaco).
        if (err.code === '23503') return res.status(409).json({ erro: 'Núcleo em uso por entidades. Mova-as antes de excluir.' });
        res.status(500).json({ erro: 'Erro ao excluir núcleo.' });
    }
};

exports.listarNucleosEventos = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query("SELECT id, nome FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'evento' ORDER BY nome ASC", [cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar núcleos de eventos.' }); }
};

exports.criarNucleoEventos = async (req, res) => {
    const { cronicaId } = req.params;
    const { nome } = req.body;
    try {
        const novo = await pool.query("INSERT INTO entidade_nucleos (cronica_id, nome, tipo) VALUES ($1, $2, 'evento') RETURNING *", [cronicaId, nome.trim()]);
        res.status(201).json(novo.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao criar núcleo.' }); }
};

exports.renomearNucleoEventos = async (req, res) => {
    const { cronicaId, nucleoId } = req.params;
    const { nome } = req.body;
    try {
        const result = await pool.query('UPDATE entidade_nucleos SET nome = $1 WHERE id = $2 AND cronica_id = $3 RETURNING *', [nome.trim(), nucleoId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao renomear núcleo.' }); }
};

exports.excluirNucleoEventos = async (req, res) => {
    const { cronicaId, nucleoId } = req.params;
    try {
        const result = await pool.query('DELETE FROM entidade_nucleos WHERE id = $1 AND cronica_id = $2 RETURNING id', [nucleoId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json({ mensagem: 'Núcleo excluído.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao excluir núcleo.' }); }
};
// =======================================================
// NOVAS FUNÇÕES: EVENTOS DA CRÓNICA (AGENDA)
// =======================================================
exports.listarEventos = async (req, res) => {
    const { cronicaId } = req.params;
    const { nucleo_id } = req.query;

    try {
        let params = [cronicaId];
        let filterClause = '';
        
        if (nucleo_id) {
            if (nucleo_id === '__none__') {
                filterClause = ` AND NOT EXISTS (SELECT 1 FROM event_nucleos enu WHERE enu.event_id = e.id) `;
            } else {
                params.push(nucleo_id);
                filterClause = ` AND EXISTS (SELECT 1 FROM event_nucleos enu WHERE enu.event_id = e.id AND enu.nucleo_id = $2) `;
            }
        }

        // QUERY SQL BLINDADA: Garante que os dados chegam como JSON e não se perdem
        const query = await pool.query(`
            SELECT 
                e.*,
                (
                    SELECT COALESCE(json_agg(json_build_object('id', n.id, 'nome', n.nome)), '[]'::json)
                    FROM event_nucleos en
                    JOIN entidade_nucleos n ON en.nucleo_id = n.id
                    WHERE en.event_id = e.id
                ) AS nucleos,
                (
                    SELECT COALESCE(json_agg(json_build_object('node_nome', wn.nome, 'flag_key', w.flag_key, 'peso', w.peso)), '[]'::json)
                    FROM event_flag_weights w
                    JOIN world_nodes wn ON w.node_id = wn.id
                    WHERE w.event_id = e.id
                ) AS gatilhos
            FROM world_events e
            WHERE e.cronica_id = $1 ${filterClause}
            ORDER BY e.criado_em DESC
        `, params);
        
        res.json(query.rows);
    } catch (err) {
        console.error('❌ Erro fatal ao listar eventos:', err);
        res.status(500).json({ erro: 'Erro ao buscar eventos do banco de dados.' });
    }
};
exports.criarEvento = async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, descricao, pool_maxima, nucleos_ids } = req.body;
    

    try {
        await pool.query('BEGIN');
        const result = await pool.query(
            `INSERT INTO world_events (cronica_id, nome, descricao, pool_maxima, pool_atual, status)
             VALUES ($1, $2, $3, $4, 0, 'monitorando') RETURNING *`,
            [cronicaId, nome, descricao || '', pool_maxima || 10]
        );
        const novoEvento = result.rows[0];

        if (nucleos_ids && nucleos_ids.length > 0) {
            for (let nId of nucleos_ids) {
                await pool.query('INSERT INTO event_nucleos (event_id, nucleo_id) VALUES ($1, $2)', [novoEvento.id, nId]);
            }
        }
        await pool.query('COMMIT');
        res.status(201).json(novoEvento);
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ erro: 'Erro ao criar evento.' });
    }
};

exports.deletarEvento = async (req, res) => {
    const { cronicaId } = req.params;
    const eventoId = req.params.eventoId || req.params.eventId;
    // Guard ANTES de apagar filhos: senão um atacante removeria pesos/núcleos alheios.
    if (!(await eventoPertenceACronica(eventoId, cronicaId))) return res.status(404).json({ erro: 'Evento não encontrado.' });
    try {
        await pool.query('BEGIN');
        await pool.query('DELETE FROM event_flag_weights WHERE event_id = $1', [eventoId]);
        await pool.query('DELETE FROM event_nucleos WHERE event_id = $1', [eventoId]);
        const result = await pool.query('DELETE FROM world_events WHERE id = $1 RETURNING id', [eventoId]);
        await pool.query('COMMIT');
        
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Evento não encontrado.' });
        res.json({ mensagem: 'Evento deletado permanentemente.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ erro: 'Erro ao deletar evento.' });
    }
};


exports.vincularEventoNucleo = async (req, res) => {
    const { cronicaId } = req.params;
    const eventoId = req.params.eventoId || req.params.eventId;
    const { nucleo_id } = req.body;
    if (!(await eventoPertenceACronica(eventoId, cronicaId))) return res.status(404).json({ erro: 'Evento não encontrado.' });
    try {
        await pool.query('INSERT INTO event_nucleos (event_id, nucleo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventoId, nucleo_id]);
        res.json({ mensagem: 'Núcleo vinculado ao evento.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao vincular núcleo.' });
    }
};

exports.desvincularEventoNucleo = async (req, res) => {
    const { cronicaId } = req.params;
    const eventoId = req.params.eventoId || req.params.eventId;
    const nucleoId = req.params.nucleoId || req.params.id;
    if (!(await eventoPertenceACronica(eventoId, cronicaId))) return res.status(404).json({ erro: 'Evento não encontrado.' });
    try {
        await pool.query('DELETE FROM event_nucleos WHERE event_id = $1 AND nucleo_id = $2', [eventoId, nucleoId]);
        res.json({ mensagem: 'Núcleo desvinculado do evento.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao desvincular núcleo.' });
    }
};

// =======================================================
// NOVAS FUNÇÕES: GATILHOS (VÍNCULOS ENTRE FLAG E EVENTO)
// =======================================================
exports.criarVinculo = async (req, res) => {
    const { cronicaId, eventoId } = req.params;
    const { node_id, flag_key, peso } = req.body;

    // Ambos os lados do gatilho devem pertencer à crônica (evita referência cross-tenant).
    if (!(await eventoPertenceACronica(eventoId, cronicaId))) return res.status(404).json({ erro: 'Evento não encontrado.' });
    if (!(await nodePertenceACronica(node_id, cronicaId))) return res.status(404).json({ erro: 'Entidade não encontrada.' });
    try {
        await pool.query('BEGIN');

        // Cria ou atualiza o peso do gatilho
        await pool.query(
            `INSERT INTO event_flag_weights (event_id, node_id, flag_key, peso)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (event_id, node_id, flag_key) DO UPDATE SET peso = EXCLUDED.peso`,
            [eventoId, node_id, flag_key, peso || 1]
        );

        // Como foi adicionado um gatilho novo, precisamos verificar se a flag já estava ativada
        // e, se for o caso, somar o peso à pool do evento.
        const eventoInfo = await pool.query('SELECT pool_maxima FROM world_events WHERE id = $1', [eventoId]);
        if (eventoInfo.rows.length > 0) {
            const { pool_maxima } = eventoInfo.rows[0];
            const somaQuery = await pool.query(`
                SELECT COALESCE(SUM(w.peso), 0) as total
                FROM event_flag_weights w
                JOIN world_flags f ON w.node_id = f.node_id AND w.flag_key = f.flag_key
                WHERE w.event_id = $1 AND f.flag_value = TRUE
            `, [eventoId]);

            let novoPool = somaQuery.rows[0].total;
            let novoStatus = novoPool >= pool_maxima ? 'alerta_pronto' : 'monitorando';
            if (novoPool >= pool_maxima && novoPool > pool_maxima) novoPool = pool_maxima;

            await pool.query(`
                UPDATE world_events SET pool_atual = $1, status = $2
                WHERE id = $3
            `, [novoPool, novoStatus, eventoId]);
        }

        await pool.query('COMMIT');
        res.status(201).json({ mensagem: 'Vínculo (Gatilho) criado com sucesso.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ erro: 'Erro ao criar vínculo.' });
    }
};

exports.deletarVinculo = async (req, res) => {
    const { cronicaId, eventoId } = req.params;
    const { node_id, flag_key } = req.body;
    if (!node_id || !flag_key) return res.status(400).json({ erro: 'node_id e flag_key são obrigatórios.' });

    if (!(await eventoPertenceACronica(eventoId, cronicaId))) return res.status(404).json({ erro: 'Evento não encontrado.' });
    try {
        await pool.query('BEGIN');

        await pool.query(
            'DELETE FROM event_flag_weights WHERE event_id = $1 AND node_id = $2 AND flag_key = $3',
            [eventoId, node_id, flag_key]
        );

        const eventoInfo = await pool.query('SELECT pool_maxima FROM world_events WHERE id = $1', [eventoId]);
        if (eventoInfo.rows.length > 0) {
            const { pool_maxima } = eventoInfo.rows[0];
            const somaQuery = await pool.query(`
                SELECT COALESCE(SUM(w.peso), 0) as total
                FROM event_flag_weights w
                JOIN world_flags f ON w.node_id = f.node_id AND w.flag_key = f.flag_key
                WHERE w.event_id = $1 AND f.flag_value = TRUE
            `, [eventoId]);

            const novoPool = somaQuery.rows[0].total;
            const novoStatus = novoPool >= pool_maxima ? 'alerta_pronto' : 'monitorando';

            await pool.query(
                'UPDATE world_events SET pool_atual = $1, status = $2 WHERE id = $3',
                [novoPool, novoStatus, eventoId]
            );
        }

        await pool.query('COMMIT');
        res.json({ mensagem: 'Vínculo removido com sucesso.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ erro: 'Erro ao remover vínculo.' });
    }
};

// =======================================================
// SINAPSES (LINKS BIDIRECIONAIS ENTRE ENTIDADES) — world_links
// Relacionamentos entre nós do mundo. Um único registo representa a ligação
// nos dois sentidos (ver listarLinks). Posse validada por nodePertenceACronica
// + cronica_id (Regra 3.3.1).
// =======================================================
exports.listarLinks = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    try {
        // Bidirecional: traz links onde o nó é origem OU destino, e devolve sempre
        // os dados do OUTRO nó (o conectado). Escopo por cronica_id isola tenants.
        const result = await pool.query(`
            SELECT
                l.id,
                l.tipo_vinculo,
                l.criado_em,
                (l.origem_node_id = $2) AS sou_origem,
                CASE WHEN l.origem_node_id = $2 THEN l.destino_node_id ELSE l.origem_node_id END AS node_conectado_id,
                n.nome AS node_conectado_nome,
                n.tipo AS node_conectado_tipo
            FROM world_links l
            JOIN world_nodes n
              ON n.id = CASE WHEN l.origem_node_id = $2 THEN l.destino_node_id ELSE l.origem_node_id END
            WHERE l.cronica_id = $1
              AND (l.origem_node_id = $2 OR l.destino_node_id = $2)
            ORDER BY l.criado_em DESC
        `, [cronicaId, nodeId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao listar sinapses:', err);
        res.status(500).json({ erro: 'Erro ao buscar vínculos da entidade.' });
    }
};

exports.criarLink = async (req, res) => {
    const { cronicaId, nodeId } = req.params;          // nodeId = origem
    const { destino_node_id, tipo_vinculo } = req.body;

    if (nodeId === destino_node_id) {
        return res.status(400).json({ erro: 'Uma entidade não pode vincular-se a si mesma.' });
    }
    try {
        // Anti-IDOR (Regra 3.3.1): AMBOS os nós têm de pertencer à crônica da rota.
        if (!(await nodePertenceACronica(nodeId, cronicaId)) || !(await nodePertenceACronica(destino_node_id, cronicaId))) {
            return res.status(404).json({ erro: 'Entidade não encontrada.' });
        }

        // O vínculo é bidirecional: rejeita se já existir em QUALQUER direção
        // (a constraint UNIQUE cobre só origem→destino).
        const jaExiste = await pool.query(`
            SELECT 1 FROM world_links
            WHERE cronica_id = $1
              AND ((origem_node_id = $2 AND destino_node_id = $3)
                OR (origem_node_id = $3 AND destino_node_id = $2))
        `, [cronicaId, nodeId, destino_node_id]);
        if (jaExiste.rows.length > 0) {
            return res.status(400).json({ erro: 'Estas entidades já estão conectadas.' });
        }

        const novo = await pool.query(`
            INSERT INTO world_links (cronica_id, origem_node_id, destino_node_id, tipo_vinculo)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [cronicaId, nodeId, destino_node_id, tipo_vinculo || 'associado']);
        res.status(201).json(novo.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Estas entidades já estão conectadas.' });
        console.error('Erro ao criar sinapse:', err);
        res.status(500).json({ erro: 'Erro ao criar conexão entre entidades.' });
    }
};

exports.deletarLink = async (req, res) => {
    const { cronicaId, nodeId, linkId } = req.params;
    try {
        // IDOR: o link tem de ser da crônica E envolver o node da rota (coerência da URL).
        const result = await pool.query(`
            DELETE FROM world_links
            WHERE id = $1 AND cronica_id = $2
              AND (origem_node_id = $3 OR destino_node_id = $3)
            RETURNING id
        `, [linkId, cronicaId, nodeId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Conexão não encontrada.' });
        res.json({ mensagem: 'Conexão desfeita.' });
    } catch (err) {
        console.error('Erro ao deletar sinapse:', err);
        res.status(500).json({ erro: 'Erro ao desfazer conexão.' });
    }
};