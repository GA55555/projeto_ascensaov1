// services/reputacaoEscala.js
// Reputação (reputacao.md): FAMA/INFÂMIA GLOBAL da entidade numa reta bipolar -10..+10, event-sourced —
// cada evento de reputação é um PASSO assinado (+ fama avança rumo a +10, − infâmia recua rumo a -10). A
// posição é DERIVADA da soma dos passos (fonte única = o log de eventos; nunca um contador mutável), com
// clamp ±10 e lossless (remover o evento traz a agulha de volta). Reusa o núcleo numérico de relacaoEscala
// (clamp/passoDaTag — mesmo motor da Reta). É a FONTE ÚNICA da lógica; o front tem um espelho (sem build →
// manter a tabela de tiers em sync com reputacao.md §1.5). Defensivo contra jsonb sujo (Regra 4.2).

const { POS_MIN, POS_MAX, clamp, passoDaTag } = require('./relacaoEscala');

// Tiers de reputação (reputacao.md §1.5): a MAGNITUDE dá a intensidade; o SINAL dá o lado (fama +, infâmia −).
function tierReputacao(posicao) {
    const m = Math.abs(posicao);
    if (m === 0) return { nivel: 'neutro', rotulo: 'Desconhecido', lado: 'neutro' };
    const lado = posicao > 0 ? 'fama' : 'infamia';
    if (m <= 3) return { nivel: 'leve', rotulo: lado === 'fama' ? 'Conhecido' : 'Malvisto', lado };
    if (m <= 7) return { nivel: 'moderado', rotulo: lado === 'fama' ? 'Respeitado' : 'Temido', lado };
    return { nivel: 'extremo', rotulo: lado === 'fama' ? 'Reverenciado' : 'Odiado', lado };
}

// Normaliza os eventos do jsonb p/ {id, texto, sinal, peso}. Feature nova → sem shape legado; apenas
// defensivo (Regra 4.2): descarta entradas sem texto. PESO_REP: peso default 1 (gancho futuro).
function normalizarEventos(brutos) {
    if (!Array.isArray(brutos)) return [];
    const out = [];
    for (const e of brutos) {
        if (e && typeof e === 'object' && typeof e.texto === 'string' && e.texto.trim()) {
            const sinal = e.sinal === -1 ? -1 : (e.sinal === 1 ? 1 : 0);
            out.push({
                id: typeof e.id === 'string' ? e.id : null,
                texto: e.texto.trim(),
                sinal,
                peso: Math.max(parseInt(e.peso, 10) || 1, 1), // PESO_REP: default 1
            });
        }
    }
    return out;
}

// Leitura completa da reputação a partir do jsonb `dados` (lê dados.reputacao.eventos).
function lerReputacao(dados) {
    const eventos = normalizarEventos(dados && dados.reputacao && dados.reputacao.eventos);
    const posicao = clamp(eventos.reduce((soma, e) => soma + passoDaTag(e), 0));
    return { posicao, tier: tierReputacao(posicao), eventos, min: POS_MIN, max: POS_MAX };
}

module.exports = { POS_MIN, POS_MAX, clamp, tierReputacao, normalizarEventos, lerReputacao };
