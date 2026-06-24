// escapeHTML é fornecido globalmente por utils.js (carregado antes deste ficheiro).

const cronicaId = new URLSearchParams(window.location.search).get('id');

if (!cronicaId) window.location.href = '/profile.html';
document.getElementById('btn-voltar-comunidade').href = `/painel_narrador.html?id=${cronicaId}`;

let monstrosCache = [];
let gridStackInstance = null;
let turnoAtualIndex = 0;

// Callbacks de lazy-load disparados quando um bloco é "despertado" da gaveta
const registroDespertar = {
    'bloco-eventos':    () => carregarEventosEscudo(),
    'bloco-automacoes': () => carregarAutomacoesEscudo()
};

function fecharModal(id) { document.getElementById(id).classList.remove('show'); }
function abrirModal(id) { document.getElementById(id).classList.add('show'); }

// ==========================================
// FUNÇÃO MOTOR: SINCRONIZADOR DE LAYOUT E GAVETAS
// ==========================================
window.atualizarDisposicaoModulos = function(layout) {
    if (!layout || !Array.isArray(layout) || layout.length === 0) return;

    const blocosNoLayout = layout.map(item => item.id);
    const modulosOpcionais = ['bloco-mundo', 'bloco-eventos', 'bloco-automacoes'];

    // Fase 1: Movimentação Física (Alinha quem deve estar no Grid vs Gaveta)
    modulosOpcionais.forEach(id => {
        const bloco = document.querySelector(`[gs-id="${id}"]`);
        if (!bloco) return;

        const deveEstarNoGrid = blocosNoLayout.includes(id);
        const estaNaGaveta = bloco.classList.contains('bloco-arquivado');

        if (deveEstarNoGrid && estaNaGaveta) {
            // Se o save diz que ele é ativo, mas ele está guardado, força o despertar
            transportarParaGrid(id);
        } else if (!deveEstarNoGrid && !estaNaGaveta) {
            // Se o save omitiu ele, significa que ele estava guardado na gaveta
            transportarParaGaveta(id);
        }
    });

    // Fase 2: Aplicação de Coordenadas (Agora que todos os ativos voltaram ao GridStack)
    layout.forEach(item => {
        const elemento = document.querySelector(`[gs-id="${item.id}"]`);
        if (elemento && !elemento.classList.contains('bloco-arquivado')) {
            gridStackInstance.update(elemento, { x: item.x, y: item.y, w: item.w, h: item.h });
        }
    });
};

// ==========================================
// 1. INICIALIZAÇÃO E LAYOUT
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!(await verificarSessao())) return;
    await inicializarGridModular();
    carregarCardsCombate();

    // Inicia a Engenharia de Mundo
    await carregarNucleosMundoEscudo();
    await inicializarMotorDeRegrasDaCronica();
    carregarMundoEscudo();

    // FORÇA O CARREGAMENTO IMEDIATO DAS NOVAS CAIXAS
    if (typeof carregarEventosEscudo === 'function') carregarEventosEscudo();
    if (typeof carregarAutomacoesEscudo === 'function') carregarAutomacoesEscudo();

    // ==========================================
    // EVENT LISTENERS — substitui todos os onclick/oninput/onchange inline
    // ==========================================

    // Header
    document.getElementById('btn-carregar-saves')?.addEventListener('click', () => abrirModalCarregarSaves());
    document.getElementById('btn-abrir-modal-salvar')?.addEventListener('click', () => abrirModal('modal-salvar-escudo'));

    // Combate
    document.getElementById('btn-turno-anterior')?.addEventListener('click', () => turnoAnterior());
    document.getElementById('btn-proximo-turno')?.addEventListener('click', () => proximoTurno());
    document.getElementById('btn-ordenar-iniciativa')?.addEventListener('click', () => ordenarIniciativa());

    // Transporte para a gaveta (Guardar/Despertar): ponto de entrada ÚNICO via
    // delegação em document.body (data-action). Listeners diretos foram removidos
    // porque colidiam com a delegação — o clique borbulhava e o handler delegado
    // lia o data-action recém-mutado, revertendo o transporte (violava a Regra 2.9).

    // Engenharia de Mundo — filtros e ações
    document.getElementById('filtro-nucleo-entidade-escudo')?.addEventListener('change', () => aplicarFiltrosMundoEscudo());
    document.getElementById('busca-mundo-escudo')?.addEventListener('input', () => aplicarFiltrosMundoEscudo());
    document.getElementById('btn-gerenciar-nucleos')?.addEventListener('click', () => gerenciarNucleosEscudo('entidade'));
    document.getElementById('btn-forjar-entidade')?.addEventListener('click', () => abrirModal('modal-forja-escudo'));

    // Eventos
    document.getElementById('btn-novo-evento')?.addEventListener('click', () => abrirModal('modal-novo-evento'));
    document.getElementById('busca-eventos-escudo')?.addEventListener('input', () => filtrarEventosEscudo());

    // Automações
    document.getElementById('btn-nova-automacao')?.addEventListener('click', () => abrirModalNovaAutomacao());

    // Gaveta
    document.getElementById('lingueta-gaveta-mestre')?.addEventListener('click', () => alternarGaveta('gaveta-mestre'));

    // Modal: Novo Monstro
    document.getElementById('btn-cancelar-monstro')?.addEventListener('click', () => fecharModal('modal-novo-monstro'));
    document.getElementById('btn-salvar-monstro')?.addEventListener('click', () => salvarNovoMonstro());

    // Modal: Imagem Expandida
    document.getElementById('btn-fechar-imagem-expandida')?.addEventListener('click', () => fecharModalExpandida());

    // Modal: Salvar Escudo
    document.getElementById('btn-cancelar-salvar-escudo')?.addEventListener('click', () => fecharModal('modal-salvar-escudo'));
    document.getElementById('btn-confirmar-salvar-escudo')?.addEventListener('click', () => salvarEstadoCompleto());

    // Modal: Carregar Escudo
    document.getElementById('btn-fechar-carregar-escudo')?.addEventListener('click', () => fecharModal('modal-carregar-escudo'));

    // Modal: Forja de Entidade
    document.getElementById('btn-cancelar-forja')?.addEventListener('click', () => fecharModal('modal-forja-escudo'));
    document.getElementById('btn-confirmar-forja')?.addEventListener('click', () => salvarForjaEscudo());

    // Modal: Núcleos
    document.getElementById('btn-criar-nucleo')?.addEventListener('click', () => criarNucleoEscudo());
    document.getElementById('btn-fechar-nucleos')?.addEventListener('click', () => fecharModal('modal-nucleos-escudo'));

    // Modal: Mover para Núcleo
    document.getElementById('btn-cancelar-mover-nucleo')?.addEventListener('click', () => fecharModal('modal-mover-nucleo-escudo'));
    document.getElementById('btn-confirmar-mover-nucleo')?.addEventListener('click', () => salvarMoverNucleoEscudo());

    // Modal: Novo Evento
    document.getElementById('btn-cancelar-novo-evento')?.addEventListener('click', () => fecharModal('modal-novo-evento'));
    document.getElementById('btn-confirmar-novo-evento')?.addEventListener('click', () => salvarNovoEvento());

    // Modal: Nova Automação
    document.getElementById('btn-cancelar-nova-automacao')?.addEventListener('click', () => fecharModal('modal-nova-automacao'));
    document.getElementById('btn-confirmar-nova-automacao')?.addEventListener('click', () => salvarNovaAutomacao());

    // Modal: Vínculo
    document.getElementById('vinculo-node-id')?.addEventListener('change', () => atualizarFlagsVinculo());
    document.getElementById('btn-cancelar-vinculo')?.addEventListener('click', () => fecharModal('modal-vinculo'));
    document.getElementById('btn-confirmar-vinculo')?.addEventListener('click', () => salvarVinculo());
});

