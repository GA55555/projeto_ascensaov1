// services/oraculoSync.js
// Re-indexação fire-and-forget do Oráculo (Regra 4.2): QUALQUER mutação que altere o TEXTO RICO de
// uma entidade (flags, sinapses, facção/núcleo, diplomacia, tensão de evento) reflete no banco
// vetorial sem atrasar a tela e SEM jamais derrubar o caminho de quem chama. Combina o describer
// (oraculoTexto — lê o Postgres, escopado por cronica_id) com o conector (oraculoClient — fala com o
// Python em 127.0.0.1). Fonte ÚNICA da re-indexação (DRY): os ganchos dos controllers só chamam isto.

const pool = require('../db');
const oraculoClient = require('./oraculoClient');
const oraculoTexto = require('./oraculoTexto');

// Re-indexa um NODE (npc/faccao/local). O id no Chroma é `tipo:id` → o tipo PRECISA ser o real do
// node (senão criaria um doc duplicado em vez de sobrescrever). Se o chamador já tem o tipo (vindo de
// um RETURNING), passe-o; senão o helper o resolve com uma query barata (caminho de fundo, sem await).
function reindexarNode(cronicaId, nodeId, tipo) {
    if (!oraculoClient.oraculoConfigurado()) return; // gate grosso → no-op
    (async () => {
        try {
            if (!tipo) {
                const r = await pool.query('SELECT tipo FROM world_nodes WHERE id = $1 AND cronica_id = $2', [nodeId, cronicaId]);
                if (!r.rows.length) return; // node já não existe / não é desta crônica
                tipo = r.rows[0].tipo;
            }
            const texto = await oraculoTexto.textoDoNode(cronicaId, nodeId);
            if (texto) oraculoClient.enviarParaOraculo('upsert', { cronica_id: cronicaId, tipo, entidade_id: nodeId, texto });
        } catch (err) {
            console.error('[oraculo] reindexarNode falhou (seguindo):', err.message);
        }
    })();
}

// Re-indexa um NÚCLEO/FACÇÃO (`nucleo:id`): membros + diplomacia.
function reindexarNucleo(cronicaId, nucleoId) {
    if (!oraculoClient.oraculoConfigurado()) return;
    oraculoTexto.textoDoNucleo(cronicaId, nucleoId)
        .then(texto => { if (texto) oraculoClient.enviarParaOraculo('upsert', { cronica_id: cronicaId, tipo: 'nucleo', entidade_id: nucleoId, texto }); })
        .catch(err => console.error('[oraculo] reindexarNucleo falhou (seguindo):', err.message));
}

// Re-indexa um EVENTO (`evento:id`): estado/tensão, núcleos e gatilhos.
function reindexarEvento(cronicaId, eventoId) {
    if (!oraculoClient.oraculoConfigurado()) return;
    oraculoTexto.textoDoEvento(cronicaId, eventoId)
        .then(texto => { if (texto) oraculoClient.enviarParaOraculo('upsert', { cronica_id: cronicaId, tipo: 'evento', entidade_id: eventoId, texto }); })
        .catch(err => console.error('[oraculo] reindexarEvento falhou (seguindo):', err.message));
}

// Re-indexa TODOS os núcleos-facção (tipo 'entidade') de uma crônica. Usado pela diplomacia, que é
// um bulk-replace: relações somem/surgem entre vários núcleos de uma vez. Bounded pelo nº de facções.
function reindexarNucleosDaCronica(cronicaId) {
    if (!oraculoClient.oraculoConfigurado()) return;
    (async () => {
        try {
            const r = await pool.query("SELECT id FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'entidade'", [cronicaId]);
            for (const row of r.rows) reindexarNucleo(cronicaId, row.id);
        } catch (err) {
            console.error('[oraculo] reindexarNucleosDaCronica falhou (seguindo):', err.message);
        }
    })();
}

// Remove o vetor de uma entidade apagada (node/evento/núcleo). Apaga por metadata {cronica_id,
// entidade_id} — varre todos os `tipo:id` daquela entidade. Já é fire-and-forget no conector.
function removerEntidade(cronicaId, entidadeId) {
    oraculoClient.enviarParaOraculo('remover', { cronica_id: cronicaId, entidade_id: entidadeId });
}

module.exports = {
    reindexarNode, reindexarNucleo, reindexarEvento, reindexarNucleosDaCronica, removerEntidade,
};
