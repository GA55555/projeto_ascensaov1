// public/js/constelacaoCalc.js
// Motor de Constelação — F2.1: a FÓRMULA INICIAL (pura, sem render/física). Recebe o snapshot de
// GET /cronicas/:id/constelacao e devolve {massa, molas, magnetismo} prontos para o motor físico (F2.2).
// Pré-computado quando os DADOS mudam (não a cada frame) — a chave da performance no A6 (analise §3-bis/I).
// Tudo aqui é CALIBRÁVEL: rode, veja como aparece, e ajuste as constantes. Zero libs (Regra 1).
(function () {
    // ── CONSTANTES DA FÓRMULA INICIAL (ajuste ao ver rodando) ──────────────────────────────
    const FATOR_MASSA = 0.5;   // massa = 1 + grau * FATOR_MASSA (grau = links das entidades + diplomacia)
    const PESO_DIP    = 6;     // diplomacia GARANTIDA: aliado = +6, inimigo = -6, neutro = 0 (na escala ±10)
    const RETA_FATOR  = 0.5;   // cada link entre as entidades soma reta(-10..10) * RETA_FATOR ao ajuste fino
    const RETA_TETO   = 4;     // o ajuste por Reta satura em ±4 → a diplomacia (±6) domina, a Reta afina
    const TENSAO_MIN = -10, TENSAO_MAX = 10; // tensão final (aliado→perto / inimigo→longe) é clampada aqui

    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const chavePar = (a, b) => (a < b ? a + '|' + b : b + '|' + a); // par não-ordenado estável

    // snapshot = { nucleos:[{id,nome,tarot,pos}], entidades:[{id,nucleo_id}], links:[{origem,destino,reta}],
    //              diplomacia:[{a,b,status}] }
    function calcular(snapshot) {
        const { nucleos = [], entidades = [], links = [], diplomacia = [] } = snapshot || {};
        const ids = nucleos.map((n) => String(n.id));
        const idSet = new Set(ids);
        const nucDe = new Map();                       // entidadeId → nucleoId
        entidades.forEach((e) => nucDe.set(String(e.id), String(e.nucleo_id)));

        const grau = {};                               // nº de ligações por núcleo (densidade → massa)
        ids.forEach((id) => { grau[id] = 0; });
        const retaPar = new Map();                     // par → soma das Retas entre as entidades dos dois

        // Links: contam para o grau das entidades de cada núcleo e, se cruzam núcleos distintos, para a tensão.
        links.forEach((l) => {
            const na = nucDe.get(String(l.origem));
            const nb = nucDe.get(String(l.destino));
            if (na && idSet.has(na)) grau[na]++;
            if (nb && idSet.has(nb)) grau[nb]++;
            if (na && nb && na !== nb && idSet.has(na) && idSet.has(nb)) {
                const k = chavePar(na, nb);
                retaPar.set(k, (retaPar.get(k) || 0) + (Number(l.reta) || 0));
            }
        });

        // Diplomacia: conta para o grau e fixa o valor GARANTIDO da tensão de cada par.
        const dipPar = new Map();
        diplomacia.forEach((d) => {
            const a = String(d.a), b = String(d.b);
            if (idSet.has(a)) grau[a]++;
            if (idSet.has(b)) grau[b]++;
            const v = d.status === 'aliado' ? PESO_DIP : (d.status === 'inimigo' ? -PESO_DIP : 0);
            dipPar.set(chavePar(a, b), v);
        });

        // Massa: importância na história → centro + inércia (mais difícil de mover).
        const massa = {};
        ids.forEach((id) => { massa[id] = 1 + grau[id] * FATOR_MASSA; });

        // Molas: um par tem mola se há diplomacia OU pelo menos um link entre suas entidades.
        // tensão > 0 (aliado) → atrai/perto; < 0 (inimigo) → repele/longe; 0 → neutro no meio.
        const molas = [];
        const pares = new Set([...dipPar.keys(), ...retaPar.keys()]);
        pares.forEach((k) => {
            const [a, b] = k.split('|');
            const dip = dipPar.get(k) || 0;
            const ajusteReta = clamp((retaPar.get(k) || 0) * RETA_FATOR, -RETA_TETO, RETA_TETO);
            const tensao = clamp(dip + ajusteReta, TENSAO_MIN, TENSAO_MAX);
            molas.push({ a, b, tensao });
        });

        // Magnetismo de Arquétipos (Tarot, força FRACA): mesma carta + mesma orientação → atrai (sinal +1);
        // mesma carta + orientação oposta → repele (sinal -1). Cartas diferentes não interagem.
        const tarotDe = new Map();
        nucleos.forEach((n) => { if (n.tarot) tarotDe.set(String(n.id), n.tarot); });
        const magnetismo = [];
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const ta = tarotDe.get(ids[i]), tb = tarotDe.get(ids[j]);
                if (!ta || !tb || Number(ta.carta_num) !== Number(tb.carta_num)) continue;
                magnetismo.push({ a: ids[i], b: ids[j], sinal: ta.orientacao === tb.orientacao ? 1 : -1 });
            }
        }

        return { massa, molas, magnetismo };
    }

    window.ConstelacaoCalc = { calcular, _constantes: { FATOR_MASSA, PESO_DIP, RETA_FATOR, RETA_TETO } };
})();
