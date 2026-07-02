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
            window.entidadesAtual = entidadesAtual;
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
            if (ex) { ex.nome = n.nome; ex.avatar_url = n.avatar_url; ex.descricao = n.descricao; ex.tarot = n.tarot; ex.massa = massa; ex.cor = n.cor; ex.escala = n.escala; return ex; } // mantém posição/velocidade
            let pos;
            if (proximaSemente) { pos = { x: proximaSemente.x, y: proximaSemente.y }; proximaSemente = null; } // nasce onde o Narrador clicou
            else if (n.pos && typeof n.pos.x === 'number') { pos = { x: n.pos.x, y: n.pos.y }; }
            else { const ang = (i / Math.max(1, nucleos.length)) * 2 * Math.PI; pos = { x: centroMundo.x + Math.cos(ang) * raio, y: centroMundo.y + Math.sin(ang) * raio }; }
            return { id, nome: n.nome, avatar_url: n.avatar_url, descricao: n.descricao, cor: n.cor, escala: n.escala, tarot: n.tarot, x: pos.x, y: pos.y, vx: 0, vy: 0, massa, fixo: false };
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
            div.innerHTML = `${renderOrbeCamadas(o.avatar_url)}${selo}<button class="constelacao-orbe-diplo" title="Diplomacia deste núcleo"><i data-lucide="handshake"></i></button><span class="constelacao-orbe-nome">${escapeHTML(o.nome)}</span>`;
            wo.appendChild(div);
            orbeEl.set(o.id, div);
        }
        if (window.lucide) lucide.createIcons();   // ícone do botão de diplomacia nos orbes
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
            // Botão de Diplomacia (hover do orbe): abre a caixa de diplomacia do núcleo (não move/foca).
            const btnDiplo = e.target.closest && e.target.closest('.constelacao-orbe-diplo');
            if (btnDiplo) {
                const od = btnDiplo.closest('.constelacao-orbe');
                if (od && od.dataset.id) abrirDiplomaciaNucleo(od.dataset.id);
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
            if (feixeEl) { if (feixeEl._fecharConteudo && feixeEl._fecharConteudo()) return; fecharFeixe(); return; } // Esc: 1º fecha o holograma de conteúdo, depois o feixe
            if (focoId) sairFoco();
        });
        // Auto-pausa do astrolábio (decisão 7): aba/lente oculta → congela a rotação CSS (sem custo de GPU).
        document.addEventListener('visibilitychange', () => { astroViewport?.classList.toggle('astro-pausado', document.hidden); });
        document.getElementById('constelacao-salvar')?.addEventListener('click', salvarLayout);
        ligarBusca();   // §F3 parte 2: busca que foca a entidade/núcleo

        // Recálculo ao mudar o mundo (paralelo ao da frescura do Oráculo). Só quando a lente está ativa.
        if (window.API && typeof API.onMutacao === 'function') {
            API.onMutacao((url, metodo) => {
                if (/\/oraculo(\/|$|\?)/.test(url) || url.includes('/perfil/oraculo')) return;
                if (url.includes('/constelacao/posicoes')) return; // salvar layout NÃO deve recarregar (anti-jump)
                if (url.includes('/historia')) return; // história não muda o disco → mantém o feixe aberto
                if (url.includes('/reputacao')) return; // reputação (F2) não muda o disco ainda → feixe aberto
                if (url.includes('/flags') && metodo === 'PUT') return; // toggle de marco é otimista (não rebuilda)
                if (url.includes('/midia/upload') || url.includes('avatar=1')) return; // foto no feixe (F3): não refaz o disco / mantém o menu aberto
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
            window.entidadesAtual = entidadesAtual;
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
                    <button class="btn btn-outline btn-sm" id="cf-brasao" title="Alterar Brasão/Foto"><i data-lucide="image"></i> Brasão</button>
                    <button class="btn btn-danger btn-sm" id="cf-rem-brasao" title="Remover Brasão" ${o.avatar_url ? '' : 'hidden'}><i data-lucide="image-off"></i></button>
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
                // Sincroniza o orbe local (otimista) com o que acabou de ser salvo: o editor lê `o.descricao`
                // direto de `orbes`, então o reabrir mostra o estado novo SEM depender do timing do recarregar()
                // (que só refletia a descrição após um F5). Mesma instância reusada na reconciliação → sem drift.
                o.nome = nome; o.descricao = descricao; o.cor = cor; o.escala = escala;
                o.tarot = (usarTarot && cartaVal !== '') ? { carta_num: parseInt(cartaVal, 10), orientacao: or } : null;
                fechar(); // API.onMutacao recarrega a constelação (reconcilia física/visual)
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao salvar.', 'erro'); }
        });
        modal.querySelector('#cf-apagar').addEventListener('click', async () => {
            if (!confirm(`Apagar o núcleo "${o.nome}"? As entidades dele ficam sem facção.`)) return;
            try { await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos/${id}`, { method: 'DELETE' }); fechar(); }
            catch (_) { if (window.mostrarToast) mostrarToast('Erro ao apagar.', 'erro'); }
        });
        modal.querySelector('#cf-brasao').addEventListener('click', async () => {
            if (!window.selecionarEEnviarImagem) return;
            const url = await selecionarEEnviarImagem('nucleos');
            if (!url) return;
            try {
                await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos/${id}`, { method: 'PUT', body: JSON.stringify({ nome: o.nome, avatar_url: url }) });
                o.avatar_url = url;
                modal.querySelector('#cf-rem-brasao').hidden = false;
                if (window.mostrarToast) mostrarToast('Brasão atualizado!', 'sucesso');
            } catch { if (window.mostrarToast) mostrarToast('Erro ao salvar brasão.', 'erro'); }
        });
        const btnRemBrasao = modal.querySelector('#cf-rem-brasao');
        if (btnRemBrasao) btnRemBrasao.addEventListener('click', async () => {
            if (!o.avatar_url) return;
            try {
                await API.fetch(`/cronicas/${cronicaAtual}/entidade-nucleos/${id}`, { method: 'PUT', body: JSON.stringify({ nome: o.nome, avatar_url: null }) });
                o.avatar_url = null;
                modal.querySelector('#cf-rem-brasao').hidden = true;
                if (window.mostrarToast) mostrarToast('Brasão removido.', 'aviso');
            } catch { if (window.mostrarToast) mostrarToast('Erro ao remover brasão.', 'erro'); }
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
        window.focoAtualId = focoId;
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
        window.focoAtualId = null;
        fecharFeixe(); removerAstrolabio(); removerBarraFoco();
        const c = canvas(); if (c) c.classList.remove('em-foco', 'astro-on');
        iniciarLoop();
    }

    // ── §F3 parte 2: busca que FOCA a entidade/núcleo (substitui o filtro da Grelha — não há lista) ────
    // Combobox: filtra entidadesAtual/orbes por nome (sem acento), seta/Enter navegam. Escolher entidade →
    // foca o núcleo, pulsa o orbe e abre o menu; escolher núcleo → só foca. Acessível só na lente Constelação.
    function irPara(it) {
        if (!it) return;
        const nucId = String(it.nucleo_id);
        if (focoId !== nucId) { if (focoId) sairFoco(); focar(nucId); }   // entra/troca o foco → monta o astrolábio (síncrono)
        if (it.tipo === 'nuc') return;
        const orbe = astroViewport && astroViewport.querySelector(`.astro-orbe[data-ent-id="${it.id}"]`);
        if (!orbe) return;
        orbe.classList.add('astro-orbe--achado');
        setTimeout(() => orbe.classList.remove('astro-orbe--achado'), 1700);
        abrirFeixe(orbe);                                                  // foca + ABRE o menu da entidade (decisão UX)
    }

    function ligarBusca() {
        const input = document.getElementById('constelacao-busca-input');
        const box = document.getElementById('constelacao-busca-resultados');
        if (!input || !box) return;
        const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        let itens = [], idx = -1;

        const buscar = (q) => {
            const t = norm(q.trim()); if (!t) return [];
            const res = [];
            for (const e of entidadesAtual) if (norm(e.nome).includes(t)) {
                const nuc = orbes.find((o) => o.id === String(e.nucleo_id));
                res.push({ tipo: 'ent', id: String(e.id), nucleo_id: String(e.nucleo_id), nome: e.nome, sub: nuc ? nuc.nome : '—' });
            }
            for (const o of orbes) if (norm(o.nome).includes(t)) res.push({ tipo: 'nuc', id: String(o.id), nucleo_id: String(o.id), nome: o.nome, sub: 'núcleo' });
            return res.slice(0, 8);
        };
        const render = () => {
            if (!itens.length) { box.hidden = true; box.innerHTML = ''; return; }
            box.innerHTML = itens.map((it, i) => `<div class="cb-item${i === idx ? ' sel' : ''}" data-i="${i}">
                <i data-lucide="${it.tipo === 'nuc' ? 'globe' : 'user'}"></i>
                <span class="cb-nome">${escapeHTML(it.nome)}</span><span class="cb-sub">${escapeHTML(it.sub)}</span></div>`).join('');
            box.hidden = false;
            if (window.lucide) lucide.createIcons();
        };
        const fechar = () => { box.hidden = true; box.innerHTML = ''; itens = []; idx = -1; };
        const escolher = (it) => { if (!it) return; fechar(); input.value = ''; input.blur(); irPara(it); };

        input.addEventListener('input', () => { itens = buscar(input.value); idx = itens.length ? 0 : -1; render(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (itens.length) { idx = (idx + 1) % itens.length; render(); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (itens.length) { idx = (idx - 1 + itens.length) % itens.length; render(); } }
            else if (e.key === 'Enter') { e.preventDefault(); escolher(itens[idx] || itens[0]); }
            else if (e.key === 'Escape') { fechar(); input.value = ''; input.blur(); }
        });
        box.addEventListener('mousedown', (e) => { const el = e.target.closest('.cb-item'); if (el) { e.preventDefault(); escolher(itens[parseInt(el.dataset.i, 10)]); } });
        input.addEventListener('blur', () => setTimeout(fechar, 120)); // some ao perder foco (após permitir o clique)
    }

    // ── PIVÔ: Astrolábio 3D (visão solar inclinada, decisão §6 de constelacao_visual.md) ──────────
    // Substitui a visão solar 2D no foco. Um disco inclinado (CSS 3D perspective/preserve-3d, zero libs)
    // com o sol no centro e as entidades orbitando em anéis cujo RAIO ∝ Reta agregada da entidade
    // (afinidade+ → órbita interna dourada "arcana"; afinidade− → externa vermelha "repulsão"). A rotação
    // é CSS puro (GPU-composited), lenta, com auto-pausa (aba oculta) e respeito a prefers-reduced-motion.
    const ASTRO_PERIODO = 240;      // s — volta da órbita MAIS EXTERNA (a interna, mais relevante, é mais rápida); movimento lento
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
    const renderOrbeCamadas = (avatarUrl) => {
        const bg = avatarUrl ? `<span class="orbe-foto" style="background-image: url('${escapeHTML(avatarUrl)}')"></span>` : '';
        return `<span class="orbe-esfera">${bg}<span class="orbe-plasma"></span><span class="orbe-nucleo"></span><span class="orbe-vidro"></span></span>`;
    };

    // Marcos (flags) como SELOS num anel ao redor do orbe (Constelação Soberana F1): aceso=ligado /
    // vazado=desligado. Posição em volta do orbe (56px → centro 28, raio 36). Hover=nome (title); clique
    // curto alterna (ligarAstroDrag→toggleMarcoSeal); segurar abre o popover renomear/apagar (F1b). O
    // sub-painel "Marcos" do feixe (feixeMarcos) é a superfície soberana p/ adicionar/renomear/apagar.
    const humanizarFlag = (k) => String(k || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    function marcosOrbeHTML(flags) {
        const fs = (flags || []).filter((f) => f && f.key);
        if (!fs.length) return '';
        const R = 36, cx = 28, cy = 28, T = fs.length;
        const selos = fs.map((f, k) => {
            const a = -Math.PI / 2 + (k / T) * 2 * Math.PI;
            const x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R);
            const meta = f.meta || {};
            const pol = typeof meta.polaridade === 'number' ? meta.polaridade : (parseInt(meta.polaridade, 10) || 0);
            const cat = meta.categoria || '';
            const mag = meta.magnitude || meta.peso_estimado || 2;
            let corSelo = '';
            if (pol < 0 || cat === 'Fraqueza' || cat === 'Condição') corSelo = 'background:var(--vermelho-dano, #ef4444); border-color:#ef4444; box-shadow: 0 0 6px #ef4444;';
            else if (pol > 0 || cat === 'Vantagem' || cat === 'Aliança') corSelo = 'background:var(--azul-vida, #3b82f6); border-color:#3b82f6; box-shadow: 0 0 6px #3b82f6;';
            else if (cat === 'Pacto') corSelo = 'background:var(--roxo-neon, #a855f7); border-color:#a855f7; box-shadow: 0 0 6px #a855f7;';
            else if (f.value) corSelo = 'background:var(--dourado); border-color:var(--dourado); box-shadow: 0 0 6px var(--dourado);';
            const titleStr = `${escapeHTML(humanizarFlag(f.key))}${cat ? ` [${cat} - Tier ${mag}]` : ''}`;
            return `<span class="astro-marco-seal${f.value ? ' aceso' : ''}" data-flag-key="${escapeHTML(f.key)}" data-on="${f.value ? 1 : 0}" title="${titleStr}" style="left:${x}px;top:${y}px;${corSelo}"></span>`;
        }).join('');
        return `<span class="astro-marcos">${selos}</span>`;
    }

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
            const dur = Math.max(60, Math.round(ASTRO_PERIODO * raio / ASTRO_R_MAX));   // interno mais rápido (piso 60s)
            const atraso = -(i / Math.max(1, n)) * dur;                                // espalha as fases (spread angular)
            const dados = `data-ent-id="${escapeHTML(String(e.id))}" data-rank="${i + 1}" data-total="${n}" data-score="${score}" data-relev="${relev}"`;
            // AURA de reputação (Fatia 3): fama → halo dourado + orbe mais radiante; infâmia → halo vermelho
            // + orbe mais sombrio; intensidade ∝ |posição|. A afinidade agora vive SÓ no anel (libera o orbe).
            const rep = Math.max(-10, Math.min(10, Number(e.reputacao) || 0)), rAbs = Math.abs(rep);
            const aura = rep === 0 ? '' : `--rep-cor:${rep > 0 ? 'var(--dourado)' : 'var(--link-inimigo)'};--rep-blur:${Math.round(4 + rAbs * 1.8)}px;--rep-bright:${(1 + (rep > 0 ? rAbs * 0.02 : -rAbs * 0.035)).toFixed(2)}`;
            const anel = `<span class="astro-anel ${val}" style="width:${raio * 2}px;height:${raio * 2}px"></span>`;
            const corpo = `<span class="astro-orbita ${val}" style="--raio:${raio}px;animation-duration:${dur}s;animation-delay:${atraso}s">
                <span class="astro-corpo">
                    <span class="astro-encara" style="animation-duration:${dur}s;animation-delay:${atraso}s">
                        <span class="astro-levanta">
                            <span class="astro-orbe" ${dados} style="${aura}" title="${escapeHTML(e.nome)} (${escapeHTML(e.tipo || '')})">${renderOrbeCamadas(e.avatar_url)}${marcosOrbeHTML(e.flags)}<span class="constelacao-planeta-nome">${escapeHTML(e.nome)}</span></span>
                        </span>
                    </span>
                </span>
            </span>`;
            return anel + corpo;
        }).join('');
        vp.innerHTML = `<div class="astrolabio-3d" style="--rot-z:0deg">
            ${corpos}
            <span class="astro-centro" style="--cor-orbe:${corSol}">${renderOrbeCamadas(sol.avatar_url)}<button type="button" class="btn-tensao-raio" data-acao="tensoes-sol" style="position:absolute; top:100%; left:50%; transform:translate(-50%, 6px); z-index:10; padding:2px 8px; font-size:0.75rem;" title="Revelar tensões e preságios do núcleo"><i data-lucide="zap"></i> ⚡</button></span>
        </div>`;
        canvas().appendChild(vp);
        astroViewport = vp;
        if (document.hidden) vp.classList.add('astro-pausado');
        ligarAstroDrag(vp);
        ligarHoverInfo(vp);                  // §F1d: hover do sol + luas de marco
        carregarMapaMarcoEventos();          // lazy (1×/foco) → realça selos com evento + alimenta o tooltip da lua
        vp.addEventListener('click', (e) => {
            if (e.target.closest('[data-acao="tensoes-sol"]')) {
                e.stopPropagation();
                if (window.ConstelacaoTensao) {
                    const t = window.ConstelacaoTensao.detectarTensoesNucleo(focoId, orbes, entidadesAtual, linksAtual, diplomaciaAtual);
                    window.ConstelacaoTensao.abrirModalTensoes(`Tensões em ${sol.nome}`, t, focoId);
                }
            }
        });
    }

    function removerAstrolabio() {
        if (astroViewport) { astroViewport.remove(); astroViewport = null; }
        else canvas()?.querySelectorAll('.astrolabio-viewport').forEach((el) => el.remove());
    }

    // Interação no astrolábio: arrastar gira o disco (--rot-z); clique LIMPO num orbe abre o feixe holográfico.
    function ligarAstroDrag(vp) {
        const plano = vp.querySelector('.astrolabio-3d');
        let arr = null, rot0 = 0, sx = 0, sy = 0, moveu = false, alvo = null, alvoSeal = null, lpTimer = null, lpFired = false;
        const limparLP = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
        vp.addEventListener('pointerdown', (e) => {
            e.stopPropagation();                                     // não vira pan do canvas
            fecharSeloPop();                                         // pressionar fora fecha o popover do selo (o popover faz stopPropagation)
            arr = e.clientX; rot0 = parseFloat(plano.style.getPropertyValue('--rot-z')) || 0;
            sx = e.clientX; sy = e.clientY; moveu = false; lpFired = false;
            alvoSeal = e.target.closest && e.target.closest('.astro-marco-seal'); // selo de marco (prioridade)
            alvo = e.target.closest && e.target.closest('.astro-orbe');
            if (alvoSeal) {                                          // segurar o selo (320ms) → popover renomear/apagar
                const seal = alvoSeal;
                lpTimer = setTimeout(() => { lpTimer = null; if (!moveu) { lpFired = true; arr = null; abrirSeloPopover(seal); } }, 320);
            }
            try { vp.setPointerCapture(e.pointerId); } catch (_) {}
        });
        vp.addEventListener('pointermove', (e) => {
            if (arr === null) return;
            if (Math.hypot(e.clientX - sx, e.clientY - sy) > 5) { moveu = true; limparLP(); } // virou arrasto (gira), não clique/long-press
            const z = rootZoom();
            plano.style.setProperty('--rot-z', (rot0 + (e.clientX - arr) / z * 0.4) + 'deg'); // 0.4°/px
        });
        const fim = (e) => {
            limparLP();
            if (arr !== null && !moveu && !lpFired) {
                if (alvoSeal) toggleMarcoSeal(alvoSeal);             // clique curto no selo → alterna o marco
                else if (alvo) abrirFeixe(alvo);                     // clique limpo no orbe → núcleo holográfico
                else if (feixeEl) fecharFeixe();                     // clique limpo no vazio → fecha o holograma aberto
            }
            arr = null; alvo = null; alvoSeal = null;
            try { vp.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        vp.addEventListener('pointerup', fim);
        vp.addEventListener('pointercancel', fim);
    }

    // ── §F1b: Camada ÚNICA de mutação de Marcos ──────────────────────────────────────────────────────
    // DRY + Regra 2.9: um só ponto de entrada por operação, reusado pelo selo do orbe (toggle/long-press)
    // E pelo sub-painel "Marcos" do feixe. Normaliza a chave igual ao backend (mundoController:
    // trim+lower+'_'), mantém o cache `entidadesAtual` coerente e re-sincroniza os selos do orbe SEM
    // refazer o disco (os endpoints /flags estão no SKIP do onMutacao → o disco não pisca a cada edição).
    const marcoNorm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_');
    const flagsDe = (id) => { const e = entidadesAtual.find((x) => String(x.id) === String(id)); return e ? (e.flags = e.flags || []) : null; };

    // Re-desenha o anel de selos do orbe a partir do cache (após criar/renomear/apagar/toggle).
    function ressincronizarSelos(id) {
        const orbe = astroViewport?.querySelector(`.astro-orbe[data-ent-id="${id}"]`);
        if (!orbe) return;
        const ent = entidadesAtual.find((x) => String(x.id) === String(id));
        orbe.querySelector('.astro-marcos')?.remove();
        const html = marcosOrbeHTML(ent && ent.flags);
        if (html) orbe.querySelector('.constelacao-planeta-nome')?.insertAdjacentHTML('beforebegin', html);
        aplicarRealceMarcos();               // §F1d: re-aplica o realce de "tem evento" após re-render dos selos
    }

    async function setMarco(id, key, value) {  // toggle (PUT /flags) — também usado pelo selo otimista
        const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/flags`, { method: 'PUT', body: JSON.stringify({ flag_key: key, flag_value: value }) });
        if (!res.ok) throw new Error('falha');
        const f = (flagsDe(id) || []).find((x) => x.key === key); if (f) f.value = value;
    }
    async function criarMarco(id, nome) {       // POST /flags — o backend grava com flag_value=FALSE
        const chave = marcoNorm(nome); if (!chave) return null;
        const fl = flagsDe(id);
        if (fl && fl.some((f) => f.key === chave)) { if (window.mostrarToast) mostrarToast('Esse marco já existe.', 'aviso'); return null; }
        const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/flags`, { method: 'POST', body: JSON.stringify({ flag_key: nome }) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.erro || 'falha'); }
        if (fl) fl.push({ key: chave, value: false });
        ressincronizarSelos(id); return chave;
    }
    async function renomearMarco(id, key, novoNome) {  // PUT /flags/:key — enviamos a chave JÁ normalizada
        const novaKey = marcoNorm(novoNome); if (!novaKey || novaKey === key) return key;
        const fl = flagsDe(id);
        if (fl && fl.some((f) => f.key === novaKey)) { if (window.mostrarToast) mostrarToast('Já existe um marco com este nome.', 'aviso'); return key; }
        const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/flags/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ novo_nome: novaKey }) });
        if (!res.ok) throw new Error('falha');
        const f = fl && fl.find((x) => x.key === key); if (f) f.key = novaKey;
        ressincronizarSelos(id); return novaKey;
    }
    async function apagarMarco(id, key) {       // DELETE /flags/:key — cascateia os gatilhos no backend
        const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/flags/${encodeURIComponent(key)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('falha');
        const ent = entidadesAtual.find((x) => String(x.id) === String(id));
        if (ent && ent.flags) ent.flags = ent.flags.filter((f) => f.key !== key);
        ressincronizarSelos(id);
    }

    // Alterna um marco pelo selo no orbe (F1). Otimista + reverte no erro; delega a persistência a setMarco.
    async function toggleMarcoSeal(sealEl) {
        const orbe = sealEl.closest('.astro-orbe');
        const id = orbe && orbe.dataset.entId;
        if (!id) return;
        const key = sealEl.dataset.flagKey, on = sealEl.dataset.on === '1';
        sealEl.classList.toggle('aceso', !on); sealEl.dataset.on = on ? '0' : '1'; // otimista
        try { await setMarco(id, key, !on); }
        catch (_) {
            sealEl.classList.toggle('aceso', on); sealEl.dataset.on = on ? '1' : '0'; // reverte
            if (window.mostrarToast) mostrarToast('Erro ao alternar o marco.', 'erro');
        }
    }

    // ── §F1b: Popover do selo (long-press) — superfície inline p/ renomear/apagar um marco no próprio
    // orbe, com o disco CONGELADO durante a edição (resolve a ergonomia do orbe que orbita). ───────────
    let seloPop = null;
    function fecharSeloPop() { if (seloPop) { seloPop.remove(); seloPop = null; astroViewport?.classList.remove('astro-congelado'); } }

    function abrirSeloPopover(sealEl) {
        const orbe = sealEl.closest('.astro-orbe'); const id = orbe && orbe.dataset.entId; if (!id) return;
        const key = sealEl.dataset.flagKey;
        fecharSeloPop(); fecharFeixe();
        astroViewport?.classList.add('astro-congelado');                 // congela → ancora o popover ao selo
        const c = canvas(); if (!c) return;
        const z = rootZoom(), cr = c.getBoundingClientRect(), sr = sealEl.getBoundingClientRect();
        const sx = (sr.left + sr.width / 2 - cr.left) / z, sy = (sr.top + sr.height / 2 - cr.top) / z;
        const PW = 196;
        const px = clamp(sx + 12, 6, Math.max(6, c.clientWidth - PW - 6));
        const py = clamp(sy - 14, 6, Math.max(6, c.clientHeight - 96));
        const pop = document.createElement('div');
        pop.className = 'selo-pop';
        pop.style.cssText = `left:${px}px;top:${py}px;width:${PW}px`;
        pop.innerHTML = `
            <div class="selo-pop-nome">${escapeHTML(humanizarFlag(key))}</div>
            <input type="text" class="input-sm input-full selo-pop-input" maxlength="60" value="${escapeHTML(humanizarFlag(key))}">
            <div class="selo-pop-acoes">
                <button type="button" class="btn btn-primary btn-sm" data-sp="renomear"><i data-lucide="check"></i> Renomear</button>
                <button type="button" class="btn btn-outline btn-sm btn-del" data-sp="apagar" title="Apagar"><i data-lucide="trash-2"></i></button>
            </div>`;
        c.appendChild(pop); seloPop = pop;
        pop.addEventListener('pointerdown', (e) => e.stopPropagation());  // mexer no popover não gira o disco
        pop.addEventListener('wheel', (e) => e.stopPropagation());        // não dá zoom no canvas ao interagir
        const inp = pop.querySelector('.selo-pop-input'); inp.focus(); inp.select();
        const doRename = async () => {
            const novo = inp.value.trim(); if (!novo) { fecharSeloPop(); return; }
            try { await renomearMarco(id, key, novo); fecharSeloPop(); }
            catch (_) { if (window.mostrarToast) mostrarToast('Erro ao renomear marco.', 'erro'); }
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRename(); else if (e.key === 'Escape') fecharSeloPop(); });
        pop.addEventListener('click', async (e) => {
            const sp = e.target.closest('[data-sp]') && e.target.closest('[data-sp]').dataset.sp; if (!sp) return;
            if (sp === 'renomear') { doRename(); return; }
            const btn = e.target.closest('[data-sp="apagar"]');
            if (btn.dataset.armado === '1') { try { await apagarMarco(id, key); fecharSeloPop(); } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao apagar marco.', 'erro'); } }
            else { btn.dataset.armado = '1'; btn.classList.add('btn-del-marco-confirmar'); btn.innerHTML = 'apagar?';
                   setTimeout(() => { if (btn.isConnected) { btn.dataset.armado = '0'; btn.classList.remove('btn-del-marco-confirmar'); btn.innerHTML = '<i data-lucide="trash-2"></i>'; if (window.lucide) lucide.createIcons(); } }, 3000); }
        });
        if (window.lucide) lucide.createIcons();
    }

    // ── §F1d: Hover Previews holográficos (Regra 7.2) — Sol (métricas do núcleo) e Luas de marco ──────
    // Reverse-lookup marco→eventos, montado UMA vez ao entrar no foco (lazy, Regra 2.3) a partir de
    // GET /eventos (mesma técnica da Grelha). Hover na lua = nome+estado+eventos(peso/pool/resumo); selos
    // com evento ganham realce. Hover no sol = peso do núcleo + entidades/sinapses/afinidade/reputação/diplomacia.
    let mapaMarcoEventos = {};                 // `${nodeId}_${flagKey}` → [{nome,resumo,peso,pool_atual,pool_maxima}]
    let eventosCache = [];                      // lista completa de eventos (com gatilhos normalizados) p/ o wiring F2
    let mapaMarcoFoco = null;                  // foco p/ o qual o mapa foi carregado (evita refetch)
    const chaveMarcoEv = (nodeId, key) => `${nodeId}_${String(key).toLowerCase().trim().replace(/\s+/g, '_')}`;
    const gatilhoDoMarco = (ev, nodeId, key) => (ev.gatilhos || []).find((x) => String(x.node_id) === String(nodeId) && marcoNorm(x.flag_key) === key);

    // Busca /eventos, normaliza gatilhos, reconstrói o reverse-lookup e realça os selos. Usado no 1º load
    // do foco E após cada mutação de vínculo (o backend recalcula pool/status → refetch garante coerência).
    async function recarregarEventos() {
        try {
            const res = await API.fetch(`/cronicas/${cronicaAtual}/eventos`);
            if (!res.ok) return;
            eventosCache = (await res.json()) || [];
        } catch (_) { return; }
        mapaMarcoEventos = {};
        eventosCache.forEach((ev) => {
            let g = ev.gatilhos; if (typeof g === 'string') { try { g = JSON.parse(g); } catch (_) { g = []; } }
            ev.gatilhos = Array.isArray(g) ? g : [];
            ev.gatilhos.forEach((x) => {
                if (!x || !x.node_id || !x.flag_key) return;
                (mapaMarcoEventos[chaveMarcoEv(x.node_id, x.flag_key)] ||= []).push({
                    nome: ev.nome, resumo: ev.descricao || '', peso: x.peso, pool_atual: ev.pool_atual, pool_maxima: ev.pool_maxima,
                });
            });
        });
        aplicarRealceMarcos();
        if (feixeEl && feixeEl.dataset && feixeEl.dataset.entId) {
            const satEv = feixeEl.querySelector('.holo-satelite[data-fx="eventos"].ativo');
            const contEl = feixeEl.querySelector('.holo-conteudo');
            if (satEv && contEl) feixeEventos(contEl, feixeEl.dataset.entId);
        }
    }
    async function carregarMapaMarcoEventos() {
        if (mapaMarcoFoco === focoId) return;  // já carregado p/ este foco
        mapaMarcoFoco = focoId;
        await recarregarEventos();
    }

    function aplicarRealceMarcos() {
        if (!astroViewport) return;
        astroViewport.querySelectorAll('.astro-orbe').forEach((orbe) => {
            const id = orbe.dataset.entId;
            orbe.querySelectorAll('.astro-marco-seal').forEach((s) => {
                s.classList.toggle('astro-marco-seal--evt', (mapaMarcoEventos[chaveMarcoEv(id, s.dataset.flagKey)] || []).length > 0);
            });
        });
    }

    // Métricas agregadas do núcleo focado (tudo do snapshot client-side → zero fetch).
    function metricasNucleo() {
        const sol = orbes.find((o) => o.id === focoId); if (!sol) return null;
        const ents = entidadesAtual.filter((e) => String(e.nucleo_id) === focoId);
        const intra = new Set(ents.map((e) => String(e.id)));
        let peso = 0, aliados = 0, inimigos = 0, neutros = 0, repSoma = 0;
        ents.forEach((e) => {
            peso += relevancia(e);
            const s = scoreReta(e.id, intra);
            if (s > 1) aliados++; else if (s < -1) inimigos++; else neutros++;
            repSoma += Number(e.reputacao) || 0;
        });
        let sinapses = 0;
        for (const l of linksAtual) if (intra.has(String(l.origem)) && intra.has(String(l.destino))) sinapses++;
        return { sol, n: ents.length, peso, aliados, inimigos, neutros, repMedia: ents.length ? Math.round(repSoma / ents.length) : 0, sinapses };
    }

    function holoTipSolHTML() {
        const m = metricasNucleo(); if (!m) return '';
        const repTxt = m.repMedia > 0 ? `+${m.repMedia} (fama)` : (m.repMedia < 0 ? `${m.repMedia} (infâmia)` : 'neutra');
        const t = m.sol.tarot;  // {carta_num, orientacao} → rótulo do arcano (igual ao selo do orbe)
        const tarotTxt = t && t.carta_num ? `Arcano ${ROMANO[t.carta_num] || t.carta_num}${t.orientacao === -1 ? ' (invertido)' : ''}` : '';
        return `
            <div class="holo-tip-titulo">${escapeHTML(m.sol.nome)}</div>
            ${tarotTxt ? `<div class="holo-tip-sub">${escapeHTML(tarotTxt)}</div>` : ''}
            <div class="holo-tip-linha holo-tip-peso"><i data-lucide="scale"></i> Peso do núcleo <b>${m.peso}</b></div>
            <div class="holo-tip-linha"><i data-lucide="users"></i> ${m.n} entidade${m.n === 1 ? '' : 's'} · ${m.sinapses} sinapse${m.sinapses === 1 ? '' : 's'}</div>
            <div class="holo-tip-linha"><i data-lucide="venetian-mask"></i> ${m.aliados} aliados · ${m.neutros} neutros · ${m.inimigos} inimigos</div>
            <div class="holo-tip-linha"><i data-lucide="gem"></i> Reputação média: ${escapeHTML(repTxt)}</div>`;
    }

    function holoTipMarcoHTML(nodeId, key, aceso) {
        const evs = mapaMarcoEventos[chaveMarcoEv(nodeId, key)] || [];
        const head = `<div class="holo-tip-titulo">${escapeHTML(humanizarFlag(key))} <span class="holo-tip-estado holo-tip-estado--${aceso ? 'on' : 'off'}">${aceso ? 'aceso' : 'apagado'}</span></div>`;
        if (mapaMarcoFoco !== focoId) return head + '<div class="holo-tip-mut">A carregar eventos…</div>';
        if (!evs.length) return head + '<div class="holo-tip-mut">Sem evento atrelado.</div>';
        const lista = evs.map((ev) => {
            const res = (ev.resumo || '').trim();
            return `<div class="holo-tip-ev">
                <div class="holo-tip-ev-top"><i data-lucide="zap"></i> ${escapeHTML(ev.nome)} <span class="holo-tip-peso-tag">peso ${escapeHTML(String(ev.peso))}</span></div>
                <div class="holo-tip-ev-pool">pool ${escapeHTML(String(ev.pool_atual ?? 0))}/${escapeHTML(String(ev.pool_maxima ?? 0))}</div>
                ${res ? `<div class="holo-tip-ev-res">${escapeHTML(res.length > 96 ? res.slice(0, 96) + '…' : res)}</div>` : ''}
            </div>`;
        }).join('');
        return head + `<div class="holo-tip-evlbl">Dispara ${evs.length} evento${evs.length === 1 ? '' : 's'}:</div>${lista}`;
    }

    let holoTip = null;
    function esconderHoloTip() {
        if (holoTip) { holoTip.remove(); holoTip = null; }
        if (!feixeEl && !seloPop) astroViewport?.classList.remove('astro-congelado'); // só descongela se nada mais segura o disco
    }
    function mostrarHoloTip(alvoEl, html) {
        esconderHoloTip();
        astroViewport?.classList.add('astro-congelado');          // congela → o alvo não escapa do cursor durante a leitura
        const c = canvas(); if (!c) return;
        const tip = document.createElement('div');
        tip.className = 'holo-tip holo--neutro';
        tip.innerHTML = html;
        c.appendChild(tip); holoTip = tip;
        if (window.lucide) lucide.createIcons();
        const z = rootZoom(), cr = c.getBoundingClientRect(), ar = alvoEl.getBoundingClientRect();
        const tw = tip.offsetWidth, th = tip.offsetHeight, P = 10;
        const cx = (ar.left + ar.width / 2 - cr.left) / z, cy = (ar.top + ar.height / 2 - cr.top) / z;
        let left = cx + 16; if (left + tw + P > c.clientWidth) left = cx - 16 - tw;  // vira pro outro lado se não couber
        tip.style.left = clamp(left, P, Math.max(P, c.clientWidth - tw - P)) + 'px';
        tip.style.top = clamp(cy - th / 2, P, Math.max(P, c.clientHeight - th - P)) + 'px';
    }

    // Wiring do hover no astrolábio (vp): lua de marco OU sol. Intent delay 110ms (não congela em passadas
    // rápidas); pointer-events:none no tooltip → o cursor fica no alvo (congelado) e o pointerout é fiável.
    function ligarHoverInfo(vp) {
        let showT = null, hideT = null, alvoAtual = null;
        const limpar = () => { if (showT) { clearTimeout(showT); showT = null; } if (hideT) { clearTimeout(hideT); hideT = null; } };
        vp.addEventListener('pointerover', (e) => {
            if (feixeEl || seloPop || e.buttons) return;          // menu/popover aberto OU arrastando → sem tooltip
            const seal = e.target.closest && e.target.closest('.astro-marco-seal');
            const sun = e.target.closest && e.target.closest('.astro-centro');
            const alvo = seal || sun; if (!alvo) return;
            if (alvo === alvoAtual && holoTip) { limpar(); return; }
            limpar();
            showT = setTimeout(() => {
                showT = null; if (feixeEl || seloPop || !vp.isConnected) return;
                alvoAtual = alvo;
                if (seal) { const orbe = seal.closest('.astro-orbe'); mostrarHoloTip(seal, holoTipMarcoHTML(orbe && orbe.dataset.entId, seal.dataset.flagKey, seal.dataset.on === '1')); }
                else mostrarHoloTip(sun, holoTipSolHTML());
            }, 110);
        });
        vp.addEventListener('pointerout', (e) => {
            const era = e.target.closest && (e.target.closest('.astro-marco-seal') || e.target.closest('.astro-centro'));
            if (!era) return;
            const to = e.relatedTarget;
            if (to && to.closest && (to.closest('.astro-marco-seal') || to.closest('.astro-centro'))) return; // foi p/ outro alvo
            limpar();
            hideT = setTimeout(() => { hideT = null; alvoAtual = null; esconderHoloTip(); }, 150);
        });
    }

    // ── §F1c: Núcleo Holográfico Radial ───────────────────────────────────────────────────────────
    // Clique no orbe → congela o disco e materializa um NÚCLEO central (identidade da entidade) com SATÉLITES
    // (ações) num anel ao redor (Regra 7.2 — repouso limpo, conteúdo on-demand). Hover num satélite abre o
    // holograma de conteúdo (reusa feixeHistoria/Reputacao/Marcos/…); clique FIXA (pin) p/ editar sem colapsar.
    // Esc/clicar fora fecha. Mutações → `API.onMutacao` → `recarregar` → `montarAstrolabio` → `fecharFeixe`.
    function fecharFeixe() {
        if (seloPop) fecharSeloPop();                // popover do selo e feixe são mutuamente exclusivos
        if (feixeEl) { feixeEl.remove(); feixeEl = null; }
        astroViewport?.classList.remove('astro-congelado');
    }

    // ── §F3: Foto da entidade (miniatura no núcleo do feixe). Reusa o uploader da Grelha (window.
    // selecionarEEnviarImagem). O PUT leva ?avatar=1 (no SKIP do onMutacao) → o disco NÃO se refaz; re-render
    // do menu no lugar com a nova miniatura. ──────────────────────────────────────────────────────────────
    async function salvarAvatar(id, url) {
        const ent = entidadesAtual.find((e) => String(e.id) === String(id)); if (!ent) return;
        try {
            const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}?avatar=1`, { method: 'PUT', body: JSON.stringify({ nome: ent.nome, avatar_url: url }) });
            if (!res.ok) throw new Error('falha');
            ent.avatar_url = url;
            if (window.mostrarToast) mostrarToast(url ? 'Foto atualizada!' : 'Foto removida.', url ? 'sucesso' : 'aviso');
            const orbe = astroViewport && astroViewport.querySelector(`.astro-orbe[data-ent-id="${id}"]`);
            if (orbe) abrirFeixe(orbe);              // re-render do menu c/ a nova miniatura (disco intacto)
        } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao salvar a foto.', 'erro'); }
    }
    async function enviarFotoEntidade(id) {
        if (typeof window.selecionarEEnviarImagem !== 'function') { if (window.mostrarToast) mostrarToast('Uploader indisponível.', 'erro'); return; }
        const url = await window.selecionarEEnviarImagem('entidades');   // abre seletor → /midia/upload (Sharp→WebP)
        if (url) await salvarAvatar(id, url);
    }
    function removerFotoEntidade(id) { return salvarAvatar(id, null); }

    function abrirFeixe(orbeDiv) {
        const id = orbeDiv.dataset.entId;
        const ent = entidadesAtual.find((e) => String(e.id) === String(id));
        if (!ent) return;
        esconderHoloTip();                                           // dispensa hover-preview ao abrir o menu
        fecharFeixe();
        astroViewport?.classList.add('astro-congelado');             // congela a rotação → orbe parado p/ ancorar o núcleo
        const c = canvas(); if (!c) return;
        const z = rootZoom(), cr = c.getBoundingClientRect(), orb = orbeDiv.getBoundingClientRect();
        const W = c.clientWidth, H = c.clientHeight, PAD = 12, R = 96, NW = 150;
        let ax = (orb.left + orb.width / 2 - cr.left) / z, ay = (orb.top + orb.height / 2 - cr.top) / z; // centro do orbe (px layout)

        const score = Number(orbeDiv.dataset.score) || 0;
        const afin = score > 1 ? { t: 'Aliado interno', cls: 'holo--aliado', ic: 'heart' }
            : score < -1 ? { t: 'Inimigo interno', cls: 'holo--inimigo', ic: 'swords' }
                : { t: 'Neutro', cls: 'holo--neutro', ic: 'minus' };

        const acoes = [
            { fx: 'historia',  ic: 'scroll-text', label: 'História',     tipo: 'holo' },
            { fx: 'reputacao', ic: 'gem',         label: 'Reputação',    tipo: 'holo' },
            { fx: 'marcos',    ic: 'flag',        label: 'Marcos',       tipo: 'holo' },
            { fx: 'eventos',   ic: 'zap',         label: 'Eventos',      tipo: 'holo' },   // F2: wiring marco→evento
            { fx: 'tensoes',   ic: 'sparkles',    label: 'Tensões',      tipo: 'acao' },   // Oráculo Matemático (clique abre modal)
            { fx: 'sinapses',  ic: 'share-2',     label: 'Sinapses',     tipo: 'acao' },   // abre modal externo (só clique)
            { fx: 'editar',    ic: 'edit',        label: 'Editar nome',  tipo: 'holo' },
            { fx: 'mover',     ic: 'map-pin',     label: 'Mudar núcleo', tipo: 'holo' },
            { fx: 'deletar',   ic: 'trash',       label: 'Deletar',      tipo: 'holo', del: true },
        ];
        const n = acoes.length;

        // Núcleo clampado p/ o anel caber na tela (mantém a ancoragem perto do orbe quando há espaço).
        ax = clamp(ax, R + PAD + NW / 2, Math.max(R + PAD + NW / 2, W - R - PAD - NW / 2));
        ay = clamp(ay, R + PAD + 34, Math.max(R + PAD + 34, H - R - PAD - 34));

        // Anel 360° edge-aware: cabe folga em todos os lados → círculo completo (do topo); senão → ARCO de
        // 220° voltado para o centro do canvas (o lado com mais espaço).
        const folga = Math.min(ax, W - ax, ay, H - ay);
        const cheio = folga >= 168;   // raio efetivo (edge-based) é bem maior que R → arco já com menos folga
        const ca = Math.atan2(H / 2 - ay, W / 2 - ax), span = (220 * Math.PI) / 180;
        const pos = acoes.map((_, k) => {
            const a = cheio ? (-Math.PI / 2 + (k / n) * 2 * Math.PI)
                            : (ca - span / 2 + (n > 1 ? k / (n - 1) : 0.5) * span);
            return { x: ax + Math.cos(a) * R, y: ay + Math.sin(a) * R, a }; // provisório; arrumarAnel reposiciona por aresta
        });

        // Geometria das linhas é definida em arrumarAnel (pós-render) p/ saírem da ARESTA do núcleo.
        const linhas = pos.map(() => `<span class="holo-linha ${afin.cls}"></span>`).join('');
        const sats = acoes.map((ao, k) => `<button class="holo-satelite${ao.del ? ' holo-sat--del' : ''}" data-fx="${ao.fx}" data-tipo="${ao.tipo}" style="left:${pos[k].x}px;top:${pos[k].y}px" title="${ao.label}"><i data-lucide="${ao.ic}"></i><span class="holo-sat-label">${ao.label}</span></button>`).join('');

        const wrap = document.createElement('div');
        wrap.className = 'holo-wrap';
        wrap.innerHTML = `
            ${linhas}
            <div class="holo-nucleo ${afin.cls}" style="left:${ax}px;top:${ay}px">
                <button class="holo-fechar" data-fx="fechar" title="Fechar (Esc)"><i data-lucide="x"></i></button>
                <div class="holo-nucleo-foto${ent.avatar_url ? ' tem' : ''}" data-fx="foto" role="button" title="${ent.avatar_url ? 'Trocar foto' : 'Adicionar foto'}">
                    ${ent.avatar_url ? `<img src="${escapeHTML(ent.avatar_url)}" alt="" draggable="false" onerror="this.style.display='none'">` : '<i data-lucide="camera"></i>'}
                    ${ent.avatar_url ? `<button class="holo-nucleo-foto-rm" data-fx="foto-rm" title="Tirar foto"><i data-lucide="image-off"></i></button>` : ''}
                </div>
                <div class="holo-nucleo-nome">${escapeHTML(ent.nome)}</div>
                <div class="holo-nucleo-tipo">${escapeHTML(ent.tipo || '—')}</div>
                <div class="holo-nucleo-chips">
                    <span class="holo-chip"><i data-lucide="gem"></i> ${escapeHTML(orbeDiv.dataset.rank)}/${escapeHTML(orbeDiv.dataset.total)}</span>
                    <span class="holo-chip"><i data-lucide="${afin.ic}"></i> ${score > 0 ? '+' : ''}${score}</span>
                </div>
            </div>
            ${sats}
            <div class="holo-conteudo ${afin.cls}" hidden>
                <div class="holo-conteudo-head"><span class="holo-conteudo-titulo"></span><span class="holo-pin" title="Fixado — clique no satélite p/ soltar"><i data-lucide="pin"></i></span></div>
                <div class="feixe-sub"></div>
            </div>`;
        c.appendChild(wrap);
        feixeEl = wrap;
        if (wrap.dataset) wrap.dataset.entId = String(id);

        const conteudo = wrap.querySelector('.holo-conteudo'), tituloEl = wrap.querySelector('.holo-conteudo-titulo');
        let fxAtivo = null, pinned = false, hoverT = null, closeT = null;
        const limparT = () => { if (hoverT) { clearTimeout(hoverT); hoverT = null; } if (closeT) { clearTimeout(closeT); closeT = null; } };

        // Arruma o anel por ARESTA (feedback do Narrador): cada satélite fica FORA do retângulo do núcleo com
        // um GAP de "flutuação"; a linha de neon sai da aresta do núcleo até a aresta interna do satélite
        // (projeção de tela). Medido pós-render (offsetWidth/Height já com os ícones Lucide expandidos).
        function arrumarAnel() {
            const nuc = wrap.querySelector('.holo-nucleo');
            const halfW = (nuc.offsetWidth || NW) / 2, halfH = (nuc.offsetHeight || 72) / 2, GAP = 52;
            const els = wrap.querySelectorAll('.holo-satelite'), lns = wrap.querySelectorAll('.holo-linha');
            els.forEach((el, k) => {
                const a = pos[k].a, ca2 = Math.cos(a), sa2 = Math.sin(a);
                const dCore = Math.min(halfW / Math.max(Math.abs(ca2), 1e-3), halfH / Math.max(Math.abs(sa2), 1e-3)); // centro→aresta do núcleo
                const sW = (el.offsetWidth || 90) / 2, sH = (el.offsetHeight || 30) / 2;
                const satReach = sW * Math.abs(ca2) + sH * Math.abs(sa2);   // meia-extensão do satélite na direção radial
                const Rc = dCore + GAP + satReach;
                let x = ax + ca2 * Rc, y = ay + sa2 * Rc;
                x = clamp(x, PAD + sW, Math.max(PAD + sW, W - PAD - sW));    // mantém o satélite inteiro na tela
                y = clamp(y, PAD + sH, Math.max(PAD + sH, H - PAD - sH));
                el.style.left = x + 'px'; el.style.top = y + 'px';
                pos[k].x = x; pos[k].y = y;                                 // atualiza p/ ancorar o conteúdo depois
                const ex = ax + ca2 * dCore, ey = ay + sa2 * dCore;         // origem da linha: aresta do núcleo
                const ix = x - ca2 * satReach, iy = y - sa2 * satReach;     // fim da linha: aresta interna do satélite
                const lx = ix - ex, ly = iy - ey, len = Math.max(0, Math.hypot(lx, ly)), deg = Math.atan2(ly, lx) * 180 / Math.PI;
                const ln = lns[k];
                if (ln) { ln.style.left = ex + 'px'; ln.style.top = ey + 'px'; ln.style.width = len + 'px'; ln.style.transform = `rotate(${deg}deg)`; }
            });
        }
        function posicionarConteudo(p) {
            const cw = conteudo.offsetWidth || 248, ch = conteudo.offsetHeight || 200;
            const left = Math.cos(p.a) < 0 ? p.x - 18 - cw : p.x + 18;
            const top = Math.sin(p.a) < 0 ? p.y - 18 - ch : p.y - 24;
            conteudo.style.left = clamp(left, PAD, Math.max(PAD, W - cw - PAD)) + 'px';
            conteudo.style.top = clamp(top, PAD, Math.max(PAD, H - ch - PAD)) + 'px';
        }
        function abrirConteudo(fx, fixar) {
            const k = acoes.findIndex((a) => a.fx === fx); if (k < 0) return;
            const ao = acoes[k];
            if (ao.tipo === 'acao') {
                if (fx === 'sinapses' && window.abrirModalSinapses) window.abrirModalSinapses(id);
                else if (fx === 'tensoes' && window.ConstelacaoTensao) {
                    const t = window.ConstelacaoTensao.detectarTensoesEntidade(id, orbes, entidadesAtual, linksAtual, diplomaciaAtual);
                    window.ConstelacaoTensao.abrirModalTensoes(`Tensões de ${ent.nome}`, t, id);
                }
                return;
            }
            fxAtivo = fx; pinned = !!fixar;
            tituloEl.textContent = ao.label;
            conteudo.hidden = false; conteudo.classList.toggle('holo-conteudo--pin', pinned);
            const sub = conteudo.querySelector('.feixe-sub'); sub.innerHTML = '';
            if (fx === 'historia') feixeHistoria(conteudo, id);
            else if (fx === 'reputacao') feixeReputacao(conteudo, id);
            else if (fx === 'marcos') feixeMarcos(conteudo, id);
            else if (fx === 'eventos') feixeEventos(conteudo, id);
            else if (fx === 'editar') feixeEditarNome(conteudo, id, ent.nome);
            else if (fx === 'mover') feixeMoverNucleo(conteudo, id);
            else if (fx === 'deletar') {
                sub.innerHTML = '<button class="btn btn-outline btn-sm btn-del" data-go="del"><i data-lucide="trash"></i> Deletar entidade</button>';
                sub.querySelector('[data-go="del"]').addEventListener('click', (e) => feixeDeletar(e.currentTarget, id, ent.nome));
                if (window.lucide) lucide.createIcons();
            }
            wrap.querySelectorAll('.holo-satelite').forEach((s) => s.classList.toggle('ativo', s.dataset.fx === fx));
            requestAnimationFrame(() => posicionarConteudo(pos[k]));
        }
        function fecharConteudo() {
            if (fxAtivo === null) return false;
            fxAtivo = null; pinned = false;
            conteudo.hidden = true; conteudo.classList.remove('holo-conteudo--pin');
            wrap.querySelectorAll('.holo-satelite.ativo').forEach((s) => s.classList.remove('ativo'));
            return true;
        }
        wrap._fecharConteudo = fecharConteudo;       // o Esc global fecha o conteúdo antes do feixe inteiro

        wrap.addEventListener('pointerdown', (e) => e.stopPropagation()); // clique nos elementos do holo não pan/gira o disco
        wrap.addEventListener('wheel', (e) => e.stopPropagation());       // roda rola a lista interna, não dá zoom no canvas
        wrap.addEventListener('pointerover', (e) => {
            if (closeT) { clearTimeout(closeT); closeT = null; }     // entrou em qualquer parte do holo (satélite OU conteúdo) → cancela o fecho
            const sat = e.target.closest('.holo-satelite'); if (!sat) return;
            if (hoverT) { clearTimeout(hoverT); hoverT = null; }
            if (sat.dataset.tipo !== 'holo' || pinned || fxAtivo === sat.dataset.fx) return; // 'acao'=só clique; fixado não troca por hover
            hoverT = setTimeout(() => { hoverT = null; if (wrap.isConnected) abrirConteudo(sat.dataset.fx, false); }, 110);
        });
        wrap.addEventListener('pointerout', (e) => {
            if (e.relatedTarget && wrap.contains(e.relatedTarget)) return; // ainda dentro do holo (satélite↔conteúdo)
            if (pinned) return;
            limparT();
            closeT = setTimeout(() => { closeT = null; if (wrap.isConnected && !pinned) fecharConteudo(); }, 200);
        });
        wrap.addEventListener('click', (e) => {
            const alvo = e.target.closest('[data-fx]'); if (!alvo) return;
            const fx = alvo.dataset.fx; limparT();
            if (fx === 'fechar') return fecharFeixe();
            if (fx === 'foto') return enviarFotoEntidade(id);              // F3: miniatura no núcleo → upload/trocar
            if (fx === 'foto-rm') return removerFotoEntidade(id);
            const ao = acoes.find((a) => a.fx === fx);
            if (ao && ao.tipo === 'acao') return abrirConteudo(fx, true);  // sinapses → modal
            if (fxAtivo === fx) {                                          // já aberto: fixa/solta SEM re-render (preserva edição)
                if (pinned) return fecharConteudo();                       // clicar de novo no fixado → solta/fecha
                pinned = true; conteudo.classList.add('holo-conteudo--pin'); return; // hover→pin sem recarregar conteúdo
            }
            abrirConteudo(fx, true);                                        // novo: clique abre e já fixa (pin) p/ editar sem colapsar
        });
        if (window.lucide) lucide.createIcons();
        arrumarAnel();   // pós-render: reposiciona por aresta + desenha as linhas de neon (síncrono → sem flash)
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
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/historia?_=${Date.now()}`); // anti-cache: relê fresco ao reabrir (senão o navegador serve a versão antiga até um F5)
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

    // ── §F1b: Marcos no feixe — superfície SOBERANA de gestão no-code (add/toggle/renomear/apagar).
    // As flags já vêm no snapshot (cache `entidadesAtual`) → render direto, SEM fetch (Regra 2.3).
    // Reusa a camada única de mutação; um único listener delegado no box (Regra 2.9). ──────────────────
    function marcoLinhaHTML(f) {
        const meta = f.meta || {};
        const cat = meta.categoria || '';
        const mag = meta.magnitude || meta.peso_estimado || '';
        const pol = typeof meta.polaridade === 'number' ? meta.polaridade : (parseInt(meta.polaridade, 10) || 0);
        let badgeStyle = '';
        if (pol < 0 || cat === 'Fraqueza' || cat === 'Condição') badgeStyle = 'background:color-mix(in srgb, #ef4444 15%, transparent); color:#ef4444; border:1px solid #ef4444;';
        else if (pol > 0 || cat === 'Vantagem' || cat === 'Aliança') badgeStyle = 'background:color-mix(in srgb, #3b82f6 15%, transparent); color:#3b82f6; border:1px solid #3b82f6;';
        else if (cat === 'Pacto') badgeStyle = 'background:color-mix(in srgb, #a855f7 15%, transparent); color:#a855f7; border:1px solid #a855f7;';
        else if (cat) badgeStyle = 'background:color-mix(in srgb, var(--dourado) 15%, transparent); color:var(--dourado); border:1px solid var(--dourado);';
        const badgeHTML = cat ? `<span style="font-size:0.65rem; padding:1px 5px; border-radius:8px; margin-left:6px; vertical-align:middle; ${badgeStyle}" title="Categoria: ${escapeHTML(cat)} | Magnitude: Tier ${mag || 2}">${escapeHTML(cat)}${mag ? ` T${mag}` : ''}</span>` : '';
        return `<div class="fx-marco" data-key="${escapeHTML(f.key)}">
            <button type="button" class="fx-marco-toggle${f.value ? ' aceso' : ''}" data-mc="toggle" title="${f.value ? 'Ligado — clique p/ desligar' : 'Desligado — clique p/ ligar'}"><i data-lucide="${f.value ? 'check-circle-2' : 'circle'}"></i></button>
            <span class="fx-marco-nome">${escapeHTML(humanizarFlag(f.key))}${badgeHTML}</span>
            <button type="button" class="btn-ghost fx-marco-edit" data-mc="renomear" title="Renomear"><i data-lucide="pencil"></i></button>
            <button type="button" class="btn-ghost fx-marco-del" data-mc="apagar" title="Apagar"><i data-lucide="x"></i></button>
        </div>`;
    }

    function feixeMarcos(wrap, id) {
        const sub = wrap.querySelector('.feixe-sub'); if (!sub) return;
        sub.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'fx-marcos-box';
        sub.appendChild(box);

        const desenhar = () => {
            const ent = entidadesAtual.find((x) => String(x.id) === String(id));
            const fs = (ent && ent.flags || []).filter((f) => f && f.key);
            box.innerHTML = `
                <div class="fx-marcos-lista">${fs.map(marcoLinhaHTML).join('') || '<p class="feixe-tipo fx-marcos-vazio">Sem marcos ainda.</p>'}</div>
                <input type="text" class="input-sm input-full fx-marco-novo" maxlength="60" placeholder="+ Novo marco (Enter)">
                <button type="button" class="btn btn-sm btn-outline btn-sugerir-marcos-ia" style="margin-top:8px; width:100%; display:flex; align-items:center; justify-content:center; gap:6px; color:var(--dourado); border-color:var(--dourado);" title="Sugestões com IA do Oráculo"><i data-lucide="sparkles"></i> ✨ Sugerir Marcos (IA)</button>`;
            if (window.lucide) lucide.createIcons();
        };
        desenhar();

        // Um único ponto de escuta delegado no box (Regra 2.9) — sobrevive aos re-renders do innerHTML.
        box.addEventListener('click', async (e) => {
            const btnIA = e.target.closest('.btn-sugerir-marcos-ia');
            if (btnIA && window.GeradorEnredo) {
                const ent = entidadesAtual.find((x) => String(x.id) === String(id));
                const notas = (ent && ent.historia) || '';
                window.GeradorEnredo.abrirModalSugerirMarcos(id, ent ? ent.nome : 'Entidade', ent ? ent.tipo : '', ent ? (ent.flags || []) : [], notas, async (novoMarcoNome) => {
                    await criarMarco(id, novoMarcoNome);
                    desenhar();
                });
                return;
            }
            const linha = e.target.closest('.fx-marco');
            const act = e.target.closest('[data-mc]') && e.target.closest('[data-mc]').dataset.mc;
            if (!linha || !act) return;
            const key = linha.dataset.key;
            if (act === 'toggle') {
                const f = (flagsDe(id) || []).find((x) => x.key === key); if (!f) return;
                try { await setMarco(id, key, !f.value); ressincronizarSelos(id); desenhar(); }
                catch (_) { if (window.mostrarToast) mostrarToast('Erro ao alternar o marco.', 'erro'); }
            } else if (act === 'renomear') {
                const nomeEl = linha.querySelector('.fx-marco-nome');
                nomeEl.innerHTML = `<input type="text" class="input-sm fx-marco-rename" maxlength="60" value="${escapeHTML(humanizarFlag(key))}">`;
                const inp = nomeEl.querySelector('input'); inp.focus(); inp.select();
                let done = false;
                const salvar = async () => {
                    if (done) return; done = true;
                    const novo = inp.value.trim();
                    if (!novo || marcoNorm(novo) === key) return desenhar();
                    try { await renomearMarco(id, key, novo); } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao renomear marco.', 'erro'); }
                    desenhar();
                };
                inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') salvar(); else if (ev.key === 'Escape') { done = true; desenhar(); } });
                inp.addEventListener('blur', salvar);
            } else if (act === 'apagar') {
                const btn = e.target.closest('[data-mc="apagar"]');
                if (btn.dataset.armado === '1') {
                    try { await apagarMarco(id, key); } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao apagar marco.', 'erro'); }
                    desenhar();
                } else {
                    btn.dataset.armado = '1'; btn.classList.add('btn-del-marco-confirmar'); btn.innerHTML = 'apagar?';
                    setTimeout(() => { if (btn.isConnected) { btn.dataset.armado = '0'; btn.classList.remove('btn-del-marco-confirmar'); btn.innerHTML = '<i data-lucide="x"></i>'; if (window.lucide) lucide.createIcons(); } }, 3000);
                }
            }
        });
        box.addEventListener('keydown', async (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {       // navegação por teclado entre os marcos (item 4)
                const linhas = Array.from(box.querySelectorAll('.fx-marco')); if (!linhas.length) return;
                e.preventDefault();
                const atual = e.target.closest && e.target.closest('.fx-marco');
                let i = atual ? linhas.indexOf(atual) : (e.key === 'ArrowDown' ? -1 : linhas.length);
                i = e.key === 'ArrowDown' ? Math.min(linhas.length - 1, i + 1) : Math.max(0, i - 1);
                const t = linhas[i].querySelector('.fx-marco-toggle'); t && t.focus();
                return;
            }
            if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('fx-marco-novo')) return;
            e.preventDefault();
            const nome = e.target.value.trim(); if (!nome) return;
            e.target.value = '';
            try { await criarMarco(id, nome); desenhar(); box.querySelector('.fx-marco-novo') && box.querySelector('.fx-marco-novo').focus(); }
            catch (err) { e.target.value = nome; if (window.mostrarToast) mostrarToast(err.message || 'Erro ao criar marco.', 'erro'); }
        });
    }

    // ── §F2: Eventos no feixe — wiring marco→evento no-code (vincular/desvincular/pesar) ─────────────
    // Holograma da entidade: acordeão por marco; expandir lista TODOS os eventos do mundo com pool, toggle
    // (vincular/desvincular) e stepper de peso. Reusa POST/DELETE /eventos/:id/pesos (upsert no peso);
    // o backend recalcula a pool → refetch (recarregarEventos) após cada mutação mantém tudo coerente.
    function feixeEventos(wrap, id) {
        const sub = wrap.querySelector('.feixe-sub'); if (!sub) return;
        sub.innerHTML = '';
        const box = document.createElement('div'); box.className = 'fx-ev-box';
        sub.appendChild(box);
        let expandido = null;   // marco (key) expandido no acordeão

        const flagsDaEnt = () => (((entidadesAtual.find((x) => String(x.id) === String(id)) || {}).flags) || []).filter((f) => f && f.key);
        const nLigados = (key) => eventosCache.filter((ev) => gatilhoDoMarco(ev, id, key)).length;

        function linhaEventoHTML(marcoKey, ev) {
            const g = gatilhoDoMarco(ev, id, marcoKey), lig = !!g, peso = g ? g.peso : 1;
            const acao = lig
                ? `<span class="fx-ev-peso"><button type="button" class="fx-ev-step" data-step="-1" title="Menos peso"><i data-lucide="minus"></i></button><b>${escapeHTML(String(peso))}</b><button type="button" class="fx-ev-step" data-step="1" title="Mais peso"><i data-lucide="plus"></i></button></span><button type="button" class="btn-ghost fx-ev-unlink" data-unlink title="Desvincular"><i data-lucide="x"></i></button>`
                : `<button type="button" class="btn-ghost fx-ev-link" data-link title="Vincular"><i data-lucide="plus"></i></button>`;
            return `<div class="fx-ev-linha${lig ? ' lig' : ''}" data-ev="${escapeHTML(String(ev.id))}">
                <span class="fx-ev-nome" title="${escapeHTML(ev.nome)}">${escapeHTML(ev.nome)}</span>
                <span class="fx-ev-pool" title="Pool do evento">${escapeHTML(String(ev.pool_atual ?? 0))}/${escapeHTML(String(ev.pool_maxima ?? 0))}</span>
                ${acao}</div>`;
        }

        const desenhar = () => {
            const fs = flagsDaEnt();
            if (mapaMarcoFoco !== focoId) { box.innerHTML = '<p class="feixe-tipo">A carregar eventos…</p>'; return; }
            if (!fs.length) { box.innerHTML = '<p class="feixe-tipo">Sem marcos nesta entidade. Crie em <b>Marcos</b>.</p>'; return; }
            box.innerHTML = fs.map((f) => {
                const aberto = expandido === f.key, nl = nLigados(f.key);
                const corpo = aberto
                    ? `<div class="fx-ev-lista">${eventosCache.length ? eventosCache.map((ev) => linhaEventoHTML(f.key, ev)).join('') : '<p class="feixe-tipo">Nenhum evento criado ainda (aba Eventos).</p>'}</div>`
                    : '';
                return `<div class="fx-ev-marco${aberto ? ' aberto' : ''}" data-key="${escapeHTML(f.key)}">
                    <button type="button" class="fx-ev-head" data-head>
                        <i data-lucide="${aberto ? 'chevron-down' : 'chevron-right'}"></i>
                        <span class="fx-ev-mk${f.value ? ' on' : ''}">${escapeHTML(humanizarFlag(f.key))}</span>
                        ${nl ? `<span class="fx-ev-cont">${nl}</span>` : ''}
                    </button>${corpo}</div>`;
            }).join('') + `<button type="button" class="btn btn-sm btn-outline btn-tecer-evento-ia" style="margin-top:12px; width:100%; display:flex; align-items:center; justify-content:center; gap:6px; color:var(--dourado); border-color:var(--dourado);" title="Tecer Evento de Conflito com IA"><i data-lucide="sparkles"></i> 🔮 Tecer Evento (IA)</button>`;
            if (window.lucide) lucide.createIcons();
        };
        desenhar();

        async function mutar(metodo, evId, marcoKey, peso) {
            const body = metodo === 'POST' ? { node_id: id, flag_key: marcoKey, peso } : { node_id: id, flag_key: marcoKey };
            try {
                const res = await API.fetch(`/cronicas/${cronicaAtual}/eventos/${evId}/pesos`, { method: metodo, body: JSON.stringify(body) });
                if (!res.ok) throw new Error('falha');
                await recarregarEventos();   // backend recalculou pool/status → refetch mantém coerente
                desenhar();
            } catch (_) { if (window.mostrarToast) mostrarToast('Erro ao atualizar o vínculo do evento.', 'erro'); }
        }

        box.addEventListener('click', (e) => {
            const btnTecer = e.target.closest('.btn-tecer-evento-ia');
            if (btnTecer && window.GeradorEnredo) {
                const ent = entidadesAtual.find((x) => String(x.id) === String(id));
                window.GeradorEnredo.abrirModalTecerProfecia({ focoId: id, focoTitulo: ent ? ent.nome : 'Entidade', callbackConfirmado: () => { recarregarEventos(); } });
                return;
            }
            const head = e.target.closest('[data-head]');
            if (head) { const k = head.closest('.fx-ev-marco').dataset.key; expandido = expandido === k ? null : k; desenhar(); return; }
            const linha = e.target.closest('.fx-ev-linha'); if (!linha) return;
            const marcoKey = linha.closest('.fx-ev-marco').dataset.key, evId = linha.dataset.ev;
            const ev = eventosCache.find((x) => String(x.id) === String(evId)); if (!ev) return;
            if (e.target.closest('[data-link]')) return mutar('POST', evId, marcoKey, 1);
            if (e.target.closest('[data-unlink]')) return mutar('DELETE', evId, marcoKey);
            const step = e.target.closest('[data-step]');
            if (step) { const g = gatilhoDoMarco(ev, id, marcoKey); if (g) mutar('POST', evId, marcoKey, Math.max(1, (g.peso || 1) + parseInt(step.dataset.step, 10))); }
        });
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
                const res = await API.fetch(`/cronicas/${cronicaAtual}/nodes/${id}/reputacao?_=${Date.now()}`); // anti-cache: relê fresco ao reabrir (mesmo motivo da História)
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
        let numTensoes = 0;
        if (window.ConstelacaoTensao) {
            const t = window.ConstelacaoTensao.detectarTensoesNucleo(o.id, orbes, entidadesAtual, linksAtual, diplomaciaAtual);
            numTensoes = t.length;
        }
        const bar = document.createElement('div');
        bar.id = 'constelacao-foco-barra';
        bar.className = 'constelacao-foco-barra';
        bar.innerHTML = `
            <span class="cfb-nome">${escapeHTML(o.nome)}</span>
            <button class="btn btn-sm btn-outline btn-tensao-raio" style="margin-left:8px;" data-acao="tensoes" title="Oráculo Matemático: ver tensões e preságios"><i data-lucide="zap"></i> Tensões (${numTensoes})</button>
            <button class="btn btn-sm btn-outline" data-acao="config"><i data-lucide="settings"></i> Configurar</button>
            <button class="btn btn-sm btn-outline" data-acao="criar"><i data-lucide="user-plus"></i> Entidade</button>
            <button class="btn btn-sm btn-ghost" data-acao="sair"><i data-lucide="x"></i> Sair</button>`;
        c.appendChild(bar);
        bar.addEventListener('pointerdown', (e) => e.stopPropagation()); // não deixa o clique virar pan do canvas
        bar.addEventListener('click', (e) => {
            const ac = e.target.closest('[data-acao]')?.dataset.acao;
            if (ac === 'tensoes' && window.ConstelacaoTensao) {
                const t = window.ConstelacaoTensao.detectarTensoesNucleo(o.id, orbes, entidadesAtual, linksAtual, diplomaciaAtual);
                window.ConstelacaoTensao.abrirModalTensoes(`Tensões em ${o.nome}`, t, o.id);
            }
            else if (ac === 'config') abrirConfigNucleo(focoId);
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

    const statusEntre = (aId, bId) => { const d = diplomaciaAtual.find((x) => mesmoPar(x, aId, bId)); return d ? d.status : ''; };

    // §UX: caixa de Diplomacia de UM núcleo (no-code) — lista os outros núcleos, cada um com Aliado/Neutro/
    // Inimigo (o atual realçado). Clique define/atualiza o laço; clicar no status já ativo remove. Otimista
    // (diplomaciaAtual) + persiste via definirDiplomaciaEntre (onMutacao → recarregar re-desenha as linhas).
    function abrirDiplomaciaNucleo(id) {
        const a = orbes.find((o) => o.id === String(id)); if (!a) return;
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `<div class="modal-box modal-box-md">
            <div class="modal-head">
                <h3 class="texto-roxo modal-titulo"><i data-lucide="handshake"></i> Diplomacia de ${escapeHTML(a.nome)}</h3>
                <button class="btn btn-ghost btn-sm" data-fechar title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <div class="dip-lista"></div></div>`;
        document.body.appendChild(modal);
        const lista = modal.querySelector('.dip-lista');
        const opt = (bId, val, ic, lbl, cls, atual) => `<button type="button" class="btn btn-outline btn-sm dip-opt ${cls}${atual === val ? ' sel' : ''}" data-alvo="${escapeHTML(bId)}" data-status="${val}" title="${lbl}"><i data-lucide="${ic}"></i></button>`;
        const desenhar = () => {
            const outros = orbes.filter((o) => o.id !== String(id));
            lista.innerHTML = outros.length ? outros.map((b) => {
                const st = statusEntre(id, b.id);
                return `<div class="dip-linha"><span class="dip-nome">${escapeHTML(b.nome)}</span><span class="dip-acoes">
                    ${opt(b.id, 'aliado', 'heart', 'Aliado', 'dip-aliado', st)}
                    ${opt(b.id, 'neutro', 'minus', 'Neutro', 'dip-neutro', st)}
                    ${opt(b.id, 'inimigo', 'swords', 'Inimigo', 'dip-inimigo', st)}
                </span></div>`;
            }).join('') : '<p class="feixe-tipo">Não há outros núcleos para relacionar.</p>';
            if (window.lucide) lucide.createIcons();
        };
        desenhar();
        const fechar = () => modal.remove();
        modal.addEventListener('click', (e) => {
            if (e.target === modal || (e.target.closest && e.target.closest('[data-fechar]'))) return fechar();
            const btn = e.target.closest && e.target.closest('.dip-opt'); if (!btn) return;
            const alvo = btn.dataset.alvo, status = btn.dataset.status;
            const novo = (statusEntre(id, alvo) === status) ? null : status;     // toggle: clicar no ativo remove o laço
            diplomaciaAtual = diplomaciaAtual.filter((d) => !mesmoPar(d, id, alvo));
            if (novo) diplomaciaAtual.push({ a: String(id), b: String(alvo), status: novo });
            desenhar();                                                          // feedback otimista imediato
            definirDiplomaciaEntre(id, alvo, novo);                             // persiste + re-desenha as linhas do mapa
        });
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

    window.recarregarEventos = recarregarEventos;
    window.Constelacao = { entrar, sair, recarregarEventos };
})();
