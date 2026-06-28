// public/js/constelacao.js
// Motor de Constelação — F2.3a: a SUPERFÍCIE na aba Mundo. Junta o snapshot (F2.1 /constelacao) + a
// fórmula (ConstelacaoCalc) + o motor (ConstelacaoFisica) num loop RAF que ANIMA os orbes e desenha as
// linhas. F2.3a = render + assentamento; pan/zoom, arrasto e recálculo por mutação = F2.3b.
// Vanilla, zero libs (Regra 1). Orbe = astro redondo (escolha do Narrador); cor por token (Regra 2.5).
(function () {
    const SVGNS = 'http://www.w3.org/2000/svg';
    let orbes = [];                  // [{id, nome, tarot, x, y, vx, vy, massa, fixo}]
    let forcas = { massa: {}, molas: [], magnetismo: [] };
    let raf = null;
    const orbeEl = new Map();        // id → elemento da bolha
    let linhaEls = [];               // [{el, a, b}]

    const canvas = () => document.getElementById('constelacao-canvas');
    const wrapOrbes = () => document.getElementById('constelacao-orbes');
    const wrapLinhas = () => document.getElementById('constelacao-linhas');
    const centro = () => { const c = canvas(); return { x: (c?.clientWidth || 800) / 2, y: (c?.clientHeight || 600) / 2 }; };
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const diametro = (massa) => clamp(40 + (Number(massa) || 1) * 12, 48, 140); // raio ∝ massa
    const espessura = (t) => 1 + Math.abs(Number(t) || 0) / 10 * 4;            // 1..5px ∝ |tensão|
    const classeLinha = (t) => { const v = Number(t) || 0; return 'constelacao-linha ' + (v > 1 ? 'constelacao-linha--aliado' : v < -1 ? 'constelacao-linha--inimigo' : 'constelacao-linha--neutro'); };
    const ROMANO = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

    async function entrar(cronicaId) {
        try {
            const res = await API.fetch(`/cronicas/${cronicaId}/constelacao`);
            if (!res.ok) throw new Error('falha');
            const snap = await res.json();
            forcas = ConstelacaoCalc.calcular(snap);
            criarOrbes(snap);
            montar();
            iniciarLoop();
        } catch (e) {
            if (window.mostrarToast) mostrarToast('Não foi possível carregar a constelação.', 'erro');
        }
    }

    function criarOrbes(snap) {
        const c = centro();
        const nucleos = snap.nucleos || [];
        const raio = Math.min(c.x, c.y) * 0.6;
        orbes = nucleos.map((n, i) => {
            const ang = (i / Math.max(1, nucleos.length)) * 2 * Math.PI; // semente em círculo (a física assenta)
            const pos = (n.pos && typeof n.pos.x === 'number')
                ? { x: n.pos.x, y: n.pos.y }
                : { x: c.x + Math.cos(ang) * raio, y: c.y + Math.sin(ang) * raio };
            return { id: String(n.id), nome: n.nome, tarot: n.tarot, x: pos.x, y: pos.y, vx: 0, vy: 0, massa: forcas.massa[String(n.id)] || 1, fixo: false };
        });
    }

    function montar() {
        const wo = wrapOrbes(), wl = wrapLinhas();
        if (!wo || !wl) return;
        wo.innerHTML = ''; wl.innerHTML = ''; orbeEl.clear(); linhaEls = [];

        // Linhas (atrás dos orbes) — uma por mola.
        for (const m of forcas.molas) {
            const ln = document.createElementNS(SVGNS, 'line');
            ln.setAttribute('class', classeLinha(m.tensao));
            ln.setAttribute('stroke-width', String(espessura(m.tensao)));
            wl.appendChild(ln);
            linhaEls.push({ el: ln, a: String(m.a), b: String(m.b) });
        }
        // Orbes (astros).
        for (const o of orbes) {
            const div = document.createElement('div');
            div.className = 'constelacao-orbe';
            const dia = diametro(o.massa);
            div.style.width = dia + 'px'; div.style.height = dia + 'px';
            div.dataset.id = o.id;
            const selo = o.tarot
                ? `<span class="constelacao-orbe-tarot" title="Arcano ${o.tarot.carta_num}${o.tarot.orientacao === -1 ? ' (invertido)' : ''}">${ROMANO[o.tarot.carta_num] || o.tarot.carta_num}${o.tarot.orientacao === -1 ? '↡' : ''}</span>`
                : '';
            div.innerHTML = `<span class="constelacao-orbe-nome">${escapeHTML(o.nome)}</span>${selo}`;
            wo.appendChild(div);
            orbeEl.set(o.id, div);
        }
        desenhar();
    }

    function desenhar() {
        const byId = new Map(orbes.map((o) => [o.id, o]));
        for (const o of orbes) {
            const el = orbeEl.get(o.id);
            if (el) { const dia = diametro(o.massa); el.style.left = (o.x - dia / 2) + 'px'; el.style.top = (o.y - dia / 2) + 'px'; }
        }
        for (const L of linhaEls) {
            const a = byId.get(L.a), b = byId.get(L.b);
            if (!a || !b) continue;
            L.el.setAttribute('x1', a.x); L.el.setAttribute('y1', a.y);
            L.el.setAttribute('x2', b.x); L.el.setAttribute('y2', b.y);
        }
    }

    function tick() {
        raf = null;
        const c = canvas();
        if (!c || c.hidden) return; // saiu da constelação → encerra o loop
        const energia = ConstelacaoFisica.passo(orbes, forcas, centro());
        desenhar();
        if (ConstelacaoFisica.dormiu(energia) && !orbes.some((o) => o.fixo)) return; // assentou
        raf = requestAnimationFrame(tick);
    }
    function iniciarLoop() { pararLoop(); raf = requestAnimationFrame(tick); }
    function pararLoop() { if (raf) cancelAnimationFrame(raf); raf = null; }

    function sair() { pararLoop(); }

    window.Constelacao = { entrar, sair };
})();
