// public/js/reputacaoEscala.js
// ESPELHO BROWSER de services/reputacaoEscala.js (sem build → manter em sync; tabela de tiers = reputacao.md
// §1.5). Reputação = fama/infâmia GLOBAL da entidade, reta -10..+10 event-sourced. Reusa o núcleo numérico
// já carregado (window.RelacaoEscala: clamp/passoDaTag) — relacaoEscala.js deve carregar ANTES deste.
(function () {
    const R = window.RelacaoEscala || {};
    const POS_MIN = R.POS_MIN ?? -10, POS_MAX = R.POS_MAX ?? 10;
    const clamp = R.clamp || ((n) => Math.max(POS_MIN, Math.min(POS_MAX, n)));
    const passoDaTag = R.passoDaTag || ((t) => (t && (t.sinal === -1 ? -1 : t.sinal === 1 ? 1 : 0)) * Math.max(parseInt(t && t.peso, 10) || 1, 1));

    function tierReputacao(posicao) {
        const m = Math.abs(posicao);
        if (m === 0) return { nivel: 'neutro', rotulo: 'Desconhecido', lado: 'neutro' };
        const lado = posicao > 0 ? 'fama' : 'infamia';
        if (m <= 3) return { nivel: 'leve', rotulo: lado === 'fama' ? 'Conhecido' : 'Malvisto', lado };
        if (m <= 7) return { nivel: 'moderado', rotulo: lado === 'fama' ? 'Respeitado' : 'Temido', lado };
        return { nivel: 'extremo', rotulo: lado === 'fama' ? 'Reverenciado' : 'Odiado', lado };
    }

    function normalizarEventos(brutos) {
        if (!Array.isArray(brutos)) return [];
        const out = [];
        for (const e of brutos) {
            if (e && typeof e === 'object' && typeof e.texto === 'string' && e.texto.trim()) {
                const sinal = e.sinal === -1 ? -1 : (e.sinal === 1 ? 1 : 0);
                out.push({ id: typeof e.id === 'string' ? e.id : null, texto: e.texto.trim(), sinal, peso: Math.max(parseInt(e.peso, 10) || 1, 1) });
            }
        }
        return out;
    }

    function lerReputacao(dados) {
        const eventos = normalizarEventos(dados && dados.reputacao && dados.reputacao.eventos);
        const posicao = clamp(eventos.reduce((soma, e) => soma + passoDaTag(e), 0));
        return { posicao, tier: tierReputacao(posicao), eventos, min: POS_MIN, max: POS_MAX };
    }

    window.ReputacaoEscala = { POS_MIN, POS_MAX, clamp, tierReputacao, normalizarEventos, lerReputacao };
})();
