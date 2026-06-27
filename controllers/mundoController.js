const asyncHandler = require('../utils/asyncHandler');
const pool = require('../db');
const automacaoService = require('../services/automacaoService');
const oraculoClient = require('../services/oraculoClient'); // F2: sincronização invisível com o Oráculo (fire-and-forget)
const oraculoCripto = require('../utils/oraculoCripto'); // F4: decifra a chave BYOK do Narrador p/ a consulta
const oraculoTexto = require('../services/oraculoTexto'); // texto rico (relações/flags/diplomacia) p/ o RAG
const oraculoSync = require('../services/oraculoSync'); // Regra 4.2: re-indexação fire-and-forget (describer + conector)
const fs = require('fs/promises');
const path = require('path');

// Higiene de ficheiros órfãos (Regra 6.6): apaga um /uploads/<pasta>/* quando o recurso que o
// referenciava troca/remove a imagem ou é excluído. RESTRITO às pastas em `pastasOk` (DEDICADAS
// ao board: 'fundos'/'entidades'/'nucleos' — NUNCA 'avatares' de perfil nem 'capas' alheias,
// mesmo que a url aponte p/ lá) + anti-traversal (caminho resolvido dentro de public/uploads).
// Falha silenciosa em ficheiro ausente (Regra 4.2).
const DIR_UPLOADS = path.resolve(__dirname, '..', 'public', 'uploads');
async function apagarUploadOrfao(url, pastasOk) {
    if (typeof url !== 'string') return;
    const m = url.match(/^\/uploads\/([a-z]+)\/[\w-]+\.(?:webp|png|jpe?g)$/i);
    if (!m || !pastasOk.includes(m[1].toLowerCase())) return;
    const abs = path.resolve(__dirname, '..', 'public', url.replace(/^\/+/, ''));
    if (!abs.startsWith(DIR_UPLOADS + path.sep)) return; // defesa em profundidade
    try { await fs.unlink(abs); } catch (e) { /* ENOENT/etc: ignora */ }
}

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
                   n.dados->>'avatar_url' AS avatar_url,
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
        // F2: indexa o node no Oráculo com TEXTO RICO (facção/flags/relações), fire-and-forget (Regra 2.7).
        const node = novoNode.rows[0];
        oraculoSync.reindexarNode(cronicaId, node.id, node.tipo);
        res.status(201).json(novoNode.rows[0]);
    } catch (err) {
        console.error("ERRO FATAL NA FORJA:", err);
        res.status(500).json({ erro: 'Erro interno ao forjar entidade.' });
    }
};

