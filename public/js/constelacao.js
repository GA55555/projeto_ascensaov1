// public/js/constelacao.js
// Motor de Constelação — F2.3: a SUPERFÍCIE na aba Mundo. Junta o snapshot (F2.1 /constelacao) + a
// fórmula (ConstelacaoCalc) + o motor (ConstelacaoFisica) num loop RAF que ANIMA os orbes e desenha as
// linhas. F2.3a = render + assentamento; F2.3b = INTERAÇÃO (pan/zoom via câmera, arrasto que suspende a
// física e reassume ao soltar, recálculo por API.onMutacao). Vanilla, zero libs (Regra 1).
(function () {
    const SVGNS = 'http://www.w3.org/2000/svg';
    let orbes = [];                  // [{id, nome, tarot, x, y, vx, vy, massa, fixo}] — em coords de MUNDO
    let forcas = { massa: {}, molas: [], magnetismo: [] };
    let raf = null;
    let cronicaAtual = null;
    let centroMundo = { x: 400, y: 300 };   // ponto fixo de gravidade (capturado ao entrar)
    let cam = { x: 0, y: 0, zoom: 1 };       // câmera: translate + scale do world-layer
    let arrastando = null;                   // orbe sob arrasto (física suspensa)
    let arrastoOffset = { dx: 0, dy: 0 };    // offset (mundo) entre o ponto agarrado e o centro do orbe
    let panning = null;                      // {x,y} do último ponteiro durante o pan
    let interacaoPronta = false;
    const orbeEl = new Map();        // id → elemento da bolha
    let linhaEls = [];               // [{el, a, b}]

    const canvas = () => document.getElementById('constelacao-canvas');
    const elMundo = () => document.getElementById('constelacao-mundo');
    const wrapOrbes = () => document.getElementById('constelacao-orbes');
    const wrapLinhas = () => document.getElementById('constelacao-linhas');
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const diametro = (massa) => clamp(40 + (Number(massa) || 1) * 12, 48, 140); // raio ∝ massa
    const espessura = (t) => 1 + Math.abs(Number(t) || 0) / 10 * 4;            // 1..5px ∝ |tensão|
    const classeLinha = (t) => { const v = Number(t) || 0; return 'constelacao-linha ' + (v > 1 ? 'constelacao-linha--aliado' : v < -1 ? 'constelacao-linha--inimigo' : 'constelacao-linha--neutro'); };
    const ROMANO = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

    async function entrar(cronicaId) {
        cronicaAtual = cronicaId;
        const c = canvas();
        centroMundo = { x: (c?.clientWidth || 800) / 2, y: (c?.clientHeight || 600) / 2 };
        cam = { x: 0, y: 0, zoom: 1 }; aplicarCamera();
        garantirInteracao();
        try {
            const res = await API.fetch(`/cronicas/${cronicaId}/constelacao`);
            if (!res.ok) throw new Error('falha');
            const snap = await res.json();
            forcas = ConstelacaoCalc.calcular(snap);
            criarOrbes(snap, true);
            montar();
            iniciarLoop();
        } catch (e) {
            if (window.mostrarToast) mostrarToast('Não foi possível carregar a constelação.', 'erro');
        }
    }

    // semente: usa pos salva (F3) ou um círculo em volta do centro; preserva posições no recálculo.
    function criarOrbes(snap, reposicionar) {
        const antigos = new Map(orbes.map((o) => [o.id, o]));
        const nucleos = snap.nucleos || [];
        const raio = Math.min(centroMundo.x, centroMundo.y) * 0.6;
        orbes = nucleos.map((n, i) => {
            const id = String(n.id);
            const massa = forcas.massa[id] || 1;
            const ex = !reposicionar && antigos.get(id);
            if (ex) { ex.nome = n.nome; ex.tarot = n.tarot; ex.massa = massa; return ex; } // mantém posição/velocidade
            const ang = (i / Math.max(1, nucleos.length)) * 2 * Math.PI;
            const pos = (n.pos && typeof n.pos.x === 'number')
                ? { x: n.pos.x, y: n.pos.y }
                : { x: centroMundo.x + Math.cos(ang) * raio, y: centroMundo.y + Math.sin(ang) * raio };
            return { id, nome: n.nome, tarot: n.tarot, x: pos.x, y: pos.y, vx: 0, vy: 0, massa, fixo: false };
        });
    }

    function montar() {
        const wo = wrapOrbes(), wl = wrapLinhas();
        if (!wo || !wl) return;
        wo.innerHTML = ''; wl.innerHTML = ''; orbeEl.clear(); linhaEls = [];
        for (const m of forcas.molas) {
            const ln = document.createElementNS(SVGNS, 'line');
            ln.setAttribute('class', classeLinha(m.tensao));
            ln.setAttribute('stroke-width', String(espessura(m.tensao)));
            wl.appendChild(ln);
            linhaEls.push({ el: ln, a: String(m.a), b: String(m.b) });
        }
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
        if (!c || c.hidden) return;
        const energia = ConstelacaoFisica.passo(orbes, forcas, centroMundo);
        desenhar();
        if (ConstelacaoFisica.dormiu(energia) && !arrastando) return; // assentou
        raf = requestAnimationFrame(tick);
    }
    function iniciarLoop() { pararLoop(); raf = requestAnimationFrame(tick); }
    function pararLoop() { if (raf) cancelAnimationFrame(raf); raf = null; }
    function sair() { pararLoop(); }

    // ── Câmera (pan/zoom) ──────────────────────────────────────────────────
    function aplicarCamera() {
        const m = elMundo();
        if (m) m.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`;
    }
    // tela → mundo (inverso da câmera): usado p/ posicionar o orbe arrastado.
    function paraMundo(clientX, clientY) {
        const r = canvas().getBoundingClientRect();
        return { x: (clientX - r.left - cam.x) / cam.zoom, y: (clientY - r.top - cam.y) / cam.zoom };
    }

    // Liga os ponteiros UMA vez (o canvas persiste entre entradas).
    function garantirInteracao() {
        if (interacaoPronta) return;
        const c = canvas();
        if (!c) return;
        interacaoPronta = true;

        c.addEventListener('pointerdown', (e) => {
            const orbeDiv = e.target.closest && e.target.closest('.constelacao-orbe');
            if (orbeDiv) {
                const o = orbes.find((x) => x.id === orbeDiv.dataset.id);
                if (o) {
                    arrastando = o; o.fixo = true; orbeDiv.classList.add('arrastando');
                    const p = paraMundo(e.clientX, e.clientY);   // mantém o ponto agarrado sob o cursor
                    arrastoOffset = { dx: o.x - p.x, dy: o.y - p.y };
                    iniciarLoop(); // roda a física durante o arrasto → vizinhos reagem ao vivo (o pego é fixo)
                }
            } else {
                panning = { x: e.clientX, y: e.clientY };
            }
            c.setPointerCapture(e.pointerId);
        });
        c.addEventListener('pointermove', (e) => {
            if (arrastando) {
                const p = paraMundo(e.clientX, e.clientY);
                arrastando.x = p.x + arrastoOffset.dx; arrastando.y = p.y + arrastoOffset.dy;
                arrastando.vx = 0; arrastando.vy = 0;
                desenhar();
            } else if (panning) {
                cam.x += e.clientX - panning.x; cam.y += e.clientY - panning.y;
                panning = { x: e.clientX, y: e.clientY };
                aplicarCamera();
            }
        });
        const soltar = (e) => {
            if (arrastando) {
                const div = orbeEl.get(arrastando.id); if (div) div.classList.remove('arrastando');
                arrastando.fixo = false; arrastando = null; iniciarLoop(); // física reassume organicamente
            }
            panning = null;
            try { c.releasePointerCapture(e.pointerId); } catch (_) { /* já solto */ }
        };
        c.addEventListener('pointerup', soltar);
        c.addEventListener('pointercancel', soltar);

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const r = c.getBoundingClientRect();
            const cx = e.clientX - r.left, cy = e.clientY - r.top;
            const novoZoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.3, 3);
            cam.x = cx - (cx - cam.x) * (novoZoom / cam.zoom);
            cam.y = cy - (cy - cam.y) * (novoZoom / cam.zoom);
            cam.zoom = novoZoom;
            aplicarCamera();
        }, { passive: false });

        // Recálculo ao mudar o mundo (paralelo ao da frescura do Oráculo). Só quando a lente está ativa.
        if (window.API && typeof API.onMutacao === 'function') {
            API.onMutacao((url) => {
                if (/\/oraculo(\/|$|\?)/.test(url) || url.includes('/perfil/oraculo')) return;
                const cv = canvas();
                if (cv && !cv.hidden && cronicaAtual) recarregar();
            });
        }
    }

    // Re-busca o snapshot e reconcilia (preserva posições dos orbes existentes; adiciona novos; some os removidos).
    async function recarregar() {
        try {
            const res = await API.fetch(`/cronicas/${cronicaAtual}/constelacao`);
            if (!res.ok) return;
            const snap = await res.json();
            forcas = ConstelacaoCalc.calcular(snap);
            criarOrbes(snap, false); // false = mantém posições/velocidades existentes
            montar();
            iniciarLoop();
        } catch (_) { /* silencioso — a lente segue com o estado atual */ }
    }

    window.Constelacao = { entrar, sair };
})();