async function inicializarGridModular() {
    gridStackInstance = GridStack.init({
        cellHeight: 80, margin: 10, animate: true, float: true
    });

    // Guias visuais de alinhamento: durante arrasto/resize marca a grade com a classe
    // 'grid-arrastando' (linhas + placeholder destacado no CSS). APENAS visual — não
    // persiste nada; não é auto-save, então não conflita com a Regra 2.7 abaixo.
    const gridEl = gridStackInstance.el;
    const ligarGuias = () => gridEl.classList.add('grid-arrastando');
    const desligarGuias = () => gridEl.classList.remove('grid-arrastando');
    gridStackInstance.on('dragstart', ligarGuias);
    gridStackInstance.on('resizestart', ligarGuias);
    gridStackInstance.on('dragstop', desligarGuias);
    gridStackInstance.on('resizestop', desligarGuias);

    // Regra 2.7: PROIBIDO auto-save atrelado a eventos do grid (change/added/removed).
    // O GridStack manipula apenas o DOM em memória; a persistência é explícita,
    // via botão "Salvar Layout" -> salvarEstadoCompleto() / persistirLayoutGrid().

    try {
        const res = await fetch(`/cronicas/${cronicaId}/layout`, { credentials: 'include' });
        if (res.ok) {
            const layout = await res.json();
            // Sincroniza o estado inicial perfeitamente
            window.atualizarDisposicaoModulos(layout);
        }
    } catch (err) { console.error("Falha ao carregar layout estrutural:", err); }
    document.querySelector('.grid-stack').classList.add('pronto');
}

window.persistirLayoutGrid = async function(silencioso = false) {
    const itensGrid = gridStackInstance.getGridItems();
    const payloadLayout = itensGrid.map(el => {
        const node = el.gridstackNode;
        return {
            id: String(el.getAttribute('gs-id') || 'bloco_generico'),
            x: parseInt(node.x) || 0,
            y: parseInt(node.y) || 0,
            w: parseInt(node.w) || 1,
            h: parseInt(node.h) || 1
        };
    });

    try {
        const res = await fetch(`/cronicas/${cronicaId}/layout`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ layout: payloadLayout })
        });
        if (res.ok && !silencioso) mostrarToast('Disposição do painel memorizada na Trama!', 'sucesso');
    } catch (err) { console.error(err); }
}

// Descobre o sistema de regras DESTA crônica e carrega o compêndio correto
// (ex.: dnd5e, mago_m20) nas Regras Rápidas — em vez do antigo valor fixo.
async function inicializarMotorDeRegrasDaCronica() {
    let slug = null;
    try {
        const res = await fetch(`/cronicas/${cronicaId}/sistema`, { credentials: 'include' });
        if (res.ok) {
            const dados = await res.json();
            slug = dados.slug;
        }
    } catch (err) {
        console.error('Falha ao identificar o sistema da crônica:', err);
    }
    await inicializarMotorDeRegras(slug);
}

// ==========================================
// 2. SISTEMA DE COMBATE (INTOCÁVEL)
// ==========================================
async function carregarCardsCombate() {
    try {
        const res = await fetch(`/cronicas/${cronicaId}/monstros`, { credentials: 'include' });
        if (res.ok) {
            monstrosCache = await res.json();
            renderizarGridCombate();
        }
    } catch (err) { console.error(err); }
}

window.proximoTurno = function() {
    if (!monstrosCache || monstrosCache.length === 0) return;
    let start = turnoAtualIndex;
    do {
        turnoAtualIndex = (turnoAtualIndex + 1) % monstrosCache.length;
        if (turnoAtualIndex === start) break;
    } while (monstrosCache[turnoAtualIndex].hp_atual <= 0);
    renderizarGridCombate();
}

window.turnoAnterior = function() {
    if (!monstrosCache || monstrosCache.length === 0) return;
    let start = turnoAtualIndex;
    do {
        turnoAtualIndex = (turnoAtualIndex - 1 + monstrosCache.length) % monstrosCache.length;
        if (turnoAtualIndex === start) break;
    } while (monstrosCache[turnoAtualIndex].hp_atual <= 0);
    renderizarGridCombate();
}

window.ordenarIniciativa = function() {
    monstrosCache.sort((a, b) => (b.iniciativa || 0) - (a.iniciativa || 0));
    turnoAtualIndex = 0;
    if (monstrosCache.length > 0 && monstrosCache[0].hp_atual <= 0) proximoTurno();
    else renderizarGridCombate();
}

function renderizarGridCombate() {
    const grid = document.getElementById('grid-combate');
    if(!grid) return; 
    grid.innerHTML = ''; 

    if (!monstrosCache || monstrosCache.length === 0) {
        grid.innerHTML = '<div class="info-block-vazio">O campo de batalha está vazio.</div>';
        return;
    }

    grid.innerHTML = monstrosCache.map((monstro, index) => {
        const hpMax = monstro.hp_max || 1;
        const hpAtual = monstro.hp_atual || 0;
        const pctHP = Math.max(0, Math.min(100, (hpAtual / hpMax) * 100));
        const hpExtra = Math.max(0, hpAtual - hpMax);
        const pctExtra = Math.min(100, (hpExtra / hpMax) * 100);
        
        const corHP = pctHP > 50 ? '#2ecc71' : (pctHP > 20 ? '#f1c40f' : '#e74c3c');
        const isMorto = hpAtual <= 0;
        const isAtivo = index === turnoAtualIndex && !isMorto;
        const isPassou = index < turnoAtualIndex && !isMorto;

        let cardClass = "card";
        if(isAtivo) cardClass += " ativo";
        if(isPassou) cardClass += " passou";

        return `
        <div class="card ${cardClass}" style="display: flex; flex-direction: column; gap: 8px;">
            ${isMorto ? '<div class="morto-overlay"><div class="marcador-morte" style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; min-height: 60px;"><i data-lucide="x" style="color: #ff0000; width: 48px; height: 48px; stroke-width: 5px; filter: drop-shadow(2px 2px 0px #000000);"></i></div></div>' : ''}

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong style="font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${escapeHTML(monstro.nome)}</strong>
                <button class="btn btn-danger btn-sm" style="padding: 2px 6px;" data-action="deletar-monstro" data-id="${monstro.id}"><i data-lucide="x"></i></button>
            </div>

            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 12px;">
                <img src="${escapeHTML(monstro.imagem_url)}" class="miniatura-card" data-action="ver-imagem" data-extra="${escapeHTML(monstro.imagem_url)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; cursor: pointer;">
                <div style="flex: 1;">
                    <label class="label-iniciativa">Iniciativa</label>
                    <input type="number" class="input-iniciativa" value="${monstro.iniciativa || 0}" data-action="alterar-iniciativa" data-id="${monstro.id}">
                </div>
            </div>

            <div>
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px;">
                    <span id="hp-text-${monstro.id}">HP: ${hpAtual}/${hpMax}${hpExtra > 0 ? ` (+${hpExtra})` : ''}</span>
                    <div style="display: flex; gap: 3px;">
                        <button class="btn btn-sm" style="padding: 1px 4px; color:#e74c3c;" data-action="alterar-hp" data-id="${monstro.id}" data-extra="-1">-1</button>
                        <button class="btn btn-sm" style="padding: 1px 4px; color:#2ecc71;" data-action="alterar-hp" data-id="${monstro.id}" data-extra="1">+1</button>
                    </div>
                </div>

                <div class="hp-barra-wrap">
                    <input type="range" class="hp-slider" min="0" max="${hpMax}" value="${hpAtual}"
                        style="background: linear-gradient(to right, ${corHP} ${pctHP}%, #3f3f46 ${pctHP}%);"
                        data-action="hp-slider" data-id="${monstro.id}" data-extra="${hpMax}">
                    <div class="barra-vida-extra ${hpExtra > 0 ? 'ativa' : ''}" style="width: ${pctExtra}%;"></div>
                </div>
                <div class="barra-bg" style="margin-top: 4px;">
                    <div class="barra-fill" id="hp-bar-${monstro.id}" style="width: ${pctHP}%; --hp-cor: ${pctHP > 50 ? '#2ecc71' : pctHP > 25 ? '#f1c40f' : '#ff0000'};"></div>
                    <div class="barra-vida-extra barra-vida-extra--secundaria ${hpExtra > 0 ? 'ativa' : ''}" style="width: ${pctExtra}%;"></div>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

window.atualizarHpVisual = function(slider, id, hpMax) {
    const novoHp = parseInt(slider.value);
    const pctHP = Math.max(0, Math.min(100, (novoHp / hpMax) * 100));
    const corHP = pctHP > 50 ? '#2ecc71' : (pctHP > 20 ? '#f1c40f' : '#e74c3c');
    slider.style.background = `linear-gradient(to right, ${corHP} ${pctHP}%, #3f3f46 ${pctHP}%)`;
    const hpTextSpan = document.getElementById(`hp-text-${id}`);
    if(hpTextSpan) hpTextSpan.innerText = `HP: ${novoHp}/${hpMax}`;
}

window.salvarHpSlider = function(id, novoHpStr) {
    const novoHp = parseInt(novoHpStr);
    const m = monstrosCache.find(x => x.id == id);
    if (m && m.hp_atual !== novoHp) {
        const diff = novoHp - m.hp_atual;
        alterarHP(id, diff); 
    }
}

window.alterarHP = async function(id, mudanca) {
    const m = monstrosCache.find(x => x.id == id);
    if (!m) return;
    // Vida extra (overheal): o +1 pode ultrapassar o hp_max; só o piso (0) é travado.
    // O slider tem max=hp_max, logo não gera overheal — apenas o botão +1.
    m.hp_atual = Math.max(0, m.hp_atual + mudanca);
    renderizarGridCombate();
    try { await fetch(`/cronicas/${cronicaId}/monstros/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ hp_atual: m.hp_atual })}); } catch (err) {}
}

window.alterarIniciativa = async function(id, novaIni) {
    const m = monstrosCache.find(x => x.id == id);
    if (!m) return;
    m.iniciativa = parseInt(novaIni) || 0;
    try { await fetch(`/cronicas/${cronicaId}/monstros/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ iniciativa: m.iniciativa })}); } catch (err) {}
}

