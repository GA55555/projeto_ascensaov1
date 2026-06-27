// public/js/relacaoEscala.js
// ESPELHO BROWSER de services/relacaoEscala.js (sem build → manter em SYNC; a tabela de tiers canônica
// está em reta_relacao.md §1.1). "Reta de Relação": escala bipolar -10..+10; cada tag é um passo assinado
// (positiva avança, negativa recua); posição = soma derivada das tags, com clamp ±10. Defensivo (Regra 4.2).
(function () {
    const POS_MIN = -10;
    const POS_MAX = 10;
    const clamp = (n) => Math.max(POS_MIN, Math.min(POS_MAX, n));

    // Tiers (decisão 1): magnitude → intensidade; sinal → lado (aliado/inimigo).
    function tier(posicao) {
        const m = Math.abs(posicao);
        if (m === 0) return { nivel: 'neutro', rotulo: 'Neutro', lado: 'neutro' };
        const lado = posicao > 0 ? 'aliado' : 'inimigo';
        if (m <= 3) return { nivel: 'leve', rotulo: lado === 'aliado' ? 'Cordial' : 'Tenso', lado };
        if (m <= 7) return { nivel: 'moderado', rotulo: lado === 'aliado' ? 'Amistoso' : 'Rival', lado };
        return { nivel: 'extremo', rotulo: lado === 'aliado' ? 'Aliado leal' : 'Inimigo mortal', lado };
    }

    // PESO_TAG — gancho futuro (decisão 4): hoje cada tag vale 1; se um dia carregar `peso`, já é usado.
    function passoDaTag(tag) {
        if (!tag || typeof tag !== 'object') return 0;
        const sinal = tag.sinal === -1 ? -1 : (tag.sinal === 1 ? 1 : 0);
        const peso = Math.max(parseInt(tag.peso, 10) || 1, 1); // PESO_TAG: default 1
        return sinal * peso;
    }

    // Normaliza tags do jsonb p/ {texto, sinal, peso}, tolerando string LEGADA (decisão 5): em link
    // 'inimigo' → negativa, 'aliado' → positiva, 'associado'/neutro/desconhecido → sem sinal (0).
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

    function lerRelacao(dados, tipoVinculo) {
        const tags = normalizarTags(dados && dados.tags, tipoVinculo);
        const posicao = clamp(tags.reduce((soma, t) => soma + passoDaTag(t), 0));
        return { posicao, tier: tier(posicao), tags, min: POS_MIN, max: POS_MAX };
    }

    window.RelacaoEscala = { POS_MIN, POS_MAX, clamp, tier, passoDaTag, normalizarTags, lerRelacao };
})();
