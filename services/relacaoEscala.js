// services/relacaoEscala.js
// "Reta de Relação" (substitui o termômetro de pressão): escala BIPOLAR de -10 a +10. Cada incidente/
// motivo (tag) é um PASSO assinado — positivo (aliado) avança rumo a +10, negativo (inimigo) recua rumo
// a -10. A posição é DERIVADA da soma dos passos (fonte única = o log de tags; nunca um contador mutável),
// limitada a ±10 (clamp). É a FONTE ÚNICA da lógica da reta; o front terá um espelho (sem build → manter
// em sync com a tabela de tiers do reta_relacao.md §1.1). Defensivo contra jsonb sujo (Regra 4.2).

const POS_MIN = -10;
const POS_MAX = 10;

const clamp = (n) => Math.max(POS_MIN, Math.min(POS_MAX, n));

// Tiers (decisão 1, aprovada): a MAGNITUDE da posição dá a intensidade; o SINAL dá o lado.
function tier(posicao) {
    const m = Math.abs(posicao);
    if (m === 0) return { nivel: 'neutro', rotulo: 'Neutro', lado: 'neutro' };
    const lado = posicao > 0 ? 'aliado' : 'inimigo';
    if (m <= 3) return { nivel: 'leve', rotulo: lado === 'aliado' ? 'Cordial' : 'Tenso', lado };
    if (m <= 7) return { nivel: 'moderado', rotulo: lado === 'aliado' ? 'Amistoso' : 'Rival', lado };
    return { nivel: 'extremo', rotulo: lado === 'aliado' ? 'Aliado leal' : 'Inimigo mortal', lado };
}

// PESO_TAG — GANCHO FUTURO (decisão 4): hoje cada tag vale 1 passo. Se um dia quiser passos variáveis,
// a tag carrega `peso` (inteiro ≥ 1) e o cálculo abaixo já o usa (default 1). Procure por "PESO_TAG".
function passoDaTag(tag) {
    if (!tag || typeof tag !== 'object') return 0;
    const sinal = tag.sinal === -1 ? -1 : (tag.sinal === 1 ? 1 : 0);
    const peso = Math.max(parseInt(tag.peso, 10) || 1, 1); // PESO_TAG: default 1
    return sinal * peso;
}

// Normaliza as tags do jsonb p/ {texto, sinal, peso}, TOLERANDO o shape LEGADO (string) — decisão 5:
// string num link 'inimigo' → negativa; 'aliado' → positiva; 'associado'/neutro/desconhecido → sem sinal
// (0, não move a agulha), editável depois na nova UI. Objetos novos já trazem o próprio sinal.
function normalizarTags(tagsBrutas, tipoVinculo) {
    if (!Array.isArray(tagsBrutas)) return [];
    const sinalLegado = tipoVinculo === 'inimigo' ? -1 : (tipoVinculo === 'aliado' ? 1 : 0);
    const out = [];
    for (const t of tagsBrutas) {
        if (typeof t === 'string') {
            const texto = t.trim();
            if (texto) out.push({ texto, sinal: sinalLegado, peso: 1, legado: true });
        } else if (t && typeof t === 'object' && typeof t.texto === 'string' && t.texto.trim()) {
            const sinal = t.sinal === -1 ? -1 : (t.sinal === 1 ? 1 : 0);
            out.push({ texto: t.texto.trim(), sinal, peso: Math.max(parseInt(t.peso, 10) || 1, 1) });
        }
    }
    return out;
}

// Leitura completa da relação a partir do jsonb `dados` + o tipo_vinculo (p/ inferir sinal legado).
function lerRelacao(dados, tipoVinculo) {
    const tags = normalizarTags(dados && dados.tags, tipoVinculo);
    const posicao = clamp(tags.reduce((soma, t) => soma + passoDaTag(t), 0));
    return { posicao, tier: tier(posicao), tags, min: POS_MIN, max: POS_MAX };
}

module.exports = { POS_MIN, POS_MAX, clamp, tier, passoDaTag, normalizarTags, lerRelacao };