window.deletarMonstro = async function(id) {
    if (!await abrirModalConfirmacao("Remover permanentemente do combate?")) return;
    monstrosCache = monstrosCache.filter(m => m.id != id);
    if (turnoAtualIndex >= monstrosCache.length) turnoAtualIndex = 0;
    renderizarGridCombate();
    try { await fetch(`/cronicas/${cronicaId}/monstros/${id}`, { method: 'DELETE', credentials: 'include'}); } catch (err) {}
}

// ==========================================
// 3. ZOOM DE IMAGEM & UPLOADS
// ==========================================
let imgScale = 1; let panning = false; let pointX = 0, pointY = 0; let startX = 0, startY = 0;
const zoomContainer = document.getElementById('zoom-container');
const imgExpandida = document.getElementById('imagem-expandida-src');

function aplicarTransformacao() { imgExpandida.style.transform = `translate(${pointX}px, ${pointY}px) scale(${imgScale})`; }
window.abrirImagemExpandida = function(url) {
    imgExpandida.src = url; abrirModal('modal-imagem-expandida'); imgScale = 1; pointX = 0; pointY = 0; aplicarTransformacao();
}
window.fecharModalExpandida = function() { fecharModal('modal-imagem-expandida'); }

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('modal-imagem-expandida').classList.contains('show')) fecharModalExpandida(); });
document.getElementById('modal-imagem-expandida').addEventListener('mousedown', function(e) { if (e.target === this || e.target.id === 'zoom-container') fecharModalExpandida(); });

zoomContainer.onmousedown = function(e) { e.preventDefault(); startX = e.clientX - pointX; startY = e.clientY - pointY; panning = true; };
zoomContainer.onmouseup = function(e) { panning = false; };
zoomContainer.onmouseleave = function(e) { panning = false; };
zoomContainer.onmousemove = function(e) { if (!panning) return; pointX = e.clientX - startX; pointY = e.clientY - startY; aplicarTransformacao(); };
zoomContainer.onwheel = function(e) {
    e.preventDefault();
    const xs = (e.clientX - pointX) / imgScale, ys = (e.clientY - pointY) / imgScale;
    const delta = (e.wheelDelta ? e.wheelDelta : -e.deltaY);
    if (delta > 0) imgScale = Math.min(imgScale * 1.2, 5); else imgScale = Math.max(imgScale / 1.2, 0.5); 
    pointX = e.clientX - xs * imgScale; pointY = e.clientY - ys * imgScale;
    aplicarTransformacao();
};

const dropzone = document.getElementById('dropzone-monstro');
dropzone.addEventListener('click', () => dropzone.focus());
dropzone.addEventListener('paste', (e) => {
    e.preventDefault(); const itens = (e.clipboardData || window.clipboardData).items;
    for (const item of itens) { if (item.type.indexOf('image') === 0) { processarImagem(item.getAsFile()); break; } }
});

async function processarImagem(arquivo) {
    if (!arquivo || arquivo.type.indexOf('image') === -1) { mostrarToast('Imagem inválida.', 'erro'); return; }
    abrirModal('modal-novo-monstro');
    document.getElementById('preview-monstro').style.display = 'none'; document.getElementById('loading-upload').style.display = 'block';
    document.getElementById('btn-salvar-monstro').disabled = true; document.getElementById('preview-monstro').src = URL.createObjectURL(arquivo);

    const formData = new FormData(); formData.append('imagens', arquivo, `monstro_${Date.now()}.png`);
    try {
        const res = await fetch(`/midia/upload/cards`, { method: 'POST', credentials: 'include', body: formData });
        if (!res.ok) throw new Error();
        const dados = await res.json();
        document.getElementById('url-imagem-monstro').value = dados.urls ? dados.urls[0] : (dados.url || dados.caminho);
        document.getElementById('preview-monstro').style.display = 'block'; document.getElementById('loading-upload').style.display = 'none';
        document.getElementById('btn-salvar-monstro').disabled = false; document.getElementById('nome-monstro').focus();
    } catch (err) { fecharModal('modal-novo-monstro'); mostrarToast('Erro no upload.', 'erro'); }
}

// ==========================================
// 4. SAVES DO ESCUDO
// ==========================================
window.salvarEstadoCompleto = async function() {
    const nomeSave = document.getElementById('nome-save-escudo').value.trim();
    if (!nomeSave) { mostrarToast('Por favor, dê um nome a esta memória.', 'aviso'); return; }
    const payloadLayout = gridStackInstance.getGridItems().map(el => ({ id: el.getAttribute('gs-id'), x: el.gridstackNode.x, y: el.gridstackNode.y, w: el.gridstackNode.w, h: el.gridstackNode.h }));
    const resumoHtml = document.getElementById('editor-resumo') ? document.getElementById('editor-resumo').innerHTML : '';

    try {
        const res = await fetch(`/cronicas/${cronicaId}/escudo-saves`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ nome: nomeSave, layout: payloadLayout, resumo_html: resumoHtml, monstros: monstrosCache })
        });
        if (res.ok) {
            // Salvamento manual: também sincroniza a disposição-padrão (PUT /layout) de forma silenciosa.
            await window.persistirLayoutGrid(true);
            mostrarToast('Estado guardado!', 'sucesso'); fecharModal('modal-salvar-escudo'); document.getElementById('nome-save-escudo').value = '';
        }
        else { mostrarToast('Erro ao guardar estado.', 'erro'); }
    } catch (err) { console.error(err); }
}

