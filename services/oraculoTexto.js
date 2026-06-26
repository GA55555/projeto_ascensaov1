// services/oraculoTexto.js
// Monta o TEXTO RICO que é indexado no banco vetorial (Oráculo/RAG). Quanto mais relações o texto
// carrega (facção, local, flags de estado, sinapses, diplomacia, gatilhos), mais padrões narrativos
// o RAG consegue recuperar. Fonte ÚNICA da verdade do texto — reusado pelo Big Bang (F3) e pelos
// ganchos da F2 (DRY). Tudo escopado por cronica_id (anti-IDOR 3.3.1) e parametrizado (Regra 6.2);
// defensivo contra jsonb corrompido (Regra 4.2) — nunca deve derrubar o caminho de quem chama.

const pool = require('../db');

const simNao = (v) => (v ? 'sim' : 'não');

// Lê com segurança um campo de texto do jsonb 'dados' (pode vir nulo/sujo).
function descricaoDoDados(dados) {
    if (!dados || typeof dados !== 'object') return null;
    const d = dados.descricao || dados.notas || dados.bio;
    return typeof d === 'string' && d.trim() ? d.trim() : null;
}

/** Texto rico de uma ENTIDADE (npc/faccao/local…): facção, local-pai, flags e sinapses. */
async function textoDoNode(cronicaId, nodeId) {
    const nodeQ = await pool.query(
        `SELECT n.nome, n.tipo, n.dados,
                en.nome AS nucleo_nome,
                p.nome  AS parent_nome, p.tipo AS parent_tipo
           FROM world_nodes n
           LEFT JOIN entidade_nucleos en ON n.nucleo_id = en.id
           LEFT JOIN world_nodes p ON n.parent_node_id = p.id
          WHERE n.id = $1 AND n.cronica_id = $2`,
        [nodeId, cronicaId]
    );
    if (nodeQ.rows.length === 0) return null;
    const n = nodeQ.rows[0];

    const linhas = [`Nome: ${n.nome}`, `Tipo: ${n.tipo}`];
    if (n.nucleo_nome) linhas.push(`Facção/Núcleo: ${n.nucleo_nome}`);
    if (n.parent_nome) linhas.push(`Local/Pertence a: ${n.parent_nome} (${n.parent_tipo})`);
    const desc = descricaoDoDados(n.dados);
    if (desc) linhas.push(`Descrição: ${desc}`);

    // Flags = estado narrativo (variáveis de mundo).
    const flagsQ = await pool.query(
        'SELECT flag_key, flag_value FROM world_flags WHERE node_id = $1 ORDER BY flag_key',
        [nodeId]
    );
    if (flagsQ.rows.length) {
        linhas.push(`Estado (flags): ${flagsQ.rows.map(f => `${f.flag_key}=${simNao(f.flag_value)}`).join(', ')}`);
    }

    // Sinapses = relações bidirecionais (sempre o nome do OUTRO nó + tipo de vínculo + tags).
    const linksQ = await pool.query(
        `SELECT l.tipo_vinculo, l.dados,
                CASE WHEN l.origem_node_id = $1 THEN dst.nome ELSE src.nome END AS outro_nome,
                CASE WHEN l.origem_node_id = $1 THEN dst.tipo ELSE src.tipo END AS outro_tipo
           FROM world_links l
           JOIN world_nodes src ON src.id = l.origem_node_id
           JOIN world_nodes dst ON dst.id = l.destino_node_id
          WHERE l.cronica_id = $2 AND (l.origem_node_id = $1 OR l.destino_node_id = $1)`,
        [nodeId, cronicaId]
    );
    if (linksQ.rows.length) {
        const rel = linksQ.rows.map(r => {
            const tags = r.dados && Array.isArray(r.dados.tags) && r.dados.tags.length ? ` [${r.dados.tags.join(', ')}]` : '';
            return `${r.tipo_vinculo || 'associado'} → ${r.outro_nome} (${r.outro_tipo})${tags}`;
        }).join('; ');
        linhas.push(`Relações: ${rel}`);
    }

    return linhas.join('\n');
}

/** Texto rico de um NÚCLEO/FACÇÃO: membros + diplomacia (aliados/inimigos/neutros). */
async function textoDoNucleo(cronicaId, nucleoId) {
    const nucQ = await pool.query(
        'SELECT nome FROM entidade_nucleos WHERE id = $1 AND cronica_id = $2',
        [nucleoId, cronicaId]
    );
    if (nucQ.rows.length === 0) return null;
    const linhas = [`Facção/Núcleo: ${nucQ.rows[0].nome}`];

    const membrosQ = await pool.query(
        'SELECT nome, tipo FROM world_nodes WHERE nucleo_id = $1 AND cronica_id = $2 ORDER BY nome',
        [nucleoId, cronicaId]
    );
    if (membrosQ.rows.length) {
        linhas.push(`Membros: ${membrosQ.rows.map(m => `${m.nome} (${m.tipo})`).join(', ')}`);
    }

    // Diplomacia: resolve sempre o nome do OUTRO núcleo + o status da relação.
    const dipQ = await pool.query(
        `SELECT d.status,
                CASE WHEN d.nucleo_a_id = $1 THEN nb.nome ELSE na.nome END AS outro_nome
           FROM nucleo_diplomacia d
           JOIN entidade_nucleos na ON na.id = d.nucleo_a_id
           JOIN entidade_nucleos nb ON nb.id = d.nucleo_b_id
          WHERE d.cronica_id = $2 AND (d.nucleo_a_id = $1 OR d.nucleo_b_id = $1)`,
        [nucleoId, cronicaId]
    );
    if (dipQ.rows.length) {
        linhas.push(`Diplomacia: ${dipQ.rows.map(d => `${d.status} de ${d.outro_nome}`).join('; ')}`);
    }

    return linhas.join('\n');
}

/** Texto rico de um EVENTO: estado/tensão, núcleos envolvidos e gatilhos (flags que o disparam). */
async function textoDoEvento(cronicaId, eventoId) {
    const evQ = await pool.query(
        'SELECT nome, descricao, status, pool_maxima, pool_atual FROM world_events WHERE id = $1 AND cronica_id = $2',
        [eventoId, cronicaId]
    );
    if (evQ.rows.length === 0) return null;
    const e = evQ.rows[0];
    const linhas = [`Evento: ${e.nome}`];
    if (e.descricao) linhas.push(`Descrição: ${e.descricao}`);
    if (e.status) linhas.push(`Estado: ${e.status} (tensão ${e.pool_atual ?? 0}/${e.pool_maxima ?? '?'})`);

    const nucQ = await pool.query(
        `SELECT en.nome
           FROM event_nucleos evn JOIN entidade_nucleos en ON en.id = evn.nucleo_id
          WHERE evn.event_id = $1`,
        [eventoId]
    );
    if (nucQ.rows.length) linhas.push(`Núcleos envolvidos: ${nucQ.rows.map(x => x.nome).join(', ')}`);

    const gatQ = await pool.query(
        `SELECT w.flag_key, w.peso, wn.nome AS node_nome
           FROM event_flag_weights w JOIN world_nodes wn ON wn.id = w.node_id
          WHERE w.event_id = $1`,
        [eventoId]
    );
    if (gatQ.rows.length) {
        linhas.push(`Gatilhos: ${gatQ.rows.map(x => `${x.node_nome}:${x.flag_key} (peso ${x.peso})`).join('; ')}`);
    }

    return linhas.join('\n');
}

module.exports = { textoDoNode, textoDoNucleo, textoDoEvento };