exports.editarNode = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    const { nome, avatar_url } = req.body;
    try {
        // IDOR: amarra o node à crônica da rota — impede editar nós de outra crônica.
        const temAvatar = Object.prototype.hasOwnProperty.call(req.body, 'avatar_url');
        // Regra 6.6: lê o avatar atual ANTES do update p/ apagar o órfão se mudar (escopo cronica_id).
        let urlAntigaAvatar = null;
        if (temAvatar) {
            const prev = await pool.query("SELECT dados->>'avatar_url' AS a FROM world_nodes WHERE id = $1 AND cronica_id = $2", [nodeId, cronicaId]);
            urlAntigaAvatar = prev.rows[0]?.a || null;
        }
        let result;
        if (temAvatar) {
            // Fatia 2: faz MERGE de avatar_url no jsonb 'dados' (não clobbera outras chaves);
            // null limpa a chave. $2 NULL via CASE para preservar o tipo da operação.
            result = await pool.query(
                `UPDATE world_nodes
                    SET nome = $1,
                        dados = CASE WHEN $2::text IS NULL
                                     THEN COALESCE(dados, '{}'::jsonb) - 'avatar_url'
                                     ELSE COALESCE(dados, '{}'::jsonb) || jsonb_build_object('avatar_url', $2::text) END
                  WHERE id = $3 AND cronica_id = $4
                  RETURNING *`,
                [nome, avatar_url ?? null, nodeId, cronicaId]
            );
        } else {
            result = await pool.query('UPDATE world_nodes SET nome = $1 WHERE id = $2 AND cronica_id = $3 RETURNING *', [nome, nodeId, cronicaId]);
        }
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        if (temAvatar) {
            const urlNova = result.rows[0]?.dados?.avatar_url || null;
            if (urlAntigaAvatar && urlAntigaAvatar !== urlNova) await apagarUploadOrfao(urlAntigaAvatar, ['entidades']);
        }
        // F2: re-upsert do node editado com texto rico (idempotente — mesmo id sobrescreve). Sem await.
        const node = result.rows[0];
        oraculoSync.reindexarNode(cronicaId, node.id, node.tipo);
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
        const result = await pool.query("DELETE FROM world_nodes WHERE id = $1 AND cronica_id = $2 RETURNING id, dados->>'avatar_url' AS avatar_url", [nodeId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        await apagarUploadOrfao(result.rows[0]?.avatar_url || null, ['entidades']); // Regra 6.6
        // F2: remove o vetor (Regra 4.2/6.6 — nada de "mortos" lembrados). Apaga por metadata {cronica_id, entidade_id}.
        oraculoSync.removerEntidade(cronicaId, nodeId);
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
        const antes = await pool.query('SELECT nucleo_id FROM world_nodes WHERE id = $1 AND cronica_id = $2', [nodeId, cronicaId]);
        const result = await pool.query('UPDATE world_nodes SET nucleo_id = $1 WHERE id = $2 AND cronica_id = $3 RETURNING id, tipo', [nucleo_id || null, nodeId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        // Regra 4.2: a facção do node mudou → re-indexa o node e os núcleos afetados (o antigo perde
        // um membro, o novo ganha). Fire-and-forget.
        oraculoSync.reindexarNode(cronicaId, nodeId, result.rows[0].tipo);
        const nucleoAntigo = antes.rows[0]?.nucleo_id || null;
        if (nucleoAntigo) oraculoSync.reindexarNucleo(cronicaId, nucleoAntigo);
        if (nucleo_id && nucleo_id !== nucleoAntigo) oraculoSync.reindexarNucleo(cronicaId, nucleo_id);
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
        oraculoSync.reindexarNode(cronicaId, nodeId); // Regra 4.2: a flag mudou o estado do node
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
        // Regra 4.2: a flag mudou o estado do node E a tensão dos eventos vinculados → re-indexa ambos.
        oraculoSync.reindexarNode(cronicaId, nodeId);
        for (const row of eventosAfetados.rows) oraculoSync.reindexarEvento(cronicaId, row.event_id);
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
        oraculoSync.reindexarNode(cronicaId, nodeId); // Regra 4.2: a chave da flag mudou no texto do node
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
        // Regra 4.2: removida a flag, re-indexa o node e os eventos cuja tensão foi recalculada.
        oraculoSync.reindexarNode(cronicaId, nodeId);
        for (const row of eventosVinculados.rows) oraculoSync.reindexarEvento(cronicaId, row.event_id);
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
        const query = await pool.query("SELECT id, nome, avatar_url FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'entidade' ORDER BY nome ASC", [cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar núcleos de entidades.' }); }
};

exports.criarNucleoEntidade = async (req, res) => {
    const { cronicaId } = req.params;
    const { nome } = req.body;
        try {
        const novo = await pool.query("INSERT INTO entidade_nucleos (cronica_id, nome, tipo) VALUES ($1, $2, 'entidade') RETURNING *", [cronicaId, nome.trim()]);
        oraculoSync.reindexarNucleo(cronicaId, novo.rows[0].id); // Regra 4.2: indexa a facção nova (nome pesquisável)
        res.status(201).json(novo.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao criar núcleo.' }); }
};

exports.renomearNucleoEntidade = async (req, res) => {
    const { cronicaId, nucleoId } = req.params;
    const { nome, avatar_url } = req.body;
    try {
        // Fatia 2: define também o brasão (avatar_url) quando enviado; null limpa.
        const temAvatar = Object.prototype.hasOwnProperty.call(req.body, 'avatar_url');
        let urlAntiga = null;
        if (temAvatar) { // Regra 6.6: brasão atual ANTES do update (escopo cronica_id)
            const prev = await pool.query('SELECT avatar_url FROM entidade_nucleos WHERE id = $1 AND cronica_id = $2', [nucleoId, cronicaId]);
            urlAntiga = prev.rows[0]?.avatar_url || null;
        }
        let result;
        if (temAvatar) {
            result = await pool.query('UPDATE entidade_nucleos SET nome = $1, avatar_url = $2 WHERE id = $3 AND cronica_id = $4 RETURNING *', [nome.trim(), avatar_url ?? null, nucleoId, cronicaId]);
        } else {
            result = await pool.query('UPDATE entidade_nucleos SET nome = $1 WHERE id = $2 AND cronica_id = $3 RETURNING *', [nome.trim(), nucleoId, cronicaId]);
        }
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        if (temAvatar && urlAntiga && urlAntiga !== (result.rows[0]?.avatar_url || null)) await apagarUploadOrfao(urlAntiga, ['nucleos']);
        oraculoSync.reindexarNucleo(cronicaId, nucleoId); // Regra 4.2: nome da facção mudou
        oraculoSync.reindexarMembrosDoNucleo(cronicaId, nucleoId); // Regra 4.2: membros carregam o nome da facção
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao renomear núcleo.' }); }
};

exports.excluirNucleoEntidade = async (req, res) => {
    const { cronicaId, nucleoId } = req.params;
    try {
        // Regra 4.2: captura os membros ANTES do delete — a FK desvincula-os (nucleo_id → NULL), então
        // depois não dá mais p/ achá-los por nucleo_id. Re-indexamos no fim p/ tirar a facção do texto.
        const membros = await pool.query('SELECT id FROM world_nodes WHERE nucleo_id = $1 AND cronica_id = $2', [nucleoId, cronicaId]);
        const result = await pool.query('DELETE FROM entidade_nucleos WHERE id = $1 AND cronica_id = $2 RETURNING id, avatar_url', [nucleoId, cronicaId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        await apagarUploadOrfao(result.rows[0]?.avatar_url || null, ['nucleos']); // Regra 6.6
        oraculoSync.removerEntidade(cronicaId, nucleoId); // Regra 4.2/6.6: apaga o doc `nucleo:id` (nada de facção zumbi)
        oraculoSync.reindexarNodes(cronicaId, membros.rows.map((m) => m.id)); // Regra 4.2: ex-membros perderam a facção
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
                    SELECT COALESCE(json_agg(json_build_object('node_id', w.node_id, 'node_nome', wn.nome, 'flag_key', w.flag_key, 'peso', w.peso)), '[]'::json)
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
        // F2: evento entra no escopo do Oráculo com texto rico (núcleos/gatilhos). Sem await.
        oraculoSync.reindexarEvento(cronicaId, novoEvento.id);
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
        // F2: remove o vetor do evento apagado.
        oraculoSync.removerEntidade(cronicaId, eventoId);
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
// Todos os vínculos da crônica numa só query — otimização do Tabuleiro: elimina o N+1 de
// `listarLinks` por nó (antes 1 request HTTP por card no board). Escopo por cronica_id isola
// tenants (Regra 3.3.1). Devolve as duas pontas cruas; o cliente filtra/dedupe para os nós do
// board. Payload mínimo (sem `dados`/joins) — só o necessário p/ desenhar as linhas.
exports.listarLinksCronica = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const result = await pool.query(
            `SELECT id, origem_node_id, destino_node_id, tipo_vinculo
               FROM world_links
              WHERE cronica_id = $1`,
            [cronicaId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao listar sinapses da crônica:', err);
        res.status(500).json({ erro: 'Erro ao buscar vínculos da crônica.' });
    }
};

exports.listarLinks = async (req, res) => {
    const { cronicaId, nodeId } = req.params;
    try {
        // Bidirecional: traz links onde o nó é origem OU destino, e devolve sempre
        // os dados do OUTRO nó (o conectado). Escopo por cronica_id isola tenants.
        const result = await pool.query(`
            SELECT
                l.id,
                l.tipo_vinculo,
                l.dados,
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
    const { destino_node_id, tipo_vinculo, dados } = req.body;

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
            INSERT INTO world_links (cronica_id, origem_node_id, destino_node_id, tipo_vinculo, dados)
            VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *
        `, [cronicaId, nodeId, destino_node_id, tipo_vinculo || 'associado', JSON.stringify(dados || {})]);
        // Regra 4.2: a sinapse aparece na seção "Relações" dos DOIS nós → re-indexa ambos.
        oraculoSync.reindexarNode(cronicaId, nodeId);
        oraculoSync.reindexarNode(cronicaId, destino_node_id);
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
            RETURNING id, origem_node_id, destino_node_id
        `, [linkId, cronicaId, nodeId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Conexão não encontrada.' });
        // Regra 4.2: a relação sumiu do texto dos DOIS nós → re-indexa ambos.
        oraculoSync.reindexarNode(cronicaId, result.rows[0].origem_node_id);
        oraculoSync.reindexarNode(cronicaId, result.rows[0].destino_node_id);
        res.json({ mensagem: 'Conexão desfeita.' });
    } catch (err) {
        console.error('Erro ao deletar sinapse:', err);
        res.status(500).json({ erro: 'Erro ao desfazer conexão.' });
    }
};

// Arestas Ricas (Fase 11): atualiza EXCLUSIVAMENTE o JSONB `dados` (intriga) de
// um link existente. Guard anti-IDOR (Regra 3.3.1) idêntico ao deletarLink: o
// link tem de ser da crônica E envolver o node da rota. Falha → 404.
exports.atualizarLink = async (req, res) => {
    const { cronicaId, nodeId, linkId } = req.params;
    const { dados } = req.body;
    try {
        const result = await pool.query(`
            UPDATE world_links
            SET dados = $1::jsonb
            WHERE id = $2 AND cronica_id = $3
              AND (origem_node_id = $4 OR destino_node_id = $4)
            RETURNING *
        `, [JSON.stringify(dados || {}), linkId, cronicaId, nodeId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Conexão não encontrada.' });
        // Regra 4.2: tags/intriga da sinapse aparecem no texto dos DOIS nós → re-indexa ambos.
        oraculoSync.reindexarNode(cronicaId, result.rows[0].origem_node_id);
        oraculoSync.reindexarNode(cronicaId, result.rows[0].destino_node_id);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao atualizar sinapse:', err);
        res.status(500).json({ erro: 'Erro ao atualizar detalhes da conexão.' });
    }
};

// =======================================================
// TABULEIROS DE CAMPANHA (FASE 13) — world_boards
// CRUD de layouts (snapshots) do Infinite Canvas. Todo acesso é escopado por
// cronica_id no WHERE (anti-IDOR, Regra 3.3.1); falha de posse → 404.
// =======================================================
exports.listarBoards = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const r = await pool.query(
            `SELECT id, nome, criado_em, atualizado_em
               FROM world_boards WHERE cronica_id = $1 ORDER BY atualizado_em DESC`,
            [cronicaId]
        );
        res.json(r.rows);
    } catch (err) {
        console.error('Erro ao listar tabuleiros:', err);
        res.status(500).json({ erro: 'Erro ao listar tabuleiros.' });
    }
};

// Sincronização viva: cruza os nós do JSONB com os world_nodes reais (escopo
// crônica) e remove os ausentes (+ overrides de linhas órfãos). NÃO grava no GET
// (evita escrita em leitura); devolve a versão limpa + flag para o cliente.
exports.buscarBoard = async (req, res) => {
    const { cronicaId, boardId } = req.params;
    try {
        const r = await pool.query(
            `SELECT id, nome, dados, criado_em, atualizado_em
               FROM world_boards WHERE id = $1 AND cronica_id = $2`,
            [boardId, cronicaId]
        );
        if (r.rows.length === 0) return res.status(404).json({ erro: 'Tabuleiro não encontrado.' });

        const board = r.rows[0];
        const dados = board.dados || {};
        const nodes = Array.isArray(dados.nodes) ? dados.nodes : [];
        let atualizado = false;

        if (nodes.length) {
            const ids = nodes.map(n => n && n.id).filter(Boolean);
            // Regra 6.2: lista parametrizada via array uuid; Regra 3.3.1: escopo crônica.
            const existentes = await pool.query(
                `SELECT id FROM world_nodes WHERE cronica_id = $1 AND id = ANY($2::uuid[])`,
                [cronicaId, ids]
            );
            const vivos = new Set(existentes.rows.map(x => String(x.id)));
            const nodesLimpos = nodes.filter(n => n && vivos.has(String(n.id)));
            if (nodesLimpos.length !== nodes.length) {
                atualizado = true;
                dados.nodes = nodesLimpos;
                if (dados.overrides_linhas && typeof dados.overrides_linhas === 'object') {
                    for (const chave of Object.keys(dados.overrides_linhas)) {
                        const [a, b] = String(chave).split('_'); // UUIDs não têm '_', split é seguro
                        if (!vivos.has(a) || !vivos.has(b)) delete dados.overrides_linhas[chave];
                    }
                }
                board.dados = dados;
            }
        }
        res.json({ ...board, atualizado_automaticamente: atualizado });
    } catch (err) {
        console.error('Erro ao buscar tabuleiro:', err);
        res.status(500).json({ erro: 'Erro ao carregar o tabuleiro.' });
    }
};

exports.criarBoard = async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, dados } = req.body;
    try {
        const r = await pool.query(
            `INSERT INTO world_boards (cronica_id, nome, dados)
             VALUES ($1, $2, $3::jsonb)
             RETURNING id, nome, dados, criado_em, atualizado_em`,
            [cronicaId, nome, JSON.stringify(dados || {})]
        );
        res.status(201).json(r.rows[0]);
    } catch (err) {
        console.error('Erro ao criar tabuleiro:', err);
        res.status(500).json({ erro: 'Erro ao criar o tabuleiro.' });
    }
};

exports.atualizarBoard = async (req, res) => {
    const { cronicaId, boardId } = req.params;
    const { nome, dados } = req.body;
    try {
        // Regra 6.6: se 'dados' troca/remove a imagem de fundo, o ficheiro antigo fica órfão.
        // Lê a url anterior ANTES do UPDATE (escopo cronica_id — anti-IDOR 3.3.1).
        let urlAntiga = null;
        if (dados) {
            const prev = await pool.query('SELECT dados FROM world_boards WHERE id = $1 AND cronica_id = $2', [boardId, cronicaId]);
            urlAntiga = prev.rows[0]?.dados?.fundoImagem?.url || null;
        }
        // COALESCE: atualiza só os campos enviados; sempre carimba atualizado_em.
        const r = await pool.query(
            `UPDATE world_boards
                SET nome = COALESCE($1, nome),
                    dados = COALESCE($2::jsonb, dados),
                    atualizado_em = now()
              WHERE id = $3 AND cronica_id = $4
              RETURNING id, nome, dados, criado_em, atualizado_em`,
            [nome ?? null, dados ? JSON.stringify(dados) : null, boardId, cronicaId]
        );
        if (r.rows.length === 0) return res.status(404).json({ erro: 'Tabuleiro não encontrado.' });
        const urlNova = r.rows[0]?.dados?.fundoImagem?.url || null;
        if (urlAntiga && urlAntiga !== urlNova) await apagarUploadOrfao(urlAntiga, ['fundos']);
        res.json(r.rows[0]);
    } catch (err) {
        console.error('Erro ao atualizar tabuleiro:', err);
        res.status(500).json({ erro: 'Erro ao salvar o tabuleiro.' });
    }
};

exports.deletarBoard = async (req, res) => {
    const { cronicaId, boardId } = req.params;
    try {
        const r = await pool.query(
            `DELETE FROM world_boards WHERE id = $1 AND cronica_id = $2 RETURNING id, dados`,
            [boardId, cronicaId]
        );
        if (r.rows.length === 0) return res.status(404).json({ erro: 'Tabuleiro não encontrado.' });
        await apagarUploadOrfao(r.rows[0]?.dados?.fundoImagem?.url || null, ['fundos']); // Regra 6.6
        res.json({ mensagem: 'Tabuleiro removido.' });
    } catch (err) {
        console.error('Erro ao deletar tabuleiro:', err);
        res.status(500).json({ erro: 'Erro ao remover o tabuleiro.' });
    }
};

// ============================================
// DIPLOMACIA (FASE 14) — nucleo_diplomacia (relações núcleo↔núcleo, escopo crônica)
// Contrato do front: { id, nucleoA, nucleoB, status }.
// ============================================
const mapDip = (x) => ({ id: x.id, nucleoA: x.nucleo_a_id, nucleoB: x.nucleo_b_id, status: x.status });

exports.listarDiplomacia = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const r = await pool.query(
            `SELECT id, nucleo_a_id, nucleo_b_id, status FROM nucleo_diplomacia WHERE cronica_id = $1`,
            [cronicaId]
        );
        res.json(r.rows.map(mapDip));
    } catch (err) {
        console.error('Erro ao listar diplomacia:', err);
        res.status(500).json({ erro: 'Erro ao listar diplomacia.' });
    }
};

// Substitui o conjunto inteiro de relações da crônica (bulk replace), em transação.
exports.salvarDiplomacia = async (req, res) => {
    const { cronicaId } = req.params;
    const relacoes = req.body.relacoes || [];
    const client = await pool.connect();
    try {
        // Anti-IDOR (Regra 3.3.1): todos os núcleos citados DEVEM pertencer a esta crônica.
        const idsCitados = [...new Set(relacoes.flatMap(r => [r.nucleoA, r.nucleoB]))];
        if (idsCitados.length) {
            const val = await client.query(
                `SELECT id FROM entidade_nucleos WHERE cronica_id = $1 AND id = ANY($2::uuid[])`,
                [cronicaId, idsCitados]
            );
            const validos = new Set(val.rows.map(x => String(x.id)));
            if (idsCitados.some(id => !validos.has(String(id)))) {
                return res.status(404).json({ erro: 'Núcleo inválido para esta crônica.' });
            }
        }
        await client.query('BEGIN');
        await client.query('DELETE FROM nucleo_diplomacia WHERE cronica_id = $1', [cronicaId]);
        for (const r of relacoes) {
            await client.query(
                `INSERT INTO nucleo_diplomacia (cronica_id, nucleo_a_id, nucleo_b_id, status)
                 VALUES ($1, $2, $3, $4)`,
                [cronicaId, r.nucleoA, r.nucleoB, r.status]
            );
        }
        await client.query('COMMIT');
        const out = await client.query(
            `SELECT id, nucleo_a_id, nucleo_b_id, status FROM nucleo_diplomacia WHERE cronica_id = $1`,
            [cronicaId]
        );
        // Regra 4.2: diplomacia é bulk-replace (relações somem/surgem entre várias facções) → re-indexa
        // todas as facções da crônica para refletir a nova linha "Diplomacia" no texto de cada uma.
        oraculoSync.reindexarNucleosDaCronica(cronicaId);
        res.json(out.rows.map(mapDip));
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Erro ao salvar diplomacia:', err);
        res.status(500).json({ erro: 'Erro ao salvar diplomacia.' });
    } finally {
        client.release();
    }
};

// =======================================================
// ORÁCULO (RAG) — Fatia 3: Big Bang (sincronização inicial)
// Popula o banco vetorial com o mundo que JÁ existe no Postgres desta crônica.
// Só Narrador (apenasNarrador na rota) + escopo cronica_id em toda query (Regras 3.3.1/6.2).
// Idempotente: o id no Chroma é tipo:entidade_id → re-sincronizar SOBRESCREVE, nunca duplica
// (oraculo.md §5/F3). Escopo espelha o que a F2 escreve: world_nodes + world_events + sessões
// (chunking) + automações (vetor único — texto curto condição→efeito).
// =======================================================
const sleepOraculo = (ms) => new Promise((r) => setTimeout(r, ms));

exports.sincronizarOraculo = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        // Gate grosso: serviço configurado no servidor? Sem isto o envio é no-op silencioso —
        // então respondemos claro em vez de fingir sucesso (Regra 3.2).
        if (!oraculoClient.oraculoConfigurado()) {
            return res.status(503).json({ erro: 'O serviço do Oráculo não está configurado neste servidor.' });
        }

        // Gate fino (opt-in por crônica): só sincroniza se o Narrador ligou o Oráculo nesta mesa.
        const cron = await pool.query('SELECT oraculo_ativo FROM cronicas WHERE id = $1', [cronicaId]);
        if (cron.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });
        if (!cron.rows[0].oraculo_ativo) {
            return res.status(409).json({ erro: 'O Oráculo está desligado nesta crônica. Ative-o antes de sincronizar.' });
        }

        // Lista os ids do mundo da crônica (escopo cronica_id — Regras 3.3.1/6.2). O TEXTO RICO de
        // cada um é montado pelos describers (mesma fonte dos ganchos da F2 — DRY). Inclui NÚCLEOS/
        // facções (membros + diplomacia), que os ganchos individuais ainda não cobrem.
        const nodesQ = await pool.query('SELECT id, tipo FROM world_nodes WHERE cronica_id = $1', [cronicaId]);
        const nucleosQ = await pool.query("SELECT id FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'entidade'", [cronicaId]);
        const eventosQ = await pool.query('SELECT id FROM world_events WHERE cronica_id = $1', [cronicaId]);
        const sessoesQ = await pool.query('SELECT id FROM sessoes WHERE cronica_id = $1', [cronicaId]);
        const automacoesQ = await pool.query('SELECT id FROM world_triggers WHERE cronica_id = $1', [cronicaId]);

        // Cada alvo declara sua AÇÃO: nodes/núcleos/eventos = doc único (`upsert`); sessões = texto longo
        // → CHUNKING (`upsert_chunks`, §4.4/5). 'upsert' é o default.
        const alvos = [
            ...nodesQ.rows.map((n) => ({ tipo: n.tipo, id: n.id, montar: () => oraculoTexto.textoDoNode(cronicaId, n.id) })),
            ...nucleosQ.rows.map((x) => ({ tipo: 'nucleo', id: x.id, montar: () => oraculoTexto.textoDoNucleo(cronicaId, x.id) })),
            ...eventosQ.rows.map((e) => ({ tipo: 'evento', id: e.id, montar: () => oraculoTexto.textoDoEvento(cronicaId, e.id) })),
            ...sessoesQ.rows.map((s) => ({ tipo: 'sessao', id: s.id, acao: 'upsert_chunks', montar: () => oraculoTexto.textoDaSessao(cronicaId, s.id) })),
            ...automacoesQ.rows.map((a) => ({ tipo: 'automacao', id: a.id, montar: () => oraculoTexto.textoDaAutomacao(cronicaId, a.id) })),
        ];

        // Envia em lotes pequenos com pausa entre eles — backpressure p/ não pregar a CPU do
        // servidor modesto nem estourar o rate-limit de embeddings (oraculo.md §5/F3).
        const TAMANHO_LOTE = 10;
        let enviados = 0;
        for (let i = 0; i < alvos.length; i += TAMANHO_LOTE) {
            const lote = alvos.slice(i, i + TAMANHO_LOTE);
            const resultados = await Promise.all(lote.map(async (a) => {
                const texto = await a.montar();
                if (!texto) return false; // entidade sumiu entre o list e o montar
                return oraculoClient.enviarParaOraculoAsync(a.acao || 'upsert', { cronica_id: cronicaId, tipo: a.tipo, entidade_id: a.id, texto });
            }));
            enviados += resultados.filter(Boolean).length;
            if (i + TAMANHO_LOTE < alvos.length) await sleepOraculo(150);
        }

        res.json({
            mensagem: 'Sincronização com o Oráculo concluída.',
            total: alvos.length,
            enviados,
            falhas: alvos.length - enviados,
        });
    } catch (err) {
        console.error('Erro na sincronização do Oráculo (Big Bang):', err);
        res.status(500).json({ erro: 'Erro ao sincronizar o mundo com o Oráculo.' });
    }
};

// =======================================================
// ORÁCULO (RAG) — Fatia 4: Consulta (o cérebro / RAG)
// Proxy: decifra a chave BYOK do Narrador (em memória), repassa ao Python a pergunta + a chave +
// a crônica JÁ validada (anti-IDOR no retrieval é feito lá com where={cronica_id}). Só Narrador
// (apenasNarrador na rota). A chave nunca é logada nem volta ao frontend (oraculo.md §4.4 / Regra 6).
// =======================================================
exports.consultarOraculo = async (req, res) => {
    const { cronicaId } = req.params;
    const { pergunta, historico } = req.body; // historico: memória multi-turn (Zod já validou/limitou)
    try {
        // Gate grosso: serviço configurado no servidor?
        if (!oraculoClient.oraculoConfigurado()) {
            return res.status(503).json({ erro: 'O serviço do Oráculo não está configurado neste servidor.' });
        }

        // Gate fino opt-in por crônica.
        const cron = await pool.query('SELECT oraculo_ativo FROM cronicas WHERE id = $1', [cronicaId]);
        if (cron.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });
        if (!cron.rows[0].oraculo_ativo) {
            return res.status(409).json({ erro: 'O Oráculo está desligado nesta crônica. Ative-o antes de consultar.' });
        }

        // BYOK: a chave de geração é do PRÓPRIO Narrador (req.usuario.id), não da crônica.
        const u = await pool.query(
            'SELECT oraculo_gen_key, oraculo_gen_url, oraculo_gen_model FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        const conf = u.rows[0] || {};
        if (!conf.oraculo_gen_key) {
            return res.status(400).json({ erro: 'Configure a sua chave de IA (BYOK) no perfil antes de consultar o Oráculo.' });
        }

        let chave;
        try {
            chave = oraculoCripto.decifrar(conf.oraculo_gen_key); // só aqui, em memória
        } catch (e) {
            console.error('Falha ao decifrar a chave BYOK:', e.message); // sem logar a chave
            return res.status(500).json({ erro: 'A sua chave de IA está corrompida (ou a ENC_KEY mudou). Regrave-a no perfil.' });
        }

        // Chama o Python (espera a resposta). A chave decifrada só trafega na chamada interna 127.0.0.1.
        let resposta;
        try {
            resposta = await oraculoClient.consultarOraculo({
                cronica_id: cronicaId,
                pergunta,
                historico: historico || [],
                api_key_llm: chave,
                base_url_llm: conf.oraculo_gen_url || 'https://api.deepseek.com',
                model_llm: conf.oraculo_gen_model || 'deepseek-chat',
            });
        } catch (e) {
            console.error('Oráculo (consultar) falhou:', e.message);
            return res.status(502).json({ erro: 'O Oráculo não conseguiu responder agora. Verifique a sua chave de IA e tente de novo.' });
        }

        res.json(resposta); // { status, resposta_oraculo, trechos_usados } | { status:'sem_contexto', resposta_oraculo }
    } catch (err) {
        console.error('Erro ao consultar o Oráculo:', err);
        res.status(500).json({ erro: 'Erro ao consultar o Oráculo.' });
    }
};