window.aplicarSaveEscudo = async function(saveId) {
    try {
        const gridCombate = document.getElementById('grid-combate');
        if(gridCombate) gridCombate.innerHTML = '<div class="info-block-vazio"><span class="spinner"></span> Restaurando a Trama...</div>';
        
        const res = await fetch(`/cronicas/${cronicaId}/escudo-saves/${saveId}/restaurar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
        if (res.ok) {
            const payload = await res.json(); const dados = payload.dados || {};
            monstrosCache = dados.monstros || []; turnoAtualIndex = 0; renderizarGridCombate(); 
            
            // EXECUTA A RENOVAÇÃO DO LAYOUT SEGUINDO AS REGRAS DAS GAVETAS
            if (dados.layout) {
                window.atualizarDisposicaoModulos(dados.layout);
            }

            if (document.getElementById('editor-resumo')) document.getElementById('editor-resumo').innerHTML = dados.resumo_html || '';
            fecharModal('modal-carregar-escudo'); mostrarToast('Memória restaurada!', 'sucesso');
        } else { mostrarToast('Erro ao reconstruir memória.', 'erro'); carregarCardsCombate(); }
    } catch (err) { console.error(err); carregarCardsCombate(); }
}

window.abrirModalCarregarSaves = async function() {
    abrirModal('modal-carregar-escudo');
    const container = document.getElementById('lista-saves-escudo'); container.innerHTML = '<div class="info-block-vazio">Buscando memórias...</div>';
    try {
        const res = await fetch(`/cronicas/${cronicaId}/escudo-saves`, { credentials: 'include' });
        if (res.ok) {
            const saves = await res.json();
            if (saves.length === 0) { container.innerHTML = '<div class="info-block-vazio">Nenhuma memória guardada nesta Crônica.</div>'; return; }
            container.innerHTML = saves.map(save => `
                <div class="save-list-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s;">
                    <div style="flex: 1;" data-action="aplicar-save" data-id="${save.id}">
                        <strong style="color: var(--destaque); display: block;">${escapeHTML(save.nome)}</strong>
                        <small style="color: var(--texto-mutado);">${new Date(save.criado_em).toLocaleString('pt-BR')}</small>
                    </div>
                    <button class="btn btn-danger btn-sm" data-action="deletar-save" data-id="${save.id}"><i data-lucide="trash-2"></i> Apagar</button>
                </div>
            `).join('');
            lucide.createIcons();
        }
    } catch (err) { container.innerHTML = '<p style="color: var(--erro); text-align: center;">Erro ao contactar a Trama.</p>'; }
}

window.deletarSaveEscudo = async function(saveId) {
    if (!await abrirModalConfirmacao("Apagar permanentemente esta memória do Escudo?")) return;
    try { await fetch(`/cronicas/${cronicaId}/escudo-saves/${saveId}`, { method: 'DELETE', credentials: 'include' }); abrirModalCarregarSaves(); }
    catch (err) { mostrarToast('Erro ao apagar.', 'erro'); }
}

// ==========================================
// 5. GESTÃO DE GAVETAS & TELETRANSPORTE
// ==========================================
window.alternarGaveta = function(idGavetaAtiva) {
    const gavetaMestre = document.getElementById('gaveta-mestre');
    if (idGavetaAtiva === 'gaveta-mestre') { gavetaMestre.classList.toggle('aberto'); }
}

window.transportarParaGaveta = function(gsId) {
    const bloco = document.querySelector(`[gs-id="${gsId}"]`); if (!bloco) return;
    gridStackInstance.removeWidget(bloco, false);
    bloco.classList.remove('grid-stack-item', 'ui-draggable', 'ui-resizable');
    bloco.classList.add('bloco-arquivado'); bloco.removeAttribute('style');

    const btn = bloco.querySelector('.btn-transporte');
    if (btn) {
        btn.removeAttribute('onclick');
        btn.setAttribute('data-action', 'transportar-grid');
        btn.setAttribute('data-id', gsId);
        btn.innerHTML = '<i data-lucide="arrow-up-from-line"></i> Despertar';
        btn.className = 'btn btn-sm btn-success btn-transporte';
        btn.style.cssText = '';
    }
    document.getElementById('deposito-blocos').appendChild(bloco);
    lucide.createIcons();
}

window.transportarParaGrid = function(gsId) {
    const bloco = document.querySelector(`[gs-id="${gsId}"]`); if (!bloco) return;
    bloco.classList.remove('bloco-arquivado');

    const btn = bloco.querySelector('.btn-transporte');
    if (btn) {
        btn.removeAttribute('onclick');
        btn.setAttribute('data-action', 'transportar-gaveta');
        btn.setAttribute('data-id', gsId);
        btn.innerHTML = '<i data-lucide="arrow-down-to-line"></i> Guardar';
        btn.className = 'btn btn-ghost btn-sm btn-transporte';
        btn.style.cssText = 'margin-left: 10px;';
    }
    document.querySelector('.grid-stack').appendChild(bloco);
    gridStackInstance.makeWidget(bloco);

    // Dispara o carregamento lazy do bloco, se registrado
    if (registroDespertar[gsId]) registroDespertar[gsId]();
    lucide.createIcons();
}

// ==========================================
// 6. ENGENHARIA DE MUNDO COMPLETA
// Chamadas HTTP delegadas a MundoApi (public/js/api/mundoApi.js)
// ==========================================
let nodesMundoCache = [];
let nucleosEscudoCache = { entidade: [] };

async function carregarNucleosMundoEscudo() {
    try {
        nucleosEscudoCache.entidade = await MundoApi.getNucleos(cronicaId);
        const select = document.getElementById('filtro-nucleo-entidade-escudo');
        if (select) {
            select.innerHTML = '<option value="">Todos os núcleos</option><option value="__none__">Sem Núcleo</option>';
            nucleosEscudoCache.entidade.forEach(n => select.innerHTML += `<option value="${n.id}">${escapeHTML(n.nome)}</option>`);
        }
        const selectForja = document.getElementById('forja-nucleo-escudo');
        if (selectForja) {
            selectForja.innerHTML = '<option value="">Nenhum</option>';
            nucleosEscudoCache.entidade.forEach(n => selectForja.innerHTML += `<option value="${n.id}">${escapeHTML(n.nome)}</option>`);
        }
        lucide.createIcons();
    } catch (err) { console.error("Erro ao carregar núcleos", err); }
}

window.gerenciarNucleosEscudo = async function(tipo) {
    await carregarNucleosMundoEscudo();
    const div = document.getElementById('lista-nucleos-escudo');
    if (div) {
        div.innerHTML = nucleosEscudoCache.entidade.map(n => `
            <div class="nucleo-linha">
                <span class="nucleo-ident">
                    ${n.avatar_url ? `<img class="nucleo-brasao" src="${escapeHTML(n.avatar_url)}" alt="" draggable="false" onerror="this.remove()">` : ''}
                    <span id="nucleo-nome-${escapeHTML(String(n.id))}">${escapeHTML(n.nome)}</span>
                </span>
                <div class="card-topo-acoes">
                    <button class="btn btn-primary btn-sm" data-action="editar-nucleo" data-id="${n.id}" title="Renomear"><i data-lucide="pen-line"></i></button>
                    <button class="btn btn-danger btn-sm" data-action="excluir-nucleo" data-id="${n.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
        `).join('');
        lucide.createIcons();
    }
    abrirModal('modal-nucleos-escudo');
}

window.criarNucleoEscudo = async function() {
    const elNome = document.getElementById('novo-nucleo-nome-escudo'); const nome = elNome?.value.trim();
    if (!nome) { mostrarToast('Digite um nome para o núcleo.', 'aviso'); return; }
    try {
        await MundoApi.criarNucleo(cronicaId, nome);
        elNome.value = '';
        await gerenciarNucleosEscudo('entidade');
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

// edicaoInlineTexto vive agora em /js/mundo/edicaoInline.js (compartilhado com o
// controle_mundo; carregado antes deste script). Caminho B.

// Renomear núcleo inline (sobre o span #nucleo-nome-<id> na lista do modal). Supera o
// controle_mundo, que aqui ainda usa prompt — candidato a retroporte no Caminho B.
window.iniciarEdicaoNucleoEscudo = function(id) {
    edicaoInlineTexto(document.getElementById('nucleo-nome-' + id), {
        aoSalvar: async (novo, atual, alvo) => {
            alvo.textContent = novo; // optimistic
            const nuc = nucleosEscudoCache.entidade.find(n => String(n.id) === String(id));
            if (nuc) nuc.nome = novo;
            try {
                await MundoApi.editarNucleo(cronicaId, id, novo);
                await carregarNucleosMundoEscudo(); // atualiza o seletor de filtro/forja
                aplicarFiltrosMundoEscudo();        // re-renderiza os cards (nucleo_nome)
            } catch {
                alvo.textContent = atual;
                if (nuc) nuc.nome = atual;
                mostrarToast('Erro ao renomear núcleo. Revertido.', 'erro');
            }
        }
    });
}

window.excluirNucleoEscudo = async function(id) {
    if (!await abrirModalConfirmacao('Excluir este núcleo? Os vínculos serão removidos.')) return;
    try {
        await MundoApi.excluirNucleo(cronicaId, id);
        await gerenciarNucleosEscudo('entidade');
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

async function carregarMundoEscudo(nucleoFiltro = '', textoFiltro = '') {
    const div = document.getElementById('conteudo-mundo'); if (!div) return;
    try {
        nodesMundoCache = await MundoApi.getNodes(cronicaId, nucleoFiltro);
        let dados = nodesMundoCache;
        if (textoFiltro) dados = dados.filter(n => n.nome.toLowerCase().includes(textoFiltro));
        renderizarGridMundoEscudo(dados);
    } catch (err) { console.error(err); }
}

window.aplicarFiltrosMundoEscudo = function() {
    const textoFiltro = document.getElementById('busca-mundo-escudo')?.value.trim().toLowerCase();
    const nucleoId = document.getElementById('filtro-nucleo-entidade-escudo')?.value;
    carregarMundoEscudo(nucleoId, textoFiltro);
}

// iconeEntidade/humanizarMarco vivem agora em /js/mundo/mundoUtils.js (compartilhado com o
// controle_mundo; carregado antes deste script). Caminho B — fim da duplicação.

// Um item de Marco: check (toggle) + nome humanizado + renomear/apagar revelados no hover (R7.2).
// Ações via data-action (dispatcher delegado único do escudo). Os ícones <i> preservam os
// data-* após lucide.createIcons(), então a delegação continua funcionando sobre o <svg>.
function marcoEscudoItemHTML(nodeId, f) {
    const id = escapeHTML(String(nodeId));
    const k = escapeHTML(f.key);
    return `
        <div class="marco-item" data-flag-key="${k}">
            <input type="checkbox" class="marco-item__check" ${f.value ? 'checked' : ''} data-action="toggle-flag" data-id="${id}" data-extra="${k}">
            <span class="marco-item__nome">${escapeHTML(humanizarMarco(f.key))}</span>
            <i data-lucide="pen-line" class="btn-edit-marco" title="Renomear marco" data-action="editar-flag" data-id="${id}" data-extra="${k}"></i>
            <i data-lucide="x" class="btn-del-marco" title="Apagar marco" data-action="deletar-flag" data-id="${id}" data-extra="${k}"></i>
        </div>`;
}

// Card de entidade da Grelha (escudo) — paridade visual com cardMundoHTML do controle_mundo:
// 100% classes de global_ui.css (.world-card*/.marco-item), avatar (F2), zero estilo/cor inline.
// Ações secundárias via data-action, reveladas no hover do card (Regra 7.2).
function cardMundoEscudoHTML(node) {
    const id = escapeHTML(String(node.id));
    const marcos = (node.flags || []).filter(f => f.key).map(f => marcoEscudoItemHTML(node.id, f)).join('');
    return `
        <div class="card world-card" data-node-id="${id}">
            <div class="world-card__head">
                ${cardIdentHTML(node)}
                <div class="world-card__acoes">
                    <button class="btn btn-secondary btn-sm" data-action="editar-entidade" data-id="${id}" title="Renomear"><i data-lucide="pen-line"></i></button>
                    <button class="btn btn-secondary btn-sm" data-action="mover-entidade" data-id="${id}" title="Mudar núcleo"><i data-lucide="map-pin"></i></button>
                    <button class="btn btn-danger btn-sm" data-action="deletar-entidade" data-id="${id}" data-extra="${escapeHTML(node.nome)}" title="Deletar"><i data-lucide="trash-2"></i></button>
                </div>
            </div>

            <div class="world-card__marcos-label">Marcos</div>
            <div class="world-card__marcos">
                ${marcos}
                <input type="text" class="input-inline-marco" maxlength="60" placeholder="+ Novo Marco (Enter)" data-action="novo-marco" data-id="${id}">
            </div>

            ${cardRodapeNucleoHTML(node)}
        </div>`;
}

function renderizarGridMundoEscudo(lista) {
    const div = document.getElementById('conteudo-mundo');
    if (!div) return;
    if (lista.length === 0) { div.innerHTML = '<div class="info-block-vazio">Nenhuma entidade encontrada.</div>'; return; }
    div.innerHTML = lista.map(cardMundoEscudoHTML).join('');
    lucide.createIcons();
}

window.salvarForjaEscudo = async function() {
    const nome = document.getElementById('forja-nome-escudo')?.value.trim();
    const tipo = document.getElementById('forja-tipo-escudo')?.value;
    const nucleoId = document.getElementById('forja-nucleo-escudo')?.value;
    if (!nome) { mostrarToast('Digite um nome.', 'aviso'); return; }
    try {
        await MundoApi.criarNode(cronicaId, nome, tipo, nucleoId);
        fecharModal('modal-forja-escudo');
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro ao forjar entidade.', 'erro'); }
}

// Renomear entidade inline (sobre o .world-card__nome do card). Espelha iniciarEdicaoNome
// do controle_mundo.
window.iniciarEdicaoNomeEscudo = function(nodeId) {
    edicaoInlineTexto(document.getElementById('node-nome-' + nodeId), {
        aoSalvar: async (novo, atual, alvo) => {
            alvo.textContent = novo; // optimistic
            const node = nodesMundoCache.find(n => String(n.id) === String(nodeId));
            if (node) node.nome = novo;
            try {
                await MundoApi.editarNode(cronicaId, nodeId, novo);
            } catch {
                alvo.textContent = atual;
                if (node) node.nome = atual;
                mostrarToast('Erro ao renomear. Revertido.', 'erro');
            }
        }
    });
}

window.deletarEntidadeEscudo = async function(nodeId, nome) {
    if (!await abrirModalConfirmacao(`Deletar a entidade "${nome}" permanentemente?`)) return;
    try {
        await MundoApi.deletarNode(cronicaId, nodeId);
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

// Criar marco inline (Enter) — Optimistic UI. Espelha adicionarMarcoInline do controle_mundo
// e a normalização do backend (lowercase + espaço→underscore) p/ a chave otimista bater
// com a persistida. Disparado pelo keydown delegado (data-action="novo-marco").
window.adicionarMarcoInlineEscudo = async function(input, nodeId) {
    const nome = input.value.trim();
    if (!nome) return;
    const chave = nome.toLowerCase().replace(/\s+/g, '_');
    const node = nodesMundoCache.find(n => String(n.id) === String(nodeId));
    if (node?.flags?.some(f => f.key === chave)) return mostrarToast('Esse marco já existe.', 'aviso');
    input.value = '';
    try {
        await MundoApi.adicionarFlag(cronicaId, nodeId, nome);
        if (node) { node.flags = node.flags || []; node.flags.push({ key: chave, value: false }); }
        input.insertAdjacentHTML('beforebegin', marcoEscudoItemHTML(nodeId, { key: chave, value: false }));
        lucide.createIcons();
        input.focus(); // permite encadear vários marcos
    } catch (err) {
        input.value = nome; // devolve o texto p/ tentar de novo
        mostrarToast('Erro ao criar marco.', 'erro');
    }
}

// Renomear marco inline — espelha iniciarEdicaoMarco do controle_mundo. Em sucesso
// re-renderiza só o item com a nova chave (handlers/chaves coerentes).
window.iniciarEdicaoMarcoEscudo = function(nodeId, flagKey) {
    const item = document.querySelector(`.world-card[data-node-id="${nodeId}"] .marco-item[data-flag-key="${flagKey}"]`);
    edicaoInlineTexto(item?.querySelector('.marco-item__nome'), {
        classe: 'input-inline-marco input-inline-marco--edit',
        maxLength: 60,
        aoSalvar: async (novo, atual, alvo) => {
            try {
                await MundoApi.editarFlag(cronicaId, nodeId, flagKey, novo);
                const novaKey = novo.toLowerCase().replace(/\s+/g, '_');
                const node = nodesMundoCache.find(n => String(n.id) === String(nodeId));
                const fl = node?.flags?.find(f => f.key === flagKey); if (fl) fl.key = novaKey;
                const checked = item.querySelector('.marco-item__check')?.checked;
                item.outerHTML = marcoEscudoItemHTML(nodeId, { key: novaKey, value: checked });
                lucide.createIcons();
            } catch { alvo.textContent = atual; mostrarToast('Erro ao renomear marco.', 'erro'); }
        }
    });
}

window.deletarFlagEscudo = async function(nodeId, flagKey) {
    if (!await abrirModalConfirmacao(`Deletar a flag "${flagKey}"?`)) return;
    try {
        await MundoApi.deletarFlag(cronicaId, nodeId, flagKey);
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.toggleFlagEscudo = async function(nodeId, flagKey, value) {
    try {
        const node = nodesMundoCache.find(n => n.id === nodeId);
        if (node) { const flag = node.flags.find(f => f.key === flagKey); if (flag) flag.value = value; }
        const textoFiltro = document.getElementById('busca-mundo-escudo')?.value.trim().toLowerCase();
        let dados = nodesMundoCache; if (textoFiltro) dados = dados.filter(n => n.nome.toLowerCase().includes(textoFiltro));
        renderizarGridMundoEscudo(dados);
        await MundoApi.toggleFlag(cronicaId, nodeId, flagKey, value);
    } catch (err) { console.error("Erro", err); }
}

window.moverNodeNucleoEscudo = async function(nodeId) {
    await carregarNucleosMundoEscudo();
    const node = nodesMundoCache.find(n => n.id === nodeId);
    const nucleoAtualId = node ? node.nucleo_id : null;
    const div = document.getElementById('lista-nucleos-mover-escudo');
    if (div) {
        let html = `<label class="radio-label"><input type="radio" name="mover-nucleo-escudo" value="" ${!nucleoAtualId ? 'checked' : ''}> Nenhum</label>`;
        nucleosEscudoCache.entidade.forEach(n => { html += `<label class="radio-label"><input type="radio" name="mover-nucleo-escudo" value="${n.id}" ${nucleoAtualId === n.id ? 'checked' : ''}> ${escapeHTML(n.nome)}</label>`; });
        div.innerHTML = html;
    }
    document.getElementById('mover-node-id-escudo').value = nodeId;
    lucide.createIcons();
    abrirModal('modal-mover-nucleo-escudo');
}

window.salvarMoverNucleoEscudo = async function() {
    const nodeId = document.getElementById('mover-node-id-escudo')?.value;
    const selecionado = document.querySelector('input[name="mover-nucleo-escudo"]:checked'); if (!selecionado) return;
    const nucleoId = selecionado.value || null;
    try {
        await MundoApi.moverNode(cronicaId, nodeId, nucleoId);
        fecharModal('modal-mover-nucleo-escudo');
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro ao mover entidade.', 'erro'); }
}

// ==========================================
// 7. EVENTOS DO MUNDO
// Chamadas HTTP delegadas a EventosApi (public/js/api/eventosApi.js)
// ==========================================
let eventosCache = [];

async function carregarEventosEscudo() {
    const div = document.getElementById('conteudo-eventos'); if (!div) return;
    try {
        const dadosBrutos = await EventosApi.getEventos(cronicaId);
        eventosCache = dadosBrutos.map(ev => {
            if (typeof ev.nucleos === 'string') { try { ev.nucleos = JSON.parse(ev.nucleos); } catch(e) { ev.nucleos = []; } }
            if (!Array.isArray(ev.nucleos)) ev.nucleos = [];
            if (typeof ev.gatilhos === 'string') { try { ev.gatilhos = JSON.parse(ev.gatilhos); } catch(e) { ev.gatilhos = []; } }
            if (!Array.isArray(ev.gatilhos)) ev.gatilhos = [];
            return ev;
        });
        renderizarEventosEscudo(eventosCache);
    } catch (err) { console.error(err); }
}

window.filtrarEventosEscudo = function() {
    const texto = document.getElementById('busca-eventos-escudo')?.value.trim().toLowerCase();
    const lista = texto ? eventosCache.filter(e => e.nome.toLowerCase().includes(texto)) : eventosCache;
    renderizarEventosEscudo(lista);
}

function renderizarEventosEscudo(lista) {
    const div = document.getElementById('conteudo-eventos');
    if (lista.length === 0) { div.innerHTML = '<div class="info-block-vazio">Nenhum evento encontrado.</div>'; return; }

    div.innerHTML = lista.map(ev => {
        const pct = Math.min((ev.pool_atual / ev.pool_maxima) * 100, 100);
        const alerta = pct >= 100;
        const nivel = pct < 50 ? '' : (pct < 75 ? 'barra-fill--aviso' : 'barra-alerta');

        const causas = (ev.gatilhos || []).filter(g => g && g.node_nome).map(g =>
            `<div class="evento-gatilho"><i data-lucide="zap"></i> <strong>${escapeHTML(g.node_nome)}</strong> → ${escapeHTML(humanizarMarco(g.flag_key))} (+${escapeHTML(String(g.peso))})</div>`
        ).join('');

        const nucleosArray = (ev.nucleos || []).filter(n => n && n.nome);
        const nucleosBadges = nucleosArray.length
            ? nucleosArray.map(n => `<span class="badge">${escapeHTML(n.nome)}</span>`).join(' ')
            : 'Nenhum';

        // Estado de repouso = linha enxuta; detalhes (causas/núcleos/ações) só no accordion (R7.2).
        return `
        <div class="evento-linha" data-evento-id="${escapeHTML(String(ev.id))}">
            <div class="evento-linha__topo" data-action="toggle-evento" data-id="${ev.id}">
                <i data-lucide="${alerta ? 'alert-triangle' : 'eye'}" class="evento-linha__icone ${alerta ? 'evento-linha__icone--pronto' : ''}"></i>
                <span class="evento-linha__nome" title="${escapeHTML(ev.nome)}">${escapeHTML(ev.nome)}</span>
                <span class="evento-linha__barra barra-bg"><span class="barra-fill ${nivel}" style="width: ${pct}%"></span></span>
                <span class="evento-linha__num">${ev.pool_atual}/${ev.pool_maxima}</span>
                <i data-lucide="chevron-down" class="evento-linha__chevron"></i>
            </div>
            <div class="evento-detalhe">
                <div class="evento-detalhe__causas">
                    ${causas || '<p class="evento-detalhe__vazio">Nenhuma causa vinculada.</p>'}
                </div>
                <div class="evento-detalhe__rodape">
                    <span>Núcleos: ${nucleosBadges}</span>
                    ${ev.ultima_excedida_em ? `<span class="evento-ativado"><i data-lucide="clock"></i> ${escapeHTML(new Date(ev.ultima_excedida_em).toLocaleString())}</span>` : ''}
                </div>
                <div class="evento-detalhe__acoes">
                    <button class="btn btn-secondary btn-sm" data-action="abrir-vinculo" data-id="${ev.id}"><i data-lucide="link"></i> Vincular causa</button>
                    <button class="btn btn-danger btn-sm" data-action="deletar-evento" data-id="${ev.id}" data-extra="${escapeHTML(ev.nome)}"><i data-lucide="trash-2"></i> Excluir</button>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
    ajustarAlturaBoxEventos(); // re-render começa recolhido → volta à altura base
}

// Caixa ELÁSTICA: cresce o widget GridStack p/ caber o detalhe aberto e encolhe ao fechar.
// Sem persistência (Regra 2.7 — resize só visual; o Salvar continua sendo explícito).
const BOX_EVENTOS_H_BASE = 4, BOX_EVENTOS_H_MAX = 12;
function ajustarAlturaBoxEventos() {
    const bloco = document.querySelector('[gs-id="bloco-eventos"]');
    if (!bloco || !gridStackInstance || bloco.classList.contains('bloco-arquivado')) return;
    const hAtual = bloco.gridstackNode?.h || BOX_EVENTOS_H_BASE;

    // Nada aberto → volta à altura base (lista recolhida pode rolar normalmente).
    if (!bloco.querySelector('.evento-linha--aberto')) {
        if (hAtual !== BOX_EVENTOS_H_BASE) gridStackInstance.update(bloco, { h: BOX_EVENTOS_H_BASE });
        return;
    }

    // Sinal direto e confiável: quanto a lista ESCONDE hoje (scrollHeight − clientHeight).
    // Cresce exatamente o necessário p/ absorver esse overflow, usando px-por-linha REAL
    // (medido do widget em repouso — sem depender de cellHeight/margin teóricos).
    const lista = document.getElementById('conteudo-eventos');
    if (!lista) return;
    const overflow = lista.scrollHeight - lista.clientHeight;
    if (overflow <= 2) return; // já cabe; nada a crescer
    const rect = bloco.getBoundingClientRect();
    const pxPorLinha = (rect.height > 0 && hAtual > 0) ? rect.height / hAtual : 90;
    const novo = Math.min(hAtual + Math.ceil(overflow / pxPorLinha), BOX_EVENTOS_H_MAX);
    if (novo !== hAtual) gridStackInstance.update(bloco, { h: novo });
}

// Accordion EXCLUSIVO (um aberto por vez) + caixa elástica. Classe → CSS, sem estilo inline.
window.toggleEventoEscudo = function(eventoId) {
    const linha = document.querySelector(`.evento-linha[data-evento-id="${eventoId}"]`);
    if (!linha) return;
    const abrindo = !linha.classList.contains('evento-linha--aberto');
    document.querySelectorAll('.evento-linha--aberto').forEach(l => l.classList.remove('evento-linha--aberto'));
    if (abrindo) linha.classList.add('evento-linha--aberto');
    ajustarAlturaBoxEventos();
    if (abrindo) requestAnimationFrame(() => linha.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

window.salvarNovoEvento = async function() {
    const nome = document.getElementById('evento-nome')?.value.trim();
    const descricao = document.getElementById('evento-descricao')?.value.trim();
    const poolMaxima = parseInt(document.getElementById('evento-pool')?.value) || 10;
    if (!nome) { mostrarToast('Digite o nome do evento.', 'aviso'); return; }
    try {
        await EventosApi.criarEvento(cronicaId, nome, descricao, poolMaxima);
        fecharModal('modal-novo-evento');
        document.getElementById('evento-nome').value = '';
        document.getElementById('evento-descricao').value = '';
        document.getElementById('evento-pool').value = '10';
        carregarEventosEscudo();
    } catch (err) { mostrarToast('Erro ao criar evento.', 'erro'); }
}

window.deletarEventoEscudo = async function(eventoId, nome) {
    if (!await abrirModalConfirmacao(`Deletar o evento "${nome}" permanentemente?`)) return;
    try {
        await EventosApi.deletarEvento(cronicaId, eventoId);
        carregarEventosEscudo();
    } catch (err) { mostrarToast('Erro ao deletar evento.', 'erro'); }
}

// ==========================================
// 8. AUTOMAÇÕES
// Chamadas HTTP delegadas a AutomacoesApi (public/js/api/automacoesApi.js)
// ==========================================
let automacoesCache = [];

async function carregarAutomacoesEscudo() {
    const div = document.getElementById('conteudo-automacoes'); if (!div) return;
    try {
        automacoesCache = await AutomacoesApi.getAutomacoes(cronicaId);
        renderizarAutomacoesEscudo();
    } catch (err) { console.error(err); }
}

function renderizarAutomacoesEscudo() {
    const div = document.getElementById('conteudo-automacoes');
    if (automacoesCache.length === 0) { div.innerHTML = '<div class="info-block-vazio">Nenhuma automação configurada.</div>'; return; }

    const tipoLabels = {
        criar_flag: 'Criar Flag', alterar_flag: 'Alterar Flag',
        postar_em_aba: 'Postar em Aba', criar_evento: 'Criar Evento', criar_entidade: 'Criar Entidade'
    };

    div.innerHTML = automacoesCache.map(a => `
        <div class="item-interativo">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 12px; color: var(--texto-mutado);">Gatilho: <strong style="color: var(--destaque);">${escapeHTML(a.evento_nome || '—')}</strong></span>
                <button class="btn btn-danger btn-sm" style="padding: 2px 6px;" data-action="deletar-automacao" data-id="${a.id}"><i data-lucide="x"></i></button>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; background: rgba(16,185,129,0.15); color: var(--destaque); padding: 2px 6px; border-radius: 4px;">${escapeHTML(tipoLabels[a.tipo_nome] || a.tipo_nome)}</span>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; color: var(--texto-mutado); margin: 0;">
                    <input type="checkbox" ${a.ativo ? 'checked' : ''} data-action="toggle-automacao" data-id="${a.id}" style="width: 14px; height: 14px;">
                    Armada
                </label>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

window.abrirModalNovaAutomacao = async function() {
    abrirModal('modal-nova-automacao');
    const select = document.getElementById('automacao-evento-id');
    select.innerHTML = '<option value="">Carregando...</option>';
    try {
        const eventos = await EventosApi.getEventos(cronicaId);
        if (eventos.length === 0) {
            select.innerHTML = '<option value="">Nenhum evento disponível</option>';
        } else {
            select.innerHTML = eventos.map(e => `<option value="${e.id}">${escapeHTML(e.nome)}</option>`).join('');
        }
    } catch (err) { select.innerHTML = '<option value="">Erro ao carregar eventos</option>'; }
}

window.salvarNovaAutomacao = async function() {
    const eventoId = document.getElementById('automacao-evento-id')?.value;
    const tipoNome = document.getElementById('automacao-tipo')?.value;
    if (!eventoId) { mostrarToast('Selecione um evento gatilho.', 'aviso'); return; }
    try {
        await AutomacoesApi.criarAutomacao(cronicaId, eventoId, tipoNome);
        fecharModal('modal-nova-automacao');
        carregarAutomacoesEscudo();
    } catch (err) { mostrarToast('Erro ao criar automação.', 'erro'); }
}

window.deletarAutomacaoEscudo = async function(id) {
    if (!await abrirModalConfirmacao('Remover esta automação permanentemente?')) return;
    try {
        await AutomacoesApi.deletarAutomacao(cronicaId, id);
        carregarAutomacoesEscudo();
    } catch (err) { mostrarToast('Erro ao deletar automação.', 'erro'); }
}

window.toggleAutomacaoEscudo = async function(id, ativo) {
    const a = automacoesCache.find(x => x.id == id);
    if (a) a.ativo = ativo;
    try {
        await AutomacoesApi.toggleStatus(cronicaId, id, ativo);
    } catch (err) {
        if (a) a.ativo = !ativo;
        renderizarAutomacoesEscudo();
        mostrarToast('Erro ao alterar status da automação.', 'erro');
    }
}


// ==========================================
// MÓDULO COMPLEMENTAR: UPLOAD E VÍNCULOS
// ==========================================

// NOTA DE ARQUITETURA (Responsabilidade Única): NÃO existe listener global
// `document.addEventListener('paste', ...)` aqui. O ÚNICO ponto de entrada do
// evento 'paste' para upload de monstro é o `dropzone.addEventListener('paste', ...)`
// (a meio do ficheiro), que delega para `processarImagem(arquivo)`. Um segundo
// listener no `document` causaria event bubbling e upload duplo.

//Função de Salvar o Card

window.salvarNovoMonstro = async function() {
    const nome = document.getElementById('nome-monstro').value.trim();
    const hp_max = parseInt(document.getElementById('hp-monstro').value) || 10;
    const imagem_url = document.getElementById('url-imagem-monstro').value;

    if (!nome) return mostrarToast('A ameaça precisa de um nome.', 'aviso');
    if (!imagem_url) return mostrarToast('A imagem ainda não terminou de carregar.', 'aviso');

    setLoading('btn-salvar-monstro', true, 'Forjando');

    try {
        // Envia para o endpoint que criámos no Passo 2
        const res = await API.fetch(`/cronicas/${cronicaId}/monstros`, {
            method: 'POST',
            body: JSON.stringify({ nome, hp_max, imagem_url })
        });

        if (res.ok) {
            fecharModal('modal-novo-monstro');
            // Limpa os campos
            document.getElementById('nome-monstro').value = '';
            document.getElementById('hp-monstro').value = '10';
            
            mostrarToast('Card forjado com sucesso!', 'sucesso');
            
            // Chama a função que vai redesenhar os cards no ecrã (Faremos no Passo 4)
            if (typeof carregarCardsCombate === 'function') {
                carregarCardsCombate(); 
            }
        } else {
            const erroDoServidor = await res.json();
            mostrarToast(erroDoServidor.erro || 'Falha ao forjar card.', 'erro');
        }
    } catch (err) {
        // O seu api.js já lida com o toast de erro genérico
        console.error(err);
    } finally {
        setLoading('btn-salvar-monstro', false, 'Forjar Card');
    }
}

// ==========================================
// VÍNCULOS DE EVENTOS (TRANSPLANTADO DE controle_mundo.js)
// ==========================================
window.abrirModalVinculo = async function(eventId) {
    const elEventId = document.getElementById('vinculo-event-id');
    if (elEventId) elEventId.value = eventId;

    const select = document.getElementById('vinculo-node-id');
    if (select) {
        select.innerHTML = '<option value="">Selecione um nó...</option>';
        nodesMundoCache.forEach(n => select.innerHTML += `<option value="${n.id}">${escapeHTML(n.nome)} (${escapeHTML(n.tipo)})</option>`);
    }
    const selectFlag = document.getElementById('vinculo-flag-key');
    if (selectFlag) selectFlag.innerHTML = '<option value="">Selecione um nó primeiro...</option>';

    abrirModal('modal-vinculo');
}

window.atualizarFlagsVinculo = function() {
    const nodeId = document.getElementById('vinculo-node-id')?.value;
    const selectFlags = document.getElementById('vinculo-flag-key');
    if (!selectFlags) return;

    selectFlags.innerHTML = '<option value="">Selecione uma flag...</option>';
    const node = nodesMundoCache.find(n => n.id === nodeId);
    if (node?.flags) node.flags.filter(f => f.key).forEach(f => selectFlags.innerHTML += `<option value="${escapeHTML(f.key)}">${escapeHTML(f.key)}</option>`);
}

window.salvarVinculo = async function() {
    const eventId = document.getElementById('vinculo-event-id')?.value;
    const nodeId = document.getElementById('vinculo-node-id')?.value;
    const flagKey = document.getElementById('vinculo-flag-key')?.value;
    const peso = parseInt(document.getElementById('vinculo-peso')?.value) || 1;
    if (!nodeId || !flagKey) return mostrarToast('Selecione nó e flag.', 'aviso');

    try {
        await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}/pesos`, {
            method: 'POST', body: JSON.stringify({ node_id: nodeId, flag_key: flagKey, peso })
        });
        fecharModal('modal-vinculo');
        carregarEventosEscudo();
    } catch (err) { mostrarToast('Erro ao criar vínculo.', 'erro'); }
}

window.deletarCausaEvento = async function(eventId, nodeId, flagKey) {
    if (!await abrirModalConfirmacao(`Remover o vínculo "${flagKey}" deste evento?`)) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}/pesos`, {
            method: 'DELETE',
            body: JSON.stringify({ node_id: nodeId, flag_key: flagKey })
        });
        if (res.ok) {
            carregarEventosEscudo();
        } else {
            mostrarToast('Erro ao remover vínculo.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

// ==========================================
// EVENT DELEGATION — Fases 2 e 3
// Centraliza todos os handlers dinâmicos de click, change e input num dispatcher único:
// evita re-anexar listeners a cada render e mantém os inline handlers fora do markup.
// ==========================================
document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const extra = btn.dataset.extra;
    switch (action) {
        case 'deletar-monstro':    deletarMonstro(id); break;
        case 'ver-imagem':         abrirImagemExpandida(extra); break;
        case 'alterar-hp':         alterarHP(id, parseInt(extra)); break;
        case 'editar-nucleo':      iniciarEdicaoNucleoEscudo(id); break;
        case 'excluir-nucleo':     excluirNucleoEscudo(id); break;
        case 'editar-entidade':    iniciarEdicaoNomeEscudo(id); break;
        case 'deletar-entidade':   deletarEntidadeEscudo(id, extra); break;
        case 'editar-flag':        iniciarEdicaoMarcoEscudo(id, extra); break;
        case 'deletar-flag':       deletarFlagEscudo(id, extra); break;
        case 'mover-entidade':     moverNodeNucleoEscudo(id); break;
        case 'abrir-vinculo':      abrirModalVinculo(id); break;
        case 'toggle-evento':      toggleEventoEscudo(id); break;
        case 'deletar-evento':     deletarEventoEscudo(id, extra); break;
        case 'deletar-automacao':  deletarAutomacaoEscudo(id); break;
        case 'aplicar-save':       aplicarSaveEscudo(id); break;
        case 'deletar-save':       deletarSaveEscudo(id); break;
        case 'transportar-grid':   transportarParaGrid(id); break;
        case 'transportar-gaveta': transportarParaGaveta(id); break;
    }
});

document.body.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;
    const extra = el.dataset.extra;
    switch (action) {
        case 'alterar-iniciativa': alterarIniciativa(id, e.target.value); break;
        case 'hp-slider':          salvarHpSlider(id, e.target.value); break;
        case 'toggle-flag':        toggleFlagEscudo(id, extra, e.target.checked); break;
        case 'toggle-automacao':   toggleAutomacaoEscudo(id, e.target.checked); break;
    }
});

document.body.addEventListener('input', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'hp-slider') {
        atualizarHpVisual(e.target, el.dataset.id, parseInt(el.dataset.extra));
    }
});

document.body.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('hp-slider')) {
        e.stopPropagation();
    }
});

// Criar marco inline: Enter no input permanente "+ Novo Marco". Tratado pelo dispatcher
// delegado único do escudo (data-action) — coerente com o resto da página e sem re-anexar
// listeners a cada render. Os inputs de edição inline (nome/marco/núcleo) tratam o próprio
// keydown via addEventListener e não têm data-action="novo-marco", então não colidem aqui.
document.body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target.closest('[data-action="novo-marco"]');
    if (!el) return;
    e.preventDefault();
    adicionarMarcoInlineEscudo(el, el.dataset.id);
});

