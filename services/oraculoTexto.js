// services/oraculoTexto.js
// Monta o TEXTO RICO que é indexado no banco vetorial (Oráculo/RAG). Quanto mais relações o texto
// carrega (facção, local, flags de estado, sinapses, diplomacia, gatilhos), mais padrões narrativos
// o RAG consegue recuperar. Fonte ÚNICA da verdade do texto — reusado pelo Big Bang (F3) e pelos
// ganchos da F2 (DRY). Tudo escopado por cronica_id (anti-IDOR 3.3.1) e parametrizado (Regra 6.2);
// defensivo contra jsonb corrompido (Regra 4.2) — nunca deve derrubar o caminho de quem chama.

const pool = require('../db');
const escala = require('./relacaoEscala'); // reta bipolar -10..+10 da relação (fonte única da lógica)
const tarot = require('./tarotCatalogo');  // catálogo dos 22 arcanos (Jornada do Herói) — contexto p/ a IA

const simNao = (v) => (v ? 'sim' : 'não');

// Arquétipo (Tarot) da entidade/núcleo → contexto narrativo p/ a IA. `dados.tarot = {carta_num,
// orientacao}`; nome/estágio/significado vêm do catálogo. Defensivo contra jsonb sujo (Regra 4.2).
function descreverTarot(dados) {
    const t = (dados && typeof dados === 'object') ? dados.tarot : null;
    if (!t || typeof t !== 'object') return null;
    const carta = tarot.cartaPorNum(t.carta_num);
    if (!carta) return null;
    const invertida = t.orientacao === -1;
    const sig = invertida ? carta.sig_invertida : carta.sig_pe;
    return `Arquétipo (Tarot): ${carta.nome} ${invertida ? 'invertida' : 'em pé'} — estágio "${carta.estagio}"; ${sig}`;
}

// Lê com segurança um campo de texto do jsonb 'dados' (pode vir nulo/sujo).
function descricaoDoDados(dados) {
    if (!dados || typeof dados !== 'object') return null;
    const d = dados.descricao || dados.notas || dados.bio;
    return typeof d === 'string' && d.trim() ? d.trim() : null;
}

// "Contrato de Relação" no RAG: lê a RETA BIPOLAR (-10..+10) da sinapse (reta_relacao.md) e descreve os
// incidentes/motivos ASSINADOS (+ aproximam, − afastam) e a posição/lado atual — p/ a IA entender a
// valência e a tendência da relação. Substitui o antigo termômetro de pressão (evolução). `tipoVinculo`
// serve p/ inferir o sinal de tags LEGADAS (string) — decisão 5. Lógica/normalização vêm de relacaoEscala.
function descreverContrato(dados, tipoVinculo) {
    const { posicao, tier, tags, min, max } = escala.lerRelacao(dados, tipoVinculo);
    const partes = [];
    const pos = tags.filter((t) => t.sinal > 0).map((t) => t.texto);
    const neg = tags.filter((t) => t.sinal < 0).map((t) => t.texto);
    const semSinal = tags.filter((t) => t.sinal === 0).map((t) => t.texto);
    if (pos.length) partes.push(`fatores de aproximação: ${pos.join('; ')}`);
    if (neg.length) partes.push(`fatores de afastamento: ${neg.join('; ')}`);
    if (semSinal.length) partes.push(`registros sem polaridade definida: ${semSinal.join('; ')}`);
    const lado = tier.nivel === 'neutro' ? 'relação neutra' : tier.rotulo;
    partes.push(`posição ${posicao} (${lado}) numa reta de ${min} (inimizade total) a ${max} (lealdade total)`);
    return partes.join('; ');
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
    const arquetipo = descreverTarot(n.dados);
    if (arquetipo) linhas.push(arquetipo);

    // Flags = estado narrativo (variáveis de mundo).
    const flagsQ = await pool.query(
        'SELECT flag_key, flag_value FROM world_flags WHERE node_id = $1 ORDER BY flag_key',
        [nodeId]
    );
    if (flagsQ.rows.length) {
        linhas.push(`Estado (flags): ${flagsQ.rows.map(f => `${f.flag_key}=${simNao(f.flag_value)}`).join(', ')}`);
    }

    // Sinapses = relações bidirecionais. Cada uma tem um "Contrato de Relação" (incidentes/motivos
    // assinados numa reta -10..+10) → a IA lê a valência (aliado/inimigo) e a posição atual da relação.
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
        linhas.push('Relações (Contrato de Relação):');
        for (const r of linksQ.rows) {
            linhas.push(`- ${r.tipo_vinculo || 'associado'} com ${r.outro_nome} (${r.outro_tipo}) — ${descreverContrato(r.dados, r.tipo_vinculo)}`);
        }
    }

    return linhas.join('\n');
}

