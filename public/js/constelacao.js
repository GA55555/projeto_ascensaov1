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
    let pressTimer = null;                   // clica-segura no vazio → criar núcleo (vira pan se mover antes)
    let pressInicio = null;                  // {x, y, mundo} do início do clica-segura
    let ghostEl = null;                      // bolha-fantasma que "cresce" durante o clica-segura
    let proximaSemente = null;               // {x,y} onde o PRÓXIMO núcleo novo nasce (clique de criação)
    let orbePress = null;                    // {x,y} do pointerdown num orbe (p/ distinguir clique de arrasto)
    let catalogoTarot = null;                // catálogo dos arcanos (carregado sob demanda em /data/tarot.json)
    let focoId = null;                        // núcleo focado (sistema solar) — null = visão geral
    let entidadesAtual = [];                  // entidades do último snapshot (viram os "planetas" no foco)
    let linksAtual = [];                      // links entidade↔entidade [{origem,destino,reta}] (layout solar)
    let diplomaciaAtual = [];                 // diplomacia do último snapshot [{a,b,status}] (base p/ conectar)
    let conectandoDe = null;                  // orbe-origem de um arrasto de conexão (âncora)
    let tempLinha = null;                     // linha temporária do arrasto de conexão
    let interacaoPronta = false;
    let astroViewport = null;                 // overlay do astrolábio 3D (visão solar no foco); null = sem foco
    let feixeEl = null;                       // painel-projeção (feixe holográfico) aberto sobre um orbe; null = fechado
    const HOLD_MS = 600;                     // tempo do clica-segura (decisão E — ajustável)
    const MOVE_TOL = 6;                      // px: acima disso o clica-segura vira pan
    const CLICK_TOL = 5;                     // px: arrasto abaixo disso conta como CLIQUE (abre config)
    const orbeEl = new Map();        // id → elemento da bolha
    let linhaEls = [];               // [{el, a, b}]

    const canvas = () => document.getElementById('constelacao-canvas');
    const elMundo = () => document.getElementById('constelacao-mundo');
    const wrapOrbes = () => document.getElementById('constelacao-orbes');
    const wrapLinhas = () => document.getElementById('constelacao-linhas');
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    // O app usa :root{zoom: 1.33}: clientX/getBoundingClientRect vêm em px VISUAIS, mas style/transform
    // dos filhos é re-escalado pelo navegador. Dividir os deltas de ponteiro por este fator casa os espaços
    // (igual ao board — posicionarPopover). Sem isto, a conversão "foge" proporcional à distância.
    const rootZoom = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const diametro = (massa) => clamp(40 + (Number(massa) || 1) * 12, 48, 140); // raio ∝ massa
    const diametroOrbe = (o) => diametro(o.massa) * (Number(o.escala) || 1);    // × override visual (F3.5)
    // Paleta de COR por TOKEN (Regra 2.5: nada de cor hardcoded; a cor é uma chave que mapeia p/ var CSS).
    const PALETA_COR = [
        { key: 'destaque', varname: '--destaque' }, { key: 'roxo', varname: '--roxo-mago' },
        { key: 'azul', varname: '--azul-vida' }, { key: 'aliado', varname: '--link-aliado' },
        { key: 'inimigo', varname: '--link-inimigo' }, { key: 'aviso', varname: '--aviso' }, { key: 'rosa', varname: '--rosa' },
    ];
    const corVar = (key) => (PALETA_COR.find((c) => c.key === key)?.varname) || '--destaque';
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
            const res = await API.fetch(`/cronicas/${cronicaId}/constelacao?_=${Date.now()}`); // anti-cache (frescura)
            if (!res.ok) throw new Error('falha');
            const snap = await res.json();
            entidadesAtual = snap.entidades || [];
            linksAtual = snap.links || [];
            diplomaciaAtual = snap.diplomacia || [];
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
            if (ex) { ex.nome = n.nome; ex.descricao = n.descricao; ex.tarot = n.tarot; ex.massa = massa; ex.cor = n.cor; ex.escala = n.escala; return ex; } // mantém posição/velocidade
            let pos;
            if (proximaSemente) { pos = { x: proximaSemente.x, y: proximaSemente.y }; proximaSemente = null; } // nasce onde o Narrador clicou
            else if (n.pos && typeof n.pos.x === 'number') { pos = { x: n.pos.x, y: n.pos.y }; }
            else { const ang = (i / Math.max(1, nucleos.length)) * 2 * Math.PI; pos = { x: centroMundo.x + Math.cos(ang) * raio, y: centroMundo.y + Math.sin(ang) * raio }; }
            return { id, nome: n.nome, descricao: n.descricao, cor: n.cor, escala: n.escala, tarot: n.tarot, x: pos.x, y: pos.y, vx: 0, vy: 0, massa, fixo: false };
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
            const dia = diametroOrbe(o);
            div.style.width = dia + 'px'; div.style.height = dia + 'px';
            if (o.cor) div.style.setProperty('--cor-nucleo', `var(${corVar(o.cor)})`); // cor por token → tint+borda (CSS)
            div.dataset.id = o.id;
            const selo = o.tarot
                ? `<span class="constelacao-orbe-tarot" title="Arcano ${o.tarot.carta_num}${o.tarot.orientacao === -1 ? ' (invertido)' : ''}">${ROMANO[o.tarot.carta_num] || o.tarot.carta_num}${o.tarot.orientacao === -1 ? '↡' : ''}</span>`
                : '';
            // Orbe arcano: camadas decorativas (plasma girando + núcleo pulsando + vidro esférico fixo)
            // são pointer-events:none → o clique/arrasto continua caindo no .constelacao-orbe. Nome só no hover.
            div.innerHTML = `<span class="orbe-esfera"><span class="orbe-plasma"></span><span class="orbe-nucleo"></span><span class="orbe-vidro"></span></span>${selo}<span class="constelacao-orbe-ancora" title="Arraste até outro núcleo para definir a diplomacia"></span><span class="constelacao-orbe-nome">${escapeHTML(o.nome)}</span>`;
            wo.appendChild(div);
            orbeEl.set(o.id, div);
        }
        desenhar();
        if (focoId) { const sol = orbes.find((o) => o.id === focoId); if (sol) { orbeEl.get(focoId)?.classList.add('is-sol'); canvas()?.classList.add('em-foco', 'astro-on'); montarAstrolabio(); } else sairFoco(); }
    }

    function desenhar() {
        const byId = new Map(orbes.map((o) => [o.id, o]));
        for (const o of orbes) {
            const el = orbeEl.get(o.id);
            if (el) { const dia = diametroOrbe(o); el.style.left = (o.x - dia / 2) + 'px'; el.style.top = (o.y - dia / 2) + 'px'; }
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

    // F3.4a: salva o layout (posições de repouso dos núcleos) — manual (Regra 2.7).
    async function salvarLayout() {
        if (!cronicaAtual || !orbes.length) return;
        const posicoes = orbes.map((o) => ({ id: o.id, x: Math.round(o.x), y: Math.round(o.y) }));
        try {
            const res = await API.fetch(`/cronicas/${cronicaAtual}/constelacao/posicoes`, { method: 'PUT', body: JSON.stringify({ posicoes }) });
            if (!res.ok) throw new Error('falha');
            if (window.mostrarToast) mostrarToast('Layout da constelação salvo.', 'sucesso');
        } catch (_) {
            if (window.mostrarToast) mostrarToast('Erro ao salvar o layout.', 'erro');
        }
    }

    // ── Câmera (pan/zoom) ──────────────────────────────────────────────────
    function aplicarCamera() {
        const m = elMundo();
        if (m) m.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`;
    }
    // tela → mundo (inverso da câmera): usado p/ posicionar o orbe arrastado.
    function paraMundo(clientX, clientY) {
        const r = canvas().getBoundingClientRect();
        const z = rootZoom();
        const px = (clientX - r.left) / z, py = (clientY - r.top) / z; // visuais → px de layout (CSS)
        return { x: (px - cam.x) / cam.zoom, y: (py - cam.y) / cam.zoom };
    }

    // Liga os ponteiros UMA vez (o canvas persiste entre entradas).
    function garantirInteracao() {
        if (interacaoPronta) return;
        const c = canvas();
        if (!c) return;
        interacaoPronta = true;

        c.addEventListener('pointerdown', (e) => {
            if (e.target.closest && e.target.closest('.constelacao-controles')) return; // controles não pan/criam
            // Âncora (borda do orbe): inicia um arrasto de CONEXÃO (→ diplomacia), não move o orbe.
            const ancora = e.target.closest && e.target.closest('.constelacao-orbe-ancora');
            if (ancora) {
                const od = ancora.closest('.constelacao-orbe');
                const o = od && orbes.find((x) => x.id === od.dataset.id);
                if (o) { conectandoDe = o; criarTempLinha(); c.setPointerCapture(e.pointerId); }
                return;
            }
            const orbeDiv = e.target.closest && e.target.closest('.constelacao-orbe');
            if (orbeDiv) {
                const o = orbes.find((x) => x.id === orbeDiv.dataset.id);
                if (o) {
                    arrastando = o; o.fixo = true; orbeDiv.classList.add('arrastando');
                    orbePress = { x: e.clientX, y: e.clientY };   // p/ distinguir CLIQUE (config) de arrasto
                    const p = paraMundo(e.clientX, e.clientY);   // mantém o ponto agarrado sob o cursor
                    arrastoOffset = { dx: o.x - p.x, dy: o.y - p.y };
                    iniciarLoop(); // roda a física durante o arrasto → vizinhos reagem ao vivo (o pego é fixo)
                }
            } else if (focoId) {
                // Em foco (sistema solar): o vazio só faz PAN; sair do foco é pela barra ou Esc.
                panning = { x: e.clientX, y: e.clientY };
            } else {
                // Vazio: clica-SEGURA (parado ~600ms) cria núcleo; se MOVER antes, vira pan.
                pressInicio = { x: e.clientX, y: e.clientY, mundo: paraMundo(e.clientX, e.clientY) };
                iniciarGhost(e.clientX, e.clientY);
                pressTimer = setTimeout(() => {
                    pressTimer = null; removerGhost();
                    abrirEditorCriarNucleo(pressInicio.mundo);
                }, HOLD_MS);
            }
            c.setPointerCapture(e.pointerId);
        });
        c.addEventListener('pointermove', (e) => {
            if (pressTimer && pressInicio) {
                if (Math.hypot(e.clientX - pressInicio.x, e.clientY - pressInicio.y) > MOVE_TOL) {
                    clearTimeout(pressTimer); pressTimer = null; removerGhost();
                    panning = { x: pressInicio.x, y: pressInicio.y }; // movimento → vira pan
                }
            }
            if (conectandoDe) {
                const p = paraMundo(e.clientX, e.clientY);
                atualizarTempLinha(conectandoDe.x, conectandoDe.y, p.x, p.y);
            } else if (arrastando) {
                const p = paraMundo(e.clientX, e.clientY);
                arrastando.x = p.x + arrastoOffset.dx; arrastando.y = p.y + arrastoOffset.dy;
                arrastando.vx = 0; arrastando.vy = 0;
                desenhar();
            } else if (panning) {
                const z = rootZoom();
                cam.x += (e.clientX - panning.x) / z; cam.y += (e.clientY - panning.y) / z;
                panning = { x: e.clientX, y: e.clientY };
                aplicarCamera();
            }
        });
        const soltar = (e) => {
            if (conectandoDe) { // soltou um arrasto de conexão → sobre outro núcleo? abre o seletor de diplomacia
                removerTempLinha();
                const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest('.constelacao-orbe');
                const de = conectandoDe; conectandoDe = null;
                if (alvo && alvo.dataset.id && alvo.dataset.id !== de.id) abrirPickerDiplomacia(de.id, alvo.dataset.id);
                try { c.releasePointerCapture(e.pointerId); } catch (_) {}
                return;
            }
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; removerGhost(); } // tap rápido = nada
            if (arrastando) {
                const div = orbeEl.get(arrastando.id); if (div) div.classList.remove('arrastando');
                const id = arrastando.id;
                const foiClique = orbePress && Math.hypot(e.clientX - orbePress.x, e.clientY - orbePress.y) <= CLICK_TOL;
                arrastando.fixo = false; arrastando = null; orbePress = null; iniciarLoop(); // física reassume
                if (foiClique) focar(id); // clique sem arrastar → FOCA o núcleo (sistema solar, F3.3)
            }
            panning = null;
            try { c.releasePointerCapture(e.pointerId); } catch (_) { /* já solto */ }
        };
        c.addEventListener('pointerup', soltar);
        c.addEventListener('pointercancel', soltar);

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const r = c.getBoundingClientRect();
            const z = rootZoom();
            const cx = (e.clientX - r.left) / z, cy = (e.clientY - r.top) / z; // px de layout (CSS)
            const novoZoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.3, 3);
            cam.x = cx - (cx - cam.x) * (novoZoom / cam.zoom);
            cam.y = cy - (cy - cam.y) * (novoZoom / cam.zoom);
            cam.zoom = novoZoom;
            aplicarCamera();
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (feixeEl) { fecharFeixe(); return; }   // Esc fecha o feixe primeiro; só depois sai do foco
            if (focoId) sairFoco();
        });
        // Auto-pausa do astrolábio (decisão 7): aba/lente oculta → congela a rotação CSS (sem custo de GPU).
        document.addEventListener('visibilitychange', () => { astroViewport?.classList.toggle('astro-pausado', document.hidden); });
        document.getElementById('constelacao-salvar')?.addEventListener('click', salvarLayout);

        // Recálculo ao mudar o mundo (paralelo ao da frescura do Oráculo). Só quando a lente está ativa.
        if (window.API && typeof API.onMutacao === 'function') {
            API.onMutacao((url) => {
                if (/\/oraculo(\/|$|\?)/.test(url) || url.includes('/perfil/oraculo')) return;
                if (url.includes('/constelacao/posicoes')) return; // salvar layout NÃO deve recarregar (anti-jump)
                if (url.includes('/historia')) return; // história não muda o disco → mantém o feixe aberto
                if (url.includes('/reputacao')) return; // reputação (F2) não muda o disco ainda → feixe aberto
                const cv = canvas();
                if (cv && !cv.hidden && cronicaAtual) recarregar();
            });
        }
    }

    // Re-busca o snapshot e reconcilia (preserva posições dos orbes existentes; adiciona novos; some os removidos).
    async function recarregar() {
        try {
            const res = await API.fetch(`/cronicas/${cronicaAtual}/constelacao?_=${Date.now()}`); // anti-cache: pega o estado FRESCO
            if (!res.ok) return;
            const snap = await res.json();
            entidadesAtual = snap.entidades || [];
            linksAtual = snap.links || [];
            diplomaciaAtual = snap.diplomacia || [];
            forcas = ConstelacaoCalc.calcular(snap);
            criarOrbes(snap, false); // false = mantém posições/velocidades existentes
            montar();
            if (!focoId) iniciarLoop(); // em foco a visão solar é estática → não reanima o fundo (poupa CPU)
        } catch (_) { /* silencioso — a lente segue com o estado atual */ }
    }

    // ── F3.1: criar núcleo (clica-segura → animação → editor) ──────────────
    function iniciarGhost(clientX, clientY) {
        removerGhost();
        const c = canvas(); if (!c) return;
        const r = c.getBoundingClientRect();
        const z = rootZoom();
        ghostEl = document.createElement('div');
        ghostEl.className = 'constelacao-ghost';
        ghostEl.style.left = ((clientX - r.left) / z) + 'px'; // px de layout (CSS), igual ao resto
        ghostEl.style.top = ((clientY - r.top) / z) + 'px';
        c.appendChild(ghostEl);
    }
    function removerGhost() { if (ghostEl) { ghostEl.remove(); ghostEl = null; } }

    function abrirEditorCriarNucleo(mundoPos) {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-box">
                <div class="modal-head">
                    <h3 class="texto-roxo modal-titulo"><i data-lucide="orbit"></i> Novo Núcleo</h3>
                    <button class="btn btn-ghost btn-sm" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <label class="campo-label">Nome</label>
                <input type="text" id="cn-nome" class="input-full" maxlength="120" placeholder="Ex: A Igreja de Prata" autocomplete="off">
                <label class="campo-label">Descrição (contexto para a IA)</label>
                <textarea id="cn-desc" class="input-full" rows="3" maxlength="2000" placeholder="Breve descrição do núcleo…"></textarea>
                <div class="modal-acoes">
                    <button class="btn btn-primary" id="cn-criar"><i data-lucide="check"></i> Criar núcleo</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const fechar = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) fechar(); });
        modal.querySelector('#cn-criar').addEventListener('click', async () => {
            const nome = modal.querySelector('#cn-nome').value.trim();
            if (!nome) { if (window.mostrarToast) mostrarToast('Digite um nome.', 'aviso'); return; }
            const descricao = modal.querySelector('#cn-desc').value.trim();
            proximaSemente = { x: mundoPos.x, y: mundoPos.y }; // ANTES do POST: o onMutacao recarrega e usa a semente
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos`, { method: 'POST', body: JSON.stringify({ nome, descricao }) });
                if (!res.ok) throw new Error('falha');
                fechar(); // o recálculo via API.onMutacao já posiciona o novo núcleo onde clicou
            } catch (_) {
                proximaSemente = null;
                if (window.mostrarToast) mostrarToast('Erro ao criar núcleo.', 'erro');
            }
        });
        if (window.lucide) lucide.createIcons();
        modal.querySelector('#cn-nome').focus();
    }

    // ── F3.2a: config do núcleo (clique → editar/apagar/Tarot) ─────────────
    async function carregarCatalogo() {
        if (catalogoTarot) return catalogoTarot;
        try { const r = await fetch('/data/tarot.json'); catalogoTarot = await r.json(); }
        catch (_) { catalogoTarot = []; }
        return catalogoTarot;
    }

    async function abrirConfigNucleo(id) {
        const o = orbes.find((x) => x.id === String(id));
        if (!o) return;
        const cat = await carregarCatalogo();
        const t = o.tarot || null;
        const opcoes = cat.map((c) => `<option value="${c.num}" ${t && t.carta_num === c.num ? 'selected' : ''}>${c.num} — ${escapeHTML(c.nome)}</option>`).join('');
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-box">
                <div class="modal-head">
                    <h3 class="texto-roxo modal-titulo"><i data-lucide="orbit"></i> Núcleo</h3>
                    <button class="btn btn-ghost btn-sm" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <label class="campo-label">Nome</label>
                <input type="text" id="cf-nome" class="input-full" maxlength="120" value="${escapeHTML(o.nome)}">
                <label class="campo-label">Descrição (contexto para a IA)</label>
                <textarea id="cf-desc" class="input-full" rows="3" maxlength="2000">${escapeHTML(o.descricao || '')}</textarea>
                <label class="cf-usar"><input type="checkbox" id="cf-usar-tarot" ${t ? 'checked' : ''}> Usar uma carta de Tarot (arquétipo)</label>
                <div id="cf-tarot-bloco" class="cf-tarot-bloco" ${t ? '' : 'hidden'}>
                    <div class="cf-tarot-row">
                        <select id="cf-carta" class="input-full"><option value="">— Escolha a carta —</option>${opcoes}</select>
                        <label class="cf-or"><input type="radio" name="cf-or" value="1" ${!t || t.orientacao === 1 ? 'checked' : ''}> Em pé</label>
                        <label class="cf-or"><input type="radio" name="cf-or" value="-1" ${t && t.orientacao === -1 ? 'checked' : ''}> Invertida</label>
                    </div>
                    <p id="cf-significado" class="cf-significado texto-mutado"></p>
                </div>
                <label class="campo-label">Aparência</label>
                <div class="cf-aparencia">
                    <div class="cf-cores" id="cf-cores">
                        ${PALETA_COR.map((c) => `<button type="button" class="cf-cor ${o.cor === c.key ? 'sel' : ''}" data-cor="${c.key}" style="background: var(${c.varname})" title="${c.key}"></button>`).join('')}
                        <button type="button" class="cf-cor cf-cor-padrao ${!o.cor ? 'sel' : ''}" data-cor="" title="Padrão">·</button>
                    </div>
                    <select id="cf-escala" class="cf-escala-sel">
                        <option value="0.75">Pequeno</option>
                        <option value="1">Médio</option>
                        <option value="1.4">Grande</option>
                    </select>
                </div>
                <div class="cf-extras">
                    <button class="btn btn-outline btn-sm" id="cf-diplo"><i data-lucide="handshake"></i> Diplomacia</button>
                    <button class="btn btn-outline btn-sm" id="cf-criar-ent"><i data-lucide="user-plus"></i> Criar entidade dentro</button>
                </div>
                <div class="modal-acoes modal-acoes--split">
                    <button class="btn btn-danger btn-sm" id="cf-apagar"><i data-lucide="trash-2"></i> Apagar</button>
                    <button class="btn btn-primary" id="cf-salvar"><i data-lucide="check"></i> Salvar</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const fechar = () => modal.remove();
        const porNum = new Map(cat.map((c) => [c.num, c]));
        const refSig = () => {
            const num = parseInt(modal.querySelector('#cf-carta').value, 10);
            const or = modal.querySelector('input[name="cf-or"]:checked')?.value === '-1' ? -1 : 1;
            const c = porNum.get(num);
            modal.querySelector('#cf-significado').textContent = c ? `${c.estagio} — ${or === -1 ? c.sig_invertida : c.sig_pe}` : '';
        };
        modal.querySelector('#cf-carta').addEventListener('change', refSig);
        modal.querySelectorAll('input[name="cf-or"]').forEach((r) => r.addEventListener('change', refSig));
        const chkTarot = modal.querySelector('#cf-usar-tarot');
        chkTarot.addEventListener('change', () => { modal.querySelector('#cf-tarot-bloco').hidden = !chkTarot.checked; });
        refSig();
        // Aparência (F3.5): seleção de cor (paleta de tokens) + tamanho.
        let corEscolhida = o.cor || '';
        modal.querySelector('#cf-cores').addEventListener('click', (e) => {
            const b = e.target.closest('.cf-cor'); if (!b) return;
            corEscolhida = b.dataset.cor;
            modal.querySelectorAll('.cf-cor').forEach((x) => x.classList.toggle('sel', x === b));
        });
        modal.querySelector('#cf-escala').value = String(o.escala || 1);
        modal.addEventListener('click', (e) => { if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) fechar(); });

        modal.querySelector('#cf-salvar').addEventListener('click', async () => {
            const nome = modal.querySelector('#cf-nome').value.trim();
            if (!nome) { if (window.mostrarToast) mostrarToast('Nome obrigatório.', 'aviso'); return; }
            const descricao = modal.querySelector('#cf-desc').value.trim();
            const usarTarot = modal.querySelector('#cf-usar-tarot').checked;
            const cartaVal = modal.querySelector('#cf-carta').value;
            const or = modal.querySelector('input[name="cf-or"]:checked')?.value === '-1' ? -1 : 1;
            const cor = corEscolhida || null;
            const escala = parseFloat(modal.querySelector('#cf-escala').value) || 1;
            try {
                await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos/${id}`, { method: 'PUT', body: JSON.stringify({ nome, descricao, cor, escala }) });
                if (usarTarot && cartaVal !== '') {
                    await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos/${id}/tarot`, { method: 'PUT', body: JSON.stringify({ carta_num: parseInt(cartaVal, 10), orientacao: or }) });
                } else if (!usarTarot && t) { // desmarcou o Tarot que existia → remove
                    await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos/${id}/tarot`, { method: 'DELETE' });
                }
                fechar(); // API.onMutacao recarrega a constelação
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao salvar.', 'erro'); }
        });
        modal.querySelector('#cf-apagar').addEventListener('click', async () => {
            if (!confirm(`Apagar o núcleo "${o.nome}"? As entidades dele ficam sem facção.`)) return;
            try { await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos/${id}`, { method: 'DELETE' }); fechar(); }
            catch (_) { if (window.mostrarToast) mostrarToast('Erro ao apagar.', 'erro'); }
        });
        // F3.2b: reusa o modal de Diplomacia existente, JÁ FOCADO neste núcleo (dip-foco + change).
        modal.querySelector('#cf-diplo').addEventListener('click', async () => {
            fechar();
            if (window.abrirModalDiplomacia) {
                await window.abrirModalDiplomacia();
                const f = document.getElementById('dip-foco');
                if (f) { f.value = String(id); f.dispatchEvent(new Event('change')); }
            }
        });
        // F3.2b: criar entidade JÁ vinculada a este núcleo (POST /nodes com nucleo_id).
        modal.querySelector('#cf-criar-ent').addEventListener('click', () => { fechar(); abrirCriarEntidade(String(id), o.nome); });
        if (window.lucide) lucide.createIcons();
        modal.querySelector('#cf-nome').focus();
    }

    function abrirCriarEntidade(nucleoId, nucleoNome) {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-box">
                <div class="modal-head">
                    <h3 class="texto-roxo modal-titulo"><i data-lucide="user-plus"></i> Nova entidade em ${escapeHTML(nucleoNome)}</h3>
                    <button class="btn btn-ghost btn-sm" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <label class="campo-label">Nome</label>
                <input type="text" id="ce-nome" class="input-full" maxlength="120" autocomplete="off">
                <label class="campo-label">Tipo</label>
                <select id="ce-tipo" class="input-full">
                    <option value="npc">NPC</option>
                    <option value="protagonista">Protagonista</option>
                    <option value="faccao">Facção</option>
                    <option value="local">Local</option>
                    <option value="cenario">Cenário</option>
                </select>
                <div class="modal-acoes">
                    <button class="btn btn-primary" id="ce-criar"><i data-lucide="check"></i> Criar entidade</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const fechar = () => modal.remove();
        modal.addEventListener('click', (e) => { if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) fechar(); });
        modal.querySelector('#ce-criar').addEventListener('click', async () => {
            const nome = modal.querySelector('#ce-nome').value.trim();
            if (!nome) { if (window.mostrarToast) mostrarToast('Digite um nome.', 'aviso'); return; }
            const tipo = modal.querySelector('#ce-tipo').value;
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes`, { method: 'POST', body: JSON.stringify({ nome, tipo, nucleo_id: nucleoId }) });
                if (!res.ok) throw new Error('falha');
                fechar();
                if (window.mostrarToast) mostrarToast('Entidade criada no núcleo.', 'sucesso');
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao criar entidade.', 'erro'); }
        });
        if (window.lucide) lucide.createIcons();
        modal.querySelector('#ce-nome').focus();
    }

    // ── F3.3a: sistema solar (clique no núcleo → foco + entidades como planetas) ──
    function centrarCamera(o, zoom) {
        const c = canvas(); if (!c) return;
        const m = elMundo();
        if (m) { m.classList.add('animando'); setTimeout(() => m.classList.remove('animando'), 420); }
        cam.zoom = zoom;
        cam.x = c.clientWidth / 2 - o.x * zoom;
        cam.y = c.clientHeight / 2 - o.y * zoom;
        aplicarCamera();
    }

    function focar(id) {
        const o = orbes.find((x) => x.id === String(id));
        if (!o) return;
        focoId = String(id);
        o.fixo = true;                          // o sol fica parado durante o foco
        pararLoop();                            // o FUNDO 2D congela; o astrolábio anima sozinho via CSS (GPU)
        orbeEl.get(focoId)?.classList.add('is-sol'); // sol fica aceso; os outros núcleos esmaecem (CSS .em-foco)
        const c = canvas();
        c.classList.add('em-foco', 'astro-on');  // astro-on esconde o world-layer 2D sob o overlay
        centrarCamera(o, 1.8);                   // mantém o enquadramento p/ a saída do foco (fundo escondido pelo overlay)
        montarAstrolabio();                      // PIVÔ: visão solar 3D (astrolábio) no lugar dos planetas 2D
        mostrarBarraFoco(o);
    }

    function sairFoco() {
        if (!focoId) return;
        orbeEl.get(focoId)?.classList.remove('is-sol');
        const o = orbes.find((x) => x.id === focoId);
        if (o) o.fixo = false;
        focoId = null;
        fecharFeixe(); removerAstrolabio(); removerBarraFoco();
        const c = canvas(); if (c) c.classList.remove('em-foco', 'astro-on');
        iniciarLoop();
    }

    // ── PIVÔ: Astrolábio 3D (visão solar inclinada, decisão §6 de constelacao_visual.md) ──────────
    // Substitui a visão solar 2D no foco. Um disco inclinado (CSS 3D perspective/preserve-3d, zero libs)
    // com o sol no centro e as entidades orbitando em anéis cujo RAIO ∝ Reta agregada da entidade
    // (afinidade+ → órbita interna dourada "arcana"; afinidade− → externa vermelha "repulsão"). A rotação
    // é CSS puro (GPU-composited), lenta, com auto-pausa (aba oculta) e respeito a prefers-reduced-motion.
    const ASTRO_PERIODO = 120;      // s — volta da órbita MAIS EXTERNA (a interna, mais relevante, é mais rápida)
    const ASTRO_R_MIN = 92;         // px — raio da órbita mais interna (entidade MAIS relevante)
    const ASTRO_R_MAX = 300;        // px — raio da órbita mais externa (menos relevante)
    const BONUS_TIPO = { protagonista: 3, faccao: 2, npc: 1, local: 0, cenario: 0 }; // peso de papel narrativo
    // RELEVÂNCIA (decisão: híbrido grau + papel) → dita o RAIO (mais relevante = órbita mais interna).
    // grau = nº de sinapses incidentes na entidade (centralidade na teia, conta intra E cross-núcleo).
    function grauDe(entId) {
        const id = String(entId);
        let g = 0;
        for (const l of linksAtual) if (String(l.origem) === id || String(l.destino) === id) g++;
        return g;
    }
    const relevancia = (e) => grauDe(e.id) + (BONUS_TIPO[e.tipo] ?? 1); // tipo desconhecido = peso de npc (1)
    // AFINIDADE (Reta agregada dos laços INTRA-núcleo) → dita a COR do anel/orbe, independente do raio.
    function scoreReta(entId, intraSet) {
        let s = 0;
        for (const l of linksAtual) {
            const oo = String(l.origem), dd = String(l.destino);
            if (!intraSet.has(oo) || !intraSet.has(dd)) continue;     // só laços intra-núcleo
            if (oo === String(entId) || dd === String(entId)) s += Number(l.reta) || 0;
        }
        return s;
    }
    const astroValencia = (score) => (score > 1 ? 'astro--arcana' : score < -1 ? 'astro--repulsao' : 'astro--neutro');
    const ORBE_CAMADAS = '<span class="orbe-esfera"><span class="orbe-plasma"></span><span class="orbe-nucleo"></span><span class="orbe-vidro"></span></span>';

    function montarAstrolabio() {
        const sol = orbes.find((o) => o.id === focoId);
        removerAstrolabio(); fecharFeixe();   // rebuild (entrada/mutação) → fecha feixe antigo (orbe pode ter mudado/sumido)
        if (!sol) return;
        const ents = entidadesAtual.filter((e) => String(e.nucleo_id) === focoId);
        const intraSet = new Set(ents.map((e) => String(e.id)));
        const corSol = sol.cor ? `var(${corVar(sol.cor)})` : 'var(--destaque)';

        // Cada entidade ganha a SUA órbita: ordena por relevância (mais relevante → mais interna) e
        // distribui em raios distintos R_MIN..R_MAX. Empate desfeito por |afinidade| e nome (determinístico).
        const ordenadas = ents
            .map((e) => ({ e, score: scoreReta(e.id, intraSet), relev: relevancia(e) }))
            .sort((a, b) => b.relev - a.relev || Math.abs(b.score) - Math.abs(a.score) || String(a.e.nome).localeCompare(String(b.e.nome)));
        const n = ordenadas.length;
        const passo = n > 1 ? (ASTRO_R_MAX - ASTRO_R_MIN) / (n - 1) : 0;

        const vp = document.createElement('div');
        vp.className = 'astrolabio-viewport';
        const corpos = ordenadas.map(({ e, score, relev }, i) => {
            const raio = Math.round(ASTRO_R_MIN + i * passo);                          // rank 0 (top) = mais interno
            const val = astroValencia(score);                                          // afinidade → cor (anel + orbe)
            const dur = Math.max(28, Math.round(ASTRO_PERIODO * raio / ASTRO_R_MAX));   // interno mais rápido
            const atraso = -(i / Math.max(1, n)) * dur;                                // espalha as fases (spread angular)
            const dados = `data-ent-id="${escapeHTML(String(e.id))}" data-rank="${i + 1}" data-total="${n}" data-score="${score}" data-relev="${relev}"`;
            const anel = `<span class="astro-anel ${val}" style="width:${raio * 2}px;height:${raio * 2}px"></span>`;
            const corpo = `<span class="astro-orbita ${val}" style="--raio:${raio}px;animation-duration:${dur}s;animation-delay:${atraso}s">
                <span class="astro-corpo">
                    <span class="astro-encara" style="animation-duration:${dur}s;animation-delay:${atraso}s">
                        <span class="astro-levanta">
                            <span class="astro-orbe" ${dados} title="${escapeHTML(e.nome)} (${escapeHTML(e.tipo || '')})">${ORBE_CAMADAS}<span class="constelacao-planeta-nome">${escapeHTML(e.nome)}</span></span>
                        </span>
                    </span>
                </span>
            </span>`;
            return anel + corpo;
        }).join('');
        vp.innerHTML = `<div class="astrolabio-3d" style="--rot-z:0deg">
            ${corpos}
            <span class="astro-centro" style="--cor-orbe:${corSol}">${ORBE_CAMADAS}</span>
        </div>`;
        canvas().appendChild(vp);
        astroViewport = vp;
        if (document.hidden) vp.classList.add('astro-pausado');
        ligarAstroDrag(vp);
    }

    function removerAstrolabio() {
        if (astroViewport) { astroViewport.remove(); astroViewport = null; }
        else canvas()?.querySelectorAll('.astrolabio-viewport').forEach((el) => el.remove());
    }

    // Interação no astrolábio: arrastar gira o disco (--rot-z); clique LIMPO num orbe abre o feixe holográfico.
    function ligarAstroDrag(vp) {
        const plano = vp.querySelector('.astrolabio-3d');
        let arr = null, rot0 = 0, sx = 0, sy = 0, moveu = false, alvo = null;
        vp.addEventListener('pointerdown', (e) => {
            e.stopPropagation();                                     // não vira pan do canvas
            arr = e.clientX; rot0 = parseFloat(plano.style.getPropertyValue('--rot-z')) || 0;
            sx = e.clientX; sy = e.clientY; moveu = false;
            alvo = e.target.closest && e.target.closest('.astro-orbe');
            try { vp.setPointerCapture(e.pointerId); } catch (_) {}
        });
        vp.addEventListener('pointermove', (e) => {
            if (arr === null) return;
            if (Math.hypot(e.clientX - sx, e.clientY - sy) > 5) moveu = true; // virou arrasto (gira), não clique
            const z = rootZoom();
            plano.style.setProperty('--rot-z', (rot0 + (e.clientX - arr) / z * 0.4) + 'deg'); // 0.4°/px
        });
        const fim = (e) => {
            if (arr !== null && !moveu && alvo) abrirFeixe(alvo);     // clique limpo num orbe → feixe holográfico
            arr = null; alvo = null;
            try { vp.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        vp.addEventListener('pointerup', fim);
        vp.addEventListener('pointercancel', fim);
    }

    // ── §4.1: Feixe holográfico ───────────────────────────────────────────────────────────────────
    // Clique no orbe → painel-projeção que sai por um FEIXE da borda do orbe, hospedando o menu da entidade
    // (Sinapses + Editar/Mudar núcleo/Deletar). Congela o disco enquanto aberto p/ o feixe ficar ancorado.
    // As mutações passam pelo `API.onMutacao` → `recarregar` → `montarAstrolabio` → `fecharFeixe` (auto).
    function fecharFeixe() {
        if (feixeEl) { feixeEl.remove(); feixeEl = null; }
        astroViewport?.classList.remove('astro-congelado');
    }

    function abrirFeixe(orbeDiv) {
        const id = orbeDiv.dataset.entId;
        const ent = entidadesAtual.find((e) => String(e.id) === String(id));
        if (!ent) return;
        fecharFeixe();
        astroViewport?.classList.add('astro-congelado');             // congela a rotação → orbe parado p/ ancorar o feixe
        const c = canvas(); if (!c) return;
        const z = rootZoom(), cr = c.getBoundingClientRect(), orb = orbeDiv.getBoundingClientRect();
        const ax = (orb.left + orb.width / 2 - cr.left) / z, ay = (orb.top + orb.height / 2 - cr.top) / z; // centro do orbe (px layout)
        const PW = 232, larg = c.clientWidth, alt = c.clientHeight;
        const dir = ax + 76 + PW < larg;                             // painel à direita se couber, senão à esquerda
        const px = dir ? Math.min(ax + 76, larg - PW - 10) : Math.max(10, ax - 76 - PW);
        const py = clamp(ay - 60, 10, Math.max(10, alt - 240));

        const score = Number(orbeDiv.dataset.score) || 0;
        const afin = score > 1 ? { t: 'Aliado interno', cls: 'feixe--aliado', ic: 'heart' }
            : score < -1 ? { t: 'Inimigo interno', cls: 'feixe--inimigo', ic: 'swords' }
                : { t: 'Neutro', cls: 'feixe--neutro', ic: 'minus' };
        const alvoX = px + (dir ? 6 : PW - 6), alvoY = py + 22;       // ponto do painel onde o feixe encosta
        const dx = alvoX - ax, dy = alvoY - ay, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;

        const wrap = document.createElement('div');
        wrap.className = 'feixe-wrap';
        wrap.innerHTML = `
            <span class="feixe-raio ${afin.cls}" style="left:${ax}px;top:${ay}px;width:${len}px;transform:rotate(${ang}deg)"></span>
            <div class="feixe-painel ${afin.cls}" style="left:${px}px;top:${py}px;width:${PW}px">
                <div class="feixe-head">
                    <span class="feixe-nome">${escapeHTML(ent.nome)}</span>
                    <button class="btn btn-ghost btn-sm" data-fx="fechar" title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <div class="feixe-tipo">${escapeHTML(ent.tipo || '—')}</div>
                <div class="feixe-leitura">
                    <span class="feixe-chip"><i data-lucide="gem"></i> Relevância ${escapeHTML(orbeDiv.dataset.rank)}/${escapeHTML(orbeDiv.dataset.total)}</span>
                    <span class="feixe-chip feixe-chip--afin"><i data-lucide="${afin.ic}"></i> ${afin.t} (${score > 0 ? '+' : ''}${score})</span>
                </div>
                <div class="feixe-acoes">
                    <button class="btn btn-outline btn-sm" data-fx="historia"><i data-lucide="scroll-text"></i> História</button>
                    <button class="btn btn-outline btn-sm" data-fx="reputacao"><i data-lucide="gem"></i> Reputação</button>
                    <button class="btn btn-outline btn-sm" data-fx="sinapses"><i data-lucide="share-2"></i> Sinapses</button>
                    <button class="btn btn-outline btn-sm" data-fx="editar"><i data-lucide="edit"></i> Editar nome</button>
                    <button class="btn btn-outline btn-sm" data-fx="mover"><i data-lucide="map-pin"></i> Mudar núcleo</button>
                    <button class="btn btn-outline btn-sm btn-del" data-fx="deletar"><i data-lucide="trash"></i> Deletar</button>
                </div>
                <div class="feixe-sub"></div>
            </div>`;
        c.appendChild(wrap);
        feixeEl = wrap;
        wrap.addEventListener('pointerdown', (e) => e.stopPropagation()); // mexer no painel não pan/gira o disco
        wrap.addEventListener('click', (e) => {
            const fx = e.target.closest('[data-fx]') && e.target.closest('[data-fx]').dataset.fx;
            if (!fx) return;
            if (fx === 'fechar') fecharFeixe();
            else if (fx === 'historia') feixeHistoria(wrap, id);
            else if (fx === 'reputacao') feixeReputacao(wrap, id);
            else if (fx === 'sinapses') { if (window.abrirModalSinapses) window.abrirModalSinapses(id); }
            else if (fx === 'editar') feixeEditarNome(wrap, id, ent.nome);
            else if (fx === 'mover') feixeMoverNucleo(wrap, id);
            else if (fx === 'deletar') feixeDeletar(e.target.closest('[data-fx]'), id, ent.nome);
        });
        if (window.lucide) lucide.createIcons();
    }

    // História/biografia: lazy GET ao abrir (Regra 2.3), textarea, PUT salva em dados.historia. O save NÃO
    // recarrega a constelação (skip /historia no onMutacao) → o feixe fica aberto p/ continuar escrevendo.
    function feixeHistoria(wrap, id) {
        const sub = wrap.querySelector('.feixe-sub'); if (!sub) return;
        sub.innerHTML = `<textarea class="input-sm input-full feixe-historia" rows="6" maxlength="8000" placeholder="A história deste personagem…" disabled>A carregar…</textarea>
            <button class="btn btn-primary btn-sm" data-go="historia"><i data-lucide="check"></i> Salvar história</button>`;
        const ta = sub.querySelector('.feixe-historia');
        (async () => {
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/historia`);
                const j = res.ok ? await res.json() : { historia: '' };
                ta.value = j.historia || '';
            } catch (_) { ta.value = ''; }
            ta.disabled = false; ta.focus();
        })();
        sub.querySelector('[data-go="historia"]').addEventListener('click', async () => {
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/historia`, { method: 'PUT', body: JSON.stringify({ historia: ta.value.trim() }) });
                if (!res.ok) throw new Error('falha');
                if (window.mostrarToast) mostrarToast('História salva.', 'sucesso');
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao salvar a história.', 'erro'); }
        });
        if (window.lucide) lucide.createIcons();
    }

    // ── Reputação no feixe (reputacao.md Fatia 2): ledger de fama/infâmia (-10..+10) com barra+agulha
    // (reusa a estética da Reta), adicionar (+Fama/−Infâmia) e remover. Mutações /reputacao ficam FORA do
    // recarregar do disco (skip no onMutacao) → re-render no lugar a partir do retorno do endpoint. ──────────
    function barraReputHTML(posicao) {
        const pos = Math.max(-10, Math.min(10, parseInt(posicao, 10) || 0));
        const metade = (Math.abs(pos) / 10) * 50;
        const fill = pos > 0 ? 'reput-fill--fama' : (pos < 0 ? 'reput-fill--infamia' : '');
        const estilo = pos >= 0 ? `left:50%;width:${metade}%;` : `left:${50 - metade}%;width:${metade}%;`;
        const agulha = 50 + (pos / 10) * 50;
        return `<span class="reta-barra"><span class="reta-zero"></span><span class="reta-fill ${fill}" style="${estilo}"></span><span class="reta-agulha" style="left:${agulha}%;"></span></span>`;
    }

    function renderReputacao(box, data) {
        const { posicao, tier, eventos } = data;
        const sinalNum = `${posicao > 0 ? '+' : ''}${posicao}`;
        const ladoCls = tier.lado === 'fama' ? 'reput-pos--fama' : (tier.lado === 'infamia' ? 'reput-pos--infamia' : 'reput-pos--neutro');
        const lista = (eventos || []).map((ev) => {
            const cls = ev.sinal > 0 ? 'tag--fama' : 'tag--infamia';
            const ic = ev.sinal > 0 ? 'plus' : 'minus';
            return `<span class="tag ${cls}"><i data-lucide="${ic}" class="tag-selo"></i>${escapeHTML(ev.texto)}<i data-lucide="x" class="tag-remover" data-rep-del="${escapeHTML(String(ev.id))}" title="Remover"></i></span>`;
        }).join('');
        box.innerHTML = `
            <input type="text" class="input-sm input-full reput-input" maxlength="200" placeholder="Fato de reputação…">
            <div class="reput-add">
                <button type="button" class="btn btn-sm btn-fama" data-rep-act="1"><i data-lucide="plus"></i> Fama</button>
                <button type="button" class="btn btn-sm btn-infamia" data-rep-act="-1"><i data-lucide="minus"></i> Infâmia</button>
            </div>
            ${barraReputHTML(posicao)}
            <div class="reta-rotulo"><span class="reta-pos ${ladoCls}">${sinalNum}</span><span class="reta-tier">${escapeHTML(tier.nivel === 'neutro' ? 'Desconhecido' : tier.rotulo)}</span></div>
            <div class="tag-lista reput-lista">${lista}</div>`;
        if (window.lucide) lucide.createIcons();
        box.querySelector('.reput-input')?.focus();
    }

    function feixeReputacao(wrap, id) {
        const sub = wrap.querySelector('.feixe-sub'); if (!sub) return;
        sub.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'reput-box';
        box.innerHTML = '<p class="feixe-tipo">A carregar reputação…</p>';
        sub.appendChild(box);
        const VAZIO = { posicao: 0, tier: { nivel: 'neutro', rotulo: 'Desconhecido', lado: 'neutro' }, eventos: [] };

        const carregar = async () => {
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/reputacao`);
                renderReputacao(box, res.ok ? await res.json() : VAZIO);
            } catch (_) { box.innerHTML = '<p class="feixe-tipo">Erro ao carregar a reputação.</p>'; }
        };
        const adicionar = async (sinal) => {
            const input = box.querySelector('.reput-input');
            const texto = (input && input.value || '').trim();
            if (!texto) { input?.focus(); return; }
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/reputacao`, { method: 'POST', body: JSON.stringify({ texto, sinal }) });
                if (!res.ok) throw new Error('falha');
                renderReputacao(box, await res.json());
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao adicionar reputação.', 'erro'); }
        };
        const remover = async (eventoId) => {
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/reputacao/${eventoId}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('falha');
                renderReputacao(box, await res.json());
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao remover.', 'erro'); }
        };
        // Listeners delegados no box (sobrevivem ao re-render do innerHTML; o box é recriado a cada abertura).
        box.addEventListener('click', (e) => {
            const act = e.target.closest('[data-rep-act]'); if (act) return adicionar(parseInt(act.dataset.repAct, 10));
            const del = e.target.closest('[data-rep-del]'); if (del) return remover(del.dataset.repDel);
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.classList.contains('reput-input')) { e.preventDefault(); adicionar(1); } // Enter = +Fama
        });
        carregar();
    }

    // Sub-formulários inline no painel (editar/mover/confirmar). Mutações → API.onMutacao refaz + fecha o feixe.
    function feixeEditarNome(wrap, id, nomeAtual) {
        const sub = wrap.querySelector('.feixe-sub'); if (!sub) return;
        sub.innerHTML = `<input type="text" class="input-sm input-full feixe-input" maxlength="120" value="${escapeHTML(nomeAtual)}">
            <button class="btn btn-primary btn-sm" data-go="nome"><i data-lucide="check"></i> Salvar</button>`;
        const input = sub.querySelector('.feixe-input');
        const salvar = async () => {
            const nome = input.value.trim(); if (!nome) return;
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}`, { method: 'PUT', body: JSON.stringify({ nome }) });
                if (!res.ok) throw new Error('falha'); // onMutacao → recarregar → montarAstrolabio → fecharFeixe
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao renomear.', 'erro'); }
        };
        sub.querySelector('[data-go="nome"]').addEventListener('click', salvar);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); });
        if (window.lucide) lucide.createIcons();
        input.focus(); input.select();
    }

    function feixeMoverNucleo(wrap, id) {
        const sub = wrap.querySelector('.feixe-sub'); if (!sub) return;
        const opcoes = orbes.filter((o) => o.id !== focoId)
            .map((o) => `<option value="${escapeHTML(o.id)}">${escapeHTML(o.nome)}</option>`).join('');
        sub.innerHTML = `<select class="input-sm input-full feixe-sel"><option value="">— Sem núcleo —</option>${opcoes}</select>
            <button class="btn btn-primary btn-sm" data-go="mover"><i data-lucide="check"></i> Mover</button>`;
        sub.querySelector('[data-go="mover"]').addEventListener('click', async () => {
            const nucleo_id = sub.querySelector('.feixe-sel').value || null;
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/nucleo`, { method: 'PUT', body: JSON.stringify({ nucleo_id }) });
                if (!res.ok) throw new Error('falha'); // onMutacao refaz; saindo do núcleo focado, some do astrolábio
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao mover entidade.', 'erro'); }
        });
        if (window.lucide) lucide.createIcons();
    }

    function feixeDeletar(btn, id, nome) {
        if (btn.dataset.armado === '1') {                            // 2º clique confirma (sem confirm() nativo)
            (async () => {
                try {
                    const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('falha'); // onMutacao → recarregar → fecharFeixe
                    if (window.mostrarToast) mostrarToast(`"${nome}" apagada.`, 'sucesso');
                } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao apagar.', 'erro'); }
            })();
            return;
        }
        btn.dataset.armado = '1';
        btn.innerHTML = '<i data-lucide="alert-triangle"></i> Confirmar?';
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
            if (btn.isConnected && btn.dataset.armado === '1') { btn.dataset.armado = '0'; btn.innerHTML = '<i data-lucide="trash"></i> Deletar'; if (window.lucide) lucide.createIcons(); }
        }, 3000);
    }

    function removerBarraFoco() { document.getElementById('constelacao-foco-barra')?.remove(); }
    function mostrarBarraFoco(o) {
        removerBarraFoco();
        const c = canvas(); if (!c) return;
        const bar = document.createElement('div');
        bar.id = 'constelacao-foco-barra';
        bar.className = 'constelacao-foco-barra';
        bar.innerHTML = `
            <span class="cfb-nome">${escapeHTML(o.nome)}</span>
            <button class="btn btn-sm btn-outline" data-acao="config"><i data-lucide="settings"></i> Configurar</button>
            <button class="btn btn-sm btn-outline" data-acao="criar"><i data-lucide="user-plus"></i> Entidade</button>
            <button class="btn btn-sm btn-ghost" data-acao="sair"><i data-lucide="x"></i> Sair</button>`;
        c.appendChild(bar);
        bar.addEventListener('pointerdown', (e) => e.stopPropagation()); // não deixa o clique virar pan do canvas
        bar.addEventListener('click', (e) => {
            const ac = e.target.closest('[data-acao]')?.dataset.acao;
            if (ac === 'config') abrirConfigNucleo(focoId);
            else if (ac === 'criar') abrirCriarEntidade(focoId, o.nome);
            else if (ac === 'sair') sairFoco();
        });
        if (window.lucide) lucide.createIcons();
    }

    // ── F3.4b: conectar núcleos (arrastar âncora → diplomacia) ─────────────
    function criarTempLinha() {
        removerTempLinha();
        const wl = wrapLinhas(); if (!wl) return;
        tempLinha = document.createElementNS(SVGNS, 'line');
        tempLinha.setAttribute('class', 'constelacao-linha-temp');
        wl.appendChild(tempLinha);
    }
    function atualizarTempLinha(x1, y1, x2, y2) {
        if (!tempLinha) return;
        tempLinha.setAttribute('x1', x1); tempLinha.setAttribute('y1', y1);
        tempLinha.setAttribute('x2', x2); tempLinha.setAttribute('y2', y2);
    }
    function removerTempLinha() { if (tempLinha) { tempLinha.remove(); tempLinha = null; } }

    const mesmoPar = (d, aId, bId) =>
        (String(d.a) === String(aId) && String(d.b) === String(bId)) ||
        (String(d.a) === String(bId) && String(d.b) === String(aId));

    // Diplomacia é bulk-replace: parte da diplomacia atual, troca/insere/remove o par e re-envia tudo.
    async function definirDiplomaciaEntre(aId, bId, status) {
        const base = diplomaciaAtual.filter((d) => !mesmoPar(d, aId, bId)).map((d) => ({ nucleoA: d.a, nucleoB: d.b, status: d.status }));
        if (status) base.push({ nucleoA: String(aId), nucleoB: String(bId), status });
        try {
            const res = await API.fetch(`/cronicas/${cronicaAtual}/diplomacia`, { method: 'PUT', body: JSON.stringify({ relacoes: base }) });
            if (!res.ok) throw new Error('falha'); // o API.onMutacao recarrega a constelação
        } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao salvar a diplomacia.', 'erro'); }
    }

    function abrirPickerDiplomacia(aId, bId) {
        const a = orbes.find((o) => o.id === String(aId)), b = orbes.find((o) => o.id === String(bId));
        if (!a || !b) return;
        const existe = diplomaciaAtual.some((d) => mesmoPar(d, aId, bId));
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-box">
                <div class="modal-head">
                    <h3 class="texto-roxo modal-titulo"><i data-lucide="handshake"></i> Diplomacia</h3>
                    <button class="btn btn-ghost btn-sm" data-fechar title="Fechar"><i data-lucide="x"></i></button>
                </div>
                <p class="dip-par">${escapeHTML(a.nome)} <i data-lucide="arrow-left-right"></i> ${escapeHTML(b.nome)}</p>
                <div class="dip-opcoes">
                    <button class="btn btn-outline" data-status="aliado"><i data-lucide="heart"></i> Aliado</button>
                    <button class="btn btn-outline" data-status="neutro"><i data-lucide="minus"></i> Neutro</button>
                    <button class="btn btn-outline" data-status="inimigo"><i data-lucide="swords"></i> Inimigo</button>
                </div>
                ${existe ? '<button class="btn btn-ghost btn-sm dip-remover" data-status="">Remover laço</button>' : ''}
            </div>`;
        document.body.appendChild(modal);
        const fechar = () => modal.remove();
        modal.addEventListener('click', async (e) => {
            if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) { fechar(); return; }
            const btn = e.target.closest && e.target.closest('[data-status]');
            if (!btn) return;
            await definirDiplomaciaEntre(aId, bId, btn.dataset.status || null);
            fechar();
        });
        if (window.lucide) lucide.createIcons();
    }

    window.Constelacao = { entrar, sair };
})();
