// public/js/constelacaoFisica.js
// Motor de Constelação — F2.2: o MOTOR FÍSICO (força + integração de UM frame). Puro: opera sobre os
// orbes que recebe e devolve a energia média (p/ o loop decidir dormir). O RAF loop, a criação dos orbes
// e a escrita no DOM são da F2.3 (a superfície). Reusa a matemática do `tickFisica` do Tabuleiro, mas
// DESACOPLADO (a Constelação da Mundo é outra superfície) e ciente de MASSA, TENSÃO e MAGNETISMO (F2.1).
// Zero libs (Regra 1). Constantes CALIBRÁVEIS (rode e ajuste — relacionamento.md §2).
(function () {
    const DIST_BASE   = 350;  // comprimento de mola na tensão 0 (neutro)
    const DIST_ESCALA = 18;   // tensão ±10 desloca o comprimento ideal em ±180 (aliado≈170, inimigo≈530)
    const K_MOLA      = 0.02;  // rigidez da mola de tensão
    const REP_DIST    = 600;   // raio da repulsão (Coulomb)
    const REP_FORCA   = 4000;  // intensidade da repulsão (inverse-linear)
    const MAG_FORCA   = 8;     // magnetismo de arquétipo (FRACO): + atrai mesma carta/orient., − repele
    const GRAV        = 0.01;  // gravidade ao centro; aplicada ∝ massa → aceleração constante (heavy = centro)
    const ATRITO      = 0.55;  // amortecimento (assenta < 2s)
    const VMAX        = 12;     // teto de velocidade/frame
    const PARADA      = 2.5;    // energia média de "sono" (dorme cedo)

    const clampV = (v) => Math.max(-VMAX, Math.min(VMAX, v));

    // orbes: [{ id, x, y, vx, vy, massa, fixo? }] (fixo = arrastado pelo Narrador → massa infinita).
    // forcas: { molas:[{a,b,tensao}], magnetismo:[{a,b,sinal}] } (da ConstelacaoCalc). centro: {x,y}.
    // Muta os orbes (x/y/vx/vy) e devolve a ENERGIA MÉDIA do frame.
    function passo(orbes, forcas, centro) {
        const byId = new Map(orbes.map((o) => [String(o.id), o]));
        const F = new Map(orbes.map((o) => [String(o.id), { x: 0, y: 0 }]));
        const add = (id, x, y) => { const f = F.get(String(id)); if (f) { f.x += x; f.y += y; } };

        // Molas de tensão: comprimento ideal vem da tensão (aliado → curto/atrai, inimigo → longo/repele).
        for (const m of (forcas.molas || [])) {
            const a = byId.get(String(m.a)), b = byId.get(String(m.b));
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y, dist = Math.max(1, Math.hypot(dx, dy));
            const ideal = DIST_BASE - (Number(m.tensao) || 0) * DIST_ESCALA;
            const f = (dist - ideal) * K_MOLA;       // >0 aproxima, <0 afasta
            const ux = dx / dist, uy = dy / dist;
            add(m.a, ux * f, uy * f); add(m.b, -ux * f, -uy * f);
        }

        // Repulsão de Coulomb entre todos os pares dentro do raio (espaça o grafo).
        for (let i = 0; i < orbes.length; i++) {
            for (let j = i + 1; j < orbes.length; j++) {
                const a = orbes[i], b = orbes[j];
                const dx = b.x - a.x, dy = b.y - a.y, dist = Math.max(1, Math.hypot(dx, dy));
                if (dist >= REP_DIST) continue;
                const f = REP_FORCA / Math.max(dist, 40); // soft-clamp anti-jitter a curta distância
                const ux = dx / dist, uy = dy / dist;
                add(a.id, -ux * f, -uy * f); add(b.id, ux * f, uy * f);
            }
        }

        // Magnetismo de Arquétipos (fraco): + atrai (puxa um ao outro), − repele.
        for (const mg of (forcas.magnetismo || [])) {
            const a = byId.get(String(mg.a)), b = byId.get(String(mg.b));
            if (!a || !b) continue;
            const dx = b.x - a.x, dy = b.y - a.y, dist = Math.max(1, Math.hypot(dx, dy));
            const ux = dx / dist, uy = dy / dist, f = MAG_FORCA * (mg.sinal < 0 ? -1 : 1);
            add(mg.a, ux * f, uy * f); add(mg.b, -ux * f, -uy * f);
        }

        // Gravidade ∝ massa (→ aceleração constante; heavy não é puxado de menos) + integração com inércia.
        let energia = 0;
        for (const o of orbes) {
            const f = F.get(String(o.id));
            const massa = Math.max(1, Number(o.massa) || 1);
            f.x += (centro.x - o.x) * GRAV * massa;
            f.y += (centro.y - o.y) * GRAV * massa;
            if (o.fixo) { o.vx = 0; o.vy = 0; continue; }      // arrastado → não integra (sem luta)
            o.vx = clampV((o.vx + f.x / massa) * ATRITO);       // /massa = INÉRCIA (heavy difícil de mover)
            o.vy = clampV((o.vy + f.y / massa) * ATRITO);
            o.x += o.vx; o.y += o.vy;
            energia += Math.abs(o.vx) + Math.abs(o.vy);
        }
        return energia / Math.max(1, orbes.length);
    }

    const dormiu = (energiaMedia) => energiaMedia < PARADA;

    window.ConstelacaoFisica = { passo, dormiu, _constantes: { DIST_BASE, DIST_ESCALA, K_MOLA, REP_DIST, REP_FORCA, MAG_FORCA, GRAV, ATRITO, VMAX, PARADA } };
})();
