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
    await inicializarMotorDeRegras('mago_m20');
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
    document.getElementById('btn-guardar-combate')?.addEventListener('click', () => transportarParaGaveta('bloco-combate'));

    // Blocos — transporte para gaveta
    document.getElementById('btn-guardar-regras')?.addEventListener('click', () => transportarParaGaveta('bloco-regras'));
    document.getElementById('btn-guardar-resumo')?.addEventListener('click', () => transportarParaGaveta('bloco-resumo'));
    document.getElementById('btn-guardar-mundo')?.addEventListener('click', () => transportarParaGaveta('bloco-mundo'));
    document.getElementById('btn-guardar-eventos')?.addEventListener('click', () => transportarParaGaveta('bloco-eventos'));
    document.getElementById('btn-guardar-automacoes')?.addEventListener('click', () => transportarParaGaveta('bloco-automacoes'));

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
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: white;">
                <span style="font-size: 13px;">${escapeHTML(n.nome)}</span>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-primary btn-sm" data-action="editar-nucleo" data-id="${n.id}"><i data-lucide="pen-line"></i></button>
                    <button class="btn btn-danger btn-sm" data-action="excluir-nucleo" data-id="${n.id}"><i data-lucide="trash-2"></i></button>
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

window.editarNucleoEscudo = async function(id) {
    const novoNome = prompt('Novo nome:'); if (!novoNome || novoNome.trim() === '') return;
    try {
        await MundoApi.editarNucleo(cronicaId, id, novoNome.trim());
        await gerenciarNucleosEscudo('entidade');
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
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

function renderizarGridMundoEscudo(lista) {
    const div = document.getElementById('conteudo-mundo');
    if (lista.length === 0) { div.innerHTML = '<div class="info-block-vazio">Nenhuma entidade encontrada.</div>'; return; }

    div.innerHTML = lista.map(node => `
        <div class="item-interativo" style="display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;">
                    <strong style="font-size: 14px; color: var(--destaque);">${escapeHTML(node.nome)}</strong>
                    <span style="font-size: 10px; background: rgba(152,113,245,0.2); color: var(--roxo-mago); padding: 2px 6px; border-radius: 4px; width: fit-content;">${escapeHTML(node.tipo.toUpperCase())}</span>
                </div>
                <div style="display: flex; gap: 4px;">
                    <button class="btn btn-primary btn-sm" data-action="editar-entidade" data-id="${node.id}" data-extra="${escapeHTML(node.nome)}" title="Editar nome"><i data-lucide="pen-line"></i></button>
                    <button class="btn btn-danger btn-sm" data-action="deletar-entidade" data-id="${node.id}" data-extra="${escapeHTML(node.nome)}" title="Deletar"><i data-lucide="trash-2"></i></button>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;">
                ${(node.flags || []).filter(f => f.key).map(f => `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 4px; border-radius: 4px;">
                        <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--texto-claro); flex: 1; margin: 0;">
                            <input type="checkbox" ${f.value ? 'checked' : ''} data-action="toggle-flag" data-id="${node.id}" data-extra="${escapeHTML(f.key)}" style="margin: 0; width: 14px; height: 14px;">
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(f.key)}</span>
                        </label>
                        <div style="display: flex; gap: 4px;">
                            <button class="btn btn-primary btn-sm" style="padding: 2px 5px;" data-action="editar-flag" data-id="${node.id}" data-extra="${escapeHTML(f.key)}"><i data-lucide="pen-line"></i></button>
                            <button class="btn btn-danger btn-sm" style="padding: 2px 5px;" data-action="deletar-flag" data-id="${node.id}" data-extra="${escapeHTML(f.key)}"><i data-lucide="x"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                <span style="color: var(--texto-mutado); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">Núcleo: <span style="color: var(--texto-claro);">${escapeHTML(node.nucleo_nome || 'Nenhum')}</span></span>
                <button class="btn btn-primary btn-sm" data-action="mover-entidade" data-id="${node.id}">Mover</button>
            </div>
            <button class="btn btn-primary btn-sm" style="width: 100%; margin-top: 8px;" data-action="adicionar-flag" data-id="${node.id}">+ Nova Flag</button>
        </div>
    `).join('');
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

window.editarEntidadeEscudo = async function(nodeId, nomeAtual) {
    const novoNome = prompt('Novo nome da entidade:', nomeAtual); if (!novoNome || novoNome.trim() === '' || novoNome === nomeAtual) return;
    try {
        await MundoApi.editarNode(cronicaId, nodeId, novoNome.trim());
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.deletarEntidadeEscudo = async function(nodeId, nome) {
    if (!await abrirModalConfirmacao(`Deletar a entidade "${nome}" permanentemente?`)) return;
    try {
        await MundoApi.deletarNode(cronicaId, nodeId);
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.adicionarFlagEscudo = async function(nodeId) {
    const nome = prompt('Nome da nova Flag:'); if (!nome) return;
    try {
        await MundoApi.adicionarFlag(cronicaId, nodeId, nome);
        aplicarFiltrosMundoEscudo();
    } catch (err) { console.error(err); }
}

window.editarFlagEscudo = async function(nodeId, flagKey) {
    const novoNome = prompt('Novo nome da flag:', flagKey); if (!novoNome || novoNome.trim() === '' || novoNome === flagKey) return;
    try {
        await MundoApi.editarFlag(cronicaId, nodeId, flagKey, novoNome);
        aplicarFiltrosMundoEscudo();
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
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
        let html = `<label style="display:block; margin-bottom: 5px;"><input type="radio" name="mover-nucleo-escudo" value="" ${!nucleoAtualId ? 'checked' : ''}> Nenhum</label>`;
        nucleosEscudoCache.entidade.forEach(n => { html += `<label style="display:block; margin-bottom: 5px;"><input type="radio" name="mover-nucleo-escudo" value="${n.id}" ${nucleoAtualId === n.id ? 'checked' : ''}> ${escapeHTML(n.nome)}</label>`; });
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
        const corBarra = pct < 50 ? '#2ecc71' : (pct < 75 ? '#f1c40f' : '#e74c3c');

        let gatilhosHtml = '';
        if (ev.gatilhos && ev.gatilhos.length > 0) {
            gatilhosHtml = ev.gatilhos.filter(g => g && g.node_nome).map(g => `
                <div style="font-size: 11px; background: rgba(255,255,255,0.03); padding: 4px 8px; border-radius: 4px; margin-bottom: 3px;">
                    <i data-lucide="settings"></i> <strong>${g.node_nome}</strong> → ${g.flag_key} (+${g.peso})
                </div>
            `).join('');
        }

        const nucleosArray = ev.nucleos.filter(n => n && n.nome);
        const nucleosBadges = (nucleosArray.length > 0)
            ? nucleosArray.map(n => `<span class="badge">${n.nome}</span>`).join(' ')
            : 'Nenhum';

        return `
        <div class="card" style="display: flex; flex-direction: column; height: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px;">
                <div style="flex: 1; min-width: 0;">
                    <strong style="font-size: 16px; line-height: 1.2; display: block;">${escapeHTML(ev.nome)}</strong>
                    <span style="font-size: 11px; color: ${alerta ? 'var(--erro)' : 'var(--destaque)'}; display: block; margin-top: 4px; display: flex; align-items: center; gap: 4px;">
                        ${alerta ? '<i data-lucide="alert-triangle"></i> PRONTO' : '<i data-lucide="eye"></i> Monitorando'}
                    </span>
                </div>
                <div style="display: flex; gap: 5px; flex-shrink: 0;">
                    <button class="btn btn-primary btn-sm" data-action="abrir-vinculo" data-id="${ev.id}">+ Vincular</button>
                    <button class="btn btn-danger btn-sm" data-action="deletar-evento" data-id="${ev.id}" data-extra="${escapeHTML(ev.nome)}" title="Deletar evento"><i data-lucide="trash-2"></i></button>
                </div>
            </div>

            <div style="flex: 1; display: flex; flex-direction: column; margin-bottom: 10px;">
                ${gatilhosHtml || '<p style="font-size: 11px; color: var(--texto-mutado);">Nenhuma causa vinculada.</p>'}
            </div>

            <div style="margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <div class="barra-bg">
                    <div class="barra-fill ${alerta ? 'barra-alerta' : ''}" style="width: ${pct}%; background-color: ${corBarra};">
                        ${pct > 15 ? `${ev.pool_atual}/${ev.pool_maxima}` : ''}
                    </div>
                </div>
                ${pct <= 15 ? `<span style="font-size: 10px; color: var(--texto-mutado);">${ev.pool_atual}/${ev.pool_maxima}</span>` : ''}
                ${ev.ultima_excedida_em ? `<div style="font-size: 10px; color: var(--texto-mutado); margin-top: 5px; display: flex; align-items: center; gap: 4px;"><i data-lucide="clock"></i> Ativado em: ${new Date(ev.ultima_excedida_em).toLocaleString()}</div>` : ''}

                <div style="font-size: 11px; margin-top: 10px;">
                    <span>Núcleos: ${nucleosBadges}</span>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
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

// Interceta o Ctrl+V na página inteira do Escudo
document.addEventListener('paste', async (event) => {
    // Busca os itens que estão na área de transferência
    const itens = (event.clipboardData || window.clipboardData).items;
    let blobImagem = null;

    // Procura se algum dos itens colados é uma imagem
    for (const item of itens) {
        if (item.type.indexOf('image') === 0) {
            blobImagem = item.getAsFile();
            break;
        }
    }

    if (!blobImagem) return; // Se não for imagem (for texto, etc), ignora.

    // 1. Abre o Modal e prepara o visual de "Carregando"
    abrirModal('modal-novo-monstro');
    const preview = document.getElementById('preview-monstro');
    const loading = document.getElementById('loading-upload');
    const btnSalvar = document.getElementById('btn-salvar-monstro');
    
    preview.style.display = 'none';
    loading.style.display = 'block';
    btnSalvar.disabled = true;

    // Mostra um preview local instantâneo enquanto faz o upload
    preview.src = URL.createObjectURL(blobImagem);

    // 2. Prepara os dados para enviar para a sua rota de mídias (/midia)
    const formData = new FormData();
    formData.append('imagens', blobImagem, `monstro_${Date.now()}.png`);

    try {
        // ATENÇÃO: Usamos o fetch nativo aqui porque o FormData não pode ter
        // o cabeçalho 'Content-Type': 'application/json' que o seu api.js normalmente injeta.
        const res = await fetch(`/midia/upload/cards`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!res.ok) throw new Error('Falha no upload da imagem.');
        
        const dados = await res.json();
        
        // 3. Sucesso! Guarda a URL devolvida pelo servidor, esconde o loading e liberta o botão
        document.getElementById('url-imagem-monstro').value = dados.urls[0]; // midiaController devolve { urls: [...] }
        preview.style.display = 'block';
        loading.style.display = 'none';
        btnSalvar.disabled = false;
        
        // Coloca o foco no input do nome para o Narrador digitar rápido
        document.getElementById('nome-monstro').focus();

    } catch (err) {
        fecharModal('modal-novo-monstro');
        mostrarToast('Erro ao fazer upload da imagem do monstro.', 'erro');
    }
});

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
// Centraliza todos os handlers dinâmicos de click, change e input.
// Substitui os inline handlers (onclick, onchange, oninput) bloqueados pelo CSP.
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
        case 'editar-nucleo':      editarNucleoEscudo(id); break;
        case 'excluir-nucleo':     excluirNucleoEscudo(id); break;
        case 'editar-entidade':    editarEntidadeEscudo(id, extra); break;
        case 'deletar-entidade':   deletarEntidadeEscudo(id, extra); break;
        case 'editar-flag':        editarFlagEscudo(id, extra); break;
        case 'deletar-flag':       deletarFlagEscudo(id, extra); break;
        case 'mover-entidade':     moverNodeNucleoEscudo(id); break;
        case 'adicionar-flag':     adicionarFlagEscudo(id); break;
        case 'abrir-vinculo':      abrirModalVinculo(id); break;
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

