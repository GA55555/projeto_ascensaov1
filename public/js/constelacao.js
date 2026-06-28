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
    let diplomaciaAtual = [];                 // diplomacia do último snapshot [{a,b,status}] (base p/ conectar)
    let conectandoDe = null;                  // orbe-origem de um arrasto de conexão (âncora)
    let tempLinha = null;                     // linha temporária do arrasto de conexão
    let interacaoPronta = false;
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
            div.innerHTML = `<span class="constelacao-orbe-nome">${escapeHTML(o.nome)}</span>${selo}<span class="constelacao-orbe-ancora" title="Arraste até outro núcleo para definir a diplomacia"></span>`;
            wo.appendChild(div);
            orbeEl.set(o.id, div);
        }
        desenhar();
        if (focoId) { const sol = orbes.find((o) => o.id === focoId); if (sol) renderPlanetas(sol); else sairFoco(); }
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

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && focoId) sairFoco(); });
        document.getElementById('constelacao-salvar')?.addEventListener('click', salvarLayout);

        // Recálculo ao mudar o mundo (paralelo ao da frescura do Oráculo). Só quando a lente está ativa.
        if (window.API && typeof API.onMutacao === 'function') {
            API.onMutacao((url) => {
                if (/\/oraculo(\/|$|\?)/.test(url) || url.includes('/perfil/oraculo')) return;
                if (url.includes('/constelacao/posicoes')) return; // salvar layout NÃO deve recarregar (anti-jump)
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
            diplomaciaAtual = snap.diplomacia || [];
            forcas = ConstelacaoCalc.calcular(snap);
            criarOrbes(snap, false); // false = mantém posições/velocidades existentes
            montar();
            iniciarLoop();
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
        canvas().classList.add('em-foco');
        centrarCamera(o, 1.6);
        renderPlanetas(o);
        mostrarBarraFoco(o);
    }

    function sairFoco() {
        if (!focoId) return;
        const o = orbes.find((x) => x.id === focoId);
        if (o) o.fixo = false;
        focoId = null;
        removerPlanetas(); removerBarraFoco();
        const c = canvas(); if (c) c.classList.remove('em-foco');
        iniciarLoop();
    }

    function removerPlanetas() { (wrapOrbes()?.querySelectorAll('.constelacao-planeta') || []).forEach((el) => el.remove()); }
    function renderPlanetas(sol) {
        removerPlanetas();
        const wrap = wrapOrbes(); if (!wrap) return;
        const ents = entidadesAtual.filter((e) => String(e.nucleo_id) === focoId);
        const raio = diametroOrbe(sol) * 0.6 + 100;
        ents.forEach((e, i) => {
            const ang = (i / Math.max(1, ents.length)) * 2 * Math.PI - Math.PI / 2;
            const px = sol.x + Math.cos(ang) * raio, py = sol.y + Math.sin(ang) * raio;
            const div = document.createElement('div');
            div.className = 'constelacao-planeta';
            div.style.left = (px - 28) + 'px'; div.style.top = (py - 28) + 'px';
            div.title = `${e.nome} (${e.tipo})`;
            div.innerHTML = `<span class="constelacao-planeta-nome">${escapeHTML(e.nome)}</span>`;
            wrap.appendChild(div);
        });
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