/** Texto rico de um NÚCLEO/FACÇÃO: membros + diplomacia (aliados/inimigos/neutros). */
async function textoDoNucleo(cronicaId, nucleoId) {
    const nucQ = await pool.query(
        'SELECT nome, dados FROM entidade_nucleos WHERE id = $1 AND cronica_id = $2',
        [nucleoId, cronicaId]
    );
    if (nucQ.rows.length === 0) return null;
    const linhas = [`Facção/Núcleo: ${nucQ.rows[0].nome}`];
    const arquetipo = descreverTarot(nucQ.rows[0].dados);
    if (arquetipo) linhas.push(arquetipo);

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

/** Texto rico de uma SESSÃO (diário de campanha): título, data, estado, grupo, personagens/eventos
 *  citados (resolve os UUIDs → nomes), desfechos e o RESUMO (texto longo → o Python fatia em chunks). */
async function textoDaSessao(cronicaId, sessaoId) {
    const sQ = await pool.query(
        `SELECT s.titulo, s.data_sessao, s.status, s.resumo, s.desfechos, s.entidades, s.eventos,
                en.nome AS nucleo_nome
           FROM sessoes s
           LEFT JOIN entidade_nucleos en ON s.nucleo_id = en.id
          WHERE s.id = $1 AND s.cronica_id = $2`,
        [sessaoId, cronicaId]
    );
    if (sQ.rows.length === 0) return null;
    const s = sQ.rows[0];

    const linhas = [`Sessão: ${s.titulo}`];
    if (s.data_sessao) linhas.push(`Data: ${String(s.data_sessao).slice(0, 10)}`);
    if (s.status) linhas.push(`Estado: ${s.status}`);
    if (s.nucleo_nome) linhas.push(`Grupo/Núcleo: ${s.nucleo_nome}`);

    // entidades/eventos são arrays jsonb de UUIDs → resolve nomes (escopado por cronica_id).
    const entIds = Array.isArray(s.entidades) ? s.entidades.filter(Boolean) : [];
    if (entIds.length) {
        const r = await pool.query(
            'SELECT nome FROM world_nodes WHERE cronica_id = $1 AND id = ANY($2::uuid[]) ORDER BY nome',
            [cronicaId, entIds]
        );
        if (r.rows.length) linhas.push(`Personagens presentes: ${r.rows.map(x => x.nome).join(', ')}`);
    }
    const evIds = Array.isArray(s.eventos) ? s.eventos.filter(Boolean) : [];
    if (evIds.length) {
        const r = await pool.query(
            'SELECT nome FROM world_events WHERE cronica_id = $1 AND id = ANY($2::uuid[]) ORDER BY nome',
            [cronicaId, evIds]
        );
        if (r.rows.length) linhas.push(`Eventos relacionados: ${r.rows.map(x => x.nome).join(', ')}`);
    }

    const desf = Array.isArray(s.desfechos) ? s.desfechos.filter(d => typeof d === 'string' && d.trim()) : [];
    if (desf.length) linhas.push(`Desfechos: ${desf.join('; ')}`);
    if (typeof s.resumo === 'string' && s.resumo.trim()) linhas.push(`Resumo: ${s.resumo.trim()}`);

    return linhas.join('\n');
}

// Resolve o nome de um recurso por id, escopado por cronica_id. A tabela vem de um WHITELIST fixo
// (nunca de input do utilizador) — coerente com a Regra 6.2 (sem SQL dinâmico de fonte externa).
// Defensivo: id sujo/não-uuid faria o cast estourar → try/catch devolve null em vez de derrubar.
async function nomePorId(chaveTabela, cronicaId, id) {
    if (!id) return null;
    const tabelas = { node: 'world_nodes', nucleo: 'entidade_nucleos' };
    const tabela = tabelas[chaveTabela];
    if (!tabela) return null;
    try {
        const r = await pool.query(`SELECT nome FROM ${tabela} WHERE id = $1 AND cronica_id = $2`, [id, cronicaId]);
        return r.rows[0]?.nome || null;
    } catch {
        return null;
    }
}

// Traduz o EFEITO de uma automação (effect_json) para linguagem natural, resolvendo ids → nomes.
// Os 'parametros' vêm do jsonb e podem estar incompletos/sujos → tudo com fallback (Regra 4.2).
async function efeitoDaAutomacao(cronicaId, tipo, p) {
    switch (tipo) {
        case 'criar_flag': {
            const alvo = await nomePorId('node', cronicaId, p.node_id);
            return `cria o marco "${p.flag_key || '?'}" (valor inicial ${simNao(p.valor_inicial)})${alvo ? ` na entidade ${alvo}` : ''}`;
        }
        case 'alterar_flag': {
            const alvo = await nomePorId('node', cronicaId, p.node_id);
            return `altera o marco "${p.flag_key || '?'}" para ${simNao(p.novo_valor)}${alvo ? ` na entidade ${alvo}` : ''}`;
        }
        case 'postar_em_aba':
            return p.conteudo ? `publica no diário: "${p.conteudo}"` : 'publica uma postagem no diário';
        case 'criar_evento':
            return `cria o evento "${p.nome || '?'}"${p.descricao ? `: ${p.descricao}` : ''}`;
        case 'criar_entidade': {
            const nucleo = await nomePorId('nucleo', cronicaId, p.nucleo_id);
            return `cria a entidade ${p.tipo || ''} "${p.nome || '?'}"${nucleo ? ` na facção ${nucleo}` : ''}`.replace(/\s{2,}/g, ' ');
        }
        default:
            return `executa a ação "${tipo || 'desconhecida'}"`;
    }
}

/** Texto rico de uma AUTOMAÇÃO (regra reativa `world_triggers`): "quando o evento X ocorre → efeito Y".
 *  É texto CURTO e estruturado (condição + efeito), NÃO precisa de chunking → indexado como vetor único
 *  `automacao:id`. Resolve nomes (evento-gatilho, node-alvo, facção) p/ leitura humana do RAG. */
async function textoDaAutomacao(cronicaId, automacaoId) {
    const tQ = await pool.query(
        `SELECT t.ativo,
                t.effect_json->>'tipo_nome' AS tipo_nome,
                t.effect_json->'parametros' AS parametros,
                e.nome AS evento_nome
           FROM world_triggers t
           LEFT JOIN world_events e ON (t.condition_json->>'evento_id')::uuid = e.id
          WHERE t.id = $1 AND t.cronica_id = $2`,
        [automacaoId, cronicaId]
    );
    if (tQ.rows.length === 0) return null;
    const t = tQ.rows[0];
    const params = (t.parametros && typeof t.parametros === 'object') ? t.parametros : {};

    const gatilho = t.evento_nome ? `quando o evento "${t.evento_nome}" ocorre` : 'quando o evento-gatilho ocorre';
    const efeito = await efeitoDaAutomacao(cronicaId, t.tipo_nome, params);

    return [
        `Automação (regra reativa): ${gatilho}, ${efeito}.`,
        `Estado: ${t.ativo ? 'armada (ativa)' : 'desarmada (inativa)'}.`,
    ].join('\n');
}

module.exports = { textoDoNode, textoDoNucleo, textoDoEvento, textoDaSessao, textoDaAutomacao };
