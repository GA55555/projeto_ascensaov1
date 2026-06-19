// ==========================================
// ESTADO GLOBAL E CACHES
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const cronicaId = urlParams.get('id');

let nodesCache = [];
let eventosCache = []; 
let abasCache = [];
let automacoesCache = [];
let sessoesCache = [];
let nucleosCache = { entidade: [], evento: [], sessao: [] };
let nucleoAtivoTipo = 'entidade'; // 'entidade' | 'evento' | 'sessao'

let textoBuscaMundo = '';
let textoBuscaEventos = '';
let textoBuscaSessoes = '';

// ==========================================
// INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('m20_user')) {
        window.location.href = '/login.html';
        return;
    }
    if (!cronicaId) {
        window.location.href = '/profile.html';
        return;
    }

    const linkVoltar = document.getElementById('link-voltar-painel');
    if (linkVoltar) linkVoltar.href = `/painel_narrador.html?id=${cronicaId}`;

    const temAcesso = await verificarAcesso();
    if (temAcesso) {
        await carregarNucleos('entidade');
        await carregarNucleos('evento');
        await carregarNucleos('sessao');
        await Promise.all([
            carregarMundo(),
            carregarEventos(),
            carregarSessoes()
        ]);
        
        // Se houver hash de sessão na URL, abre os detalhes
        if (window.location.hash.startsWith('#sessao-')) {
            const id = window.location.hash.replace('#sessao-', '');
            if (sessoesCache.length === 0) await carregarSessoes();
            abrirDetalhesSessao(id);
        }
    }
});

window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#sessao-')) {
        const id = hash.replace('#sessao-', '');
        if (sessoesCache.length > 0) abrirDetalhesSessao(id);
        else carregarSessoes().then(() => abrirDetalhesSessao(id));
    }
});

async function verificarAcesso() {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/comunidade`);
        if (!res.ok) throw new Error();
        const dados = await res.json();
        
        if (!dados.is_narrador) {
            mostrarToast('Apenas o Narrador pode acessar este painel.', 'erro');
            window.location.href = '/profile.html';
            return false;
        }
        
        const elNome = document.getElementById('nome-cronica');
        if (elNome) elNome.innerText = dados.cronica?.nome || '';
        return true;
    } catch (err) { 
        window.location.href = '/profile.html'; 
        return false; 
    }
}

// ==========================================
// TABS E MODAIS GENÉRICOS
// ==========================================
window.abrirTab = function(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('ativa'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('ativa'));
    
    const btnTab = document.querySelector(`[onclick="abrirTab('${tab}')"]`);
    if (btnTab) btnTab.classList.add('ativa');
    
    const conteudoTab = document.getElementById(`tab-${tab}`);
    if (conteudoTab) conteudoTab.classList.add('ativa');
    
    // Atualiza o conteúdo baseando-se na aba ativa
    if (tab === 'mundo') carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
    else if (tab === 'eventos') {
        carregarNucleos('evento'); 
        carregarEventos(document.getElementById('filtro-nucleo-evento')?.value);
    } 
    else if (tab === 'automacoes') carregarAutomacoes();
    else if (tab === 'sessoes') {
        carregarSessoes();
        carregarNucleos('sessao');
    }
    else if (tab === 'macro') carregarMacroVisao();
}

window.abrirModal = async function(id) {
    const modal = document.getElementById(id);
    if (!modal) return console.error('Modal não encontrado:', id);

    // Carrega núcleos dinamicamente para o modal de forja
    if (id === 'modal-forja') {
        await carregarNucleos('entidade');
        const selectNucleo = document.getElementById('forja-nucleo');
        if (selectNucleo) {
            selectNucleo.innerHTML = '<option value="">Nenhum</option>';
            nucleosCache.entidade.forEach(n => {
                selectNucleo.innerHTML += `<option value="${n.id}">${n.nome}</option>`;
            });
        }
    }
    modal.classList.add('show');
}

window.fecharModal = function(id) { 
    const modal = document.getElementById(id);
    if(modal) modal.classList.remove('show'); 
}

// ==========================================
// NÚCLEOS DE ORGANIZAÇÃO
// ==========================================
window.gerenciarNucleos = async function(tipo) {
    nucleoAtivoTipo = tipo;
    const titulos = {
        'entidade': 'Núcleos de Entidades',
        'evento': 'Núcleos de Eventos',
        'sessao': 'Núcleos de Sessões'
    };
    const tituloEl = document.getElementById('modal-nucleos-titulo');
    if (tituloEl) tituloEl.innerText = titulos[tipo] || 'Gerenciar Núcleos';
    
    await carregarNucleos(tipo);
    abrirModal('modal-nucleos');
}

async function carregarNucleos(tipo) {
    const endpointMap = { 'entidade': 'entidade-nucleos', 'evento': 'evento-nucleos', 'sessao': 'sessao-nucleos' };
    const endpoint = endpointMap[tipo];
    if (!endpoint) return;
    
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/${endpoint}`);
        // Se a rota não existir no servidor, avisamos no console e paramos sem quebrar o site
        if (!res.ok) {
            console.warn(`Aviso: Rota /${endpoint} falhou. Núcleos de ${tipo} ignorados.`);
            return;
        }
        const lista = await res.json();
        nucleosCache[tipo] = lista;            // mantém o cache coerente (ex.: usado por moverNodeNucleo)
        renderizarListaNucleos(lista, tipo);   // popula a lista gerenciável (botões editar/excluir) no modal-nucleos

        // Atualiza selects de filtro
        const selectMap = { 'entidade': 'filtro-nucleo-entidade', 'evento': 'filtro-nucleo-evento', 'sessao': 'filtro-nucleo-sessao' };
        const selectId = selectMap[tipo];
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Todos os núcleos</option><option value="__none__">Sem Núcleo</option>';
            lista.forEach(n => select.innerHTML += `<option value="${n.id}">${escapeHTML(n.nome)}</option>`);
        }
        
        // Select específico do Modal de Sessão
        if (tipo === 'sessao') {
            const selectModal = document.getElementById('sessao-nucleo-id');
            if (selectModal) {
                selectModal.innerHTML = '<option value="">Nenhum / Geral</option>';
                lista.forEach(n => selectModal.innerHTML += `<option value="${n.id}">${escapeHTML(n.nome)}</option>`);
            }
        }
    } catch (err) { console.error(err); }
}

function renderizarListaNucleos(lista, tipo) {
    const div = document.getElementById('lista-nucleos');
    if (!div) return;
    div.innerHTML = lista.map(n => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; margin-bottom: 4px;">
            <span id="nucleo-nome-${n.id}">${escapeHTML(n.nome)}</span>
            <div style="display: flex; gap: 5px;">
                <button class="btn btn-primary btn-sm" onclick="editarNucleo('${n.id}', '${tipo}')"><i data-lucide="pencil"></i></button>
                <button class="btn btn-danger btn-sm" onclick="excluirNucleo('${n.id}', '${tipo}')"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

window.criarNucleo = async function() {
    const elNome = document.getElementById('novo-nucleo-nome');
    const nome = elNome?.value.trim();
    if (!nome) return mostrarToast('Digite um nome.', 'aviso');
    
    const endpointMap = { 'entidade': 'entidade-nucleos', 'evento': 'evento-nucleos', 'sessao': 'sessao-nucleos' };
    const endpoint = endpointMap[nucleoAtivoTipo];
    if (!endpoint) return mostrarToast('Tipo de núcleo inválido.', 'erro');
    
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/${endpoint}`, {
            method: 'POST', body: JSON.stringify({ nome })
        });
        if (res.ok) {
            if(elNome) elNome.value = '';
            await carregarNucleos(nucleoAtivoTipo);
        } else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao criar núcleo.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.editarNucleo = async function(id, tipo) {
    const elNome = document.getElementById(`nucleo-nome-${id}`);
    const nomeAtual = elNome ? elNome.innerText : '';
    const novoNome = prompt('Novo nome:', nomeAtual);
    if (!novoNome || novoNome === nomeAtual) return;
    
    const endpointMap = { 'entidade': `entidade-nucleos/${id}`, 'evento': `evento-nucleos/${id}`, 'sessao': `sessao-nucleos/${id}` };
    const endpoint = endpointMap[tipo];
    
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/${endpoint}`, {
            method: 'PUT', body: JSON.stringify({ nome: novoNome.trim() })
        });
        if (res.ok) await carregarNucleos(tipo);
        else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao editar entidade.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.excluirNucleo = async function(id, tipo) {
    if (!confirm('Excluir este núcleo? Vínculos serão removidos.')) return;
    const endpointMap = { 'entidade': `entidade-nucleos/${id}`, 'evento': `evento-nucleos/${id}`, 'sessao': `sessao-nucleos/${id}` };
    const endpoint = endpointMap[tipo];
    
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/${endpoint}`, { method: 'DELETE' });
        if (res.ok) {
            await carregarNucleos(tipo);
            if (tipo === 'entidade') carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
            else if (tipo === 'evento') carregarEventos(document.getElementById('filtro-nucleo-evento')?.value);
            else if (tipo === 'sessao') carregarSessoes();
        } else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao excluir núcleo.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.moverNodeNucleo = async function(nodeId) {
    await carregarNucleos('entidade'); 
    const nucleos = nucleosCache.entidade;
    const node = nodesCache.find(n => n.id === nodeId);
    const nucleoAtualId = node ? node.nucleo_id : null;

    const div = document.getElementById('lista-nucleos-mover');
    if (!div) return;
    
    let html = `<label class="radio-label"><input type="radio" name="mover-nucleo" value="" ${!nucleoAtualId ? 'checked' : ''}> Nenhum</label>`;
    nucleos.forEach(n => {
        html += `<label class="radio-label"><input type="radio" name="mover-nucleo" value="${n.id}" ${nucleoAtualId === n.id ? 'checked' : ''}> ${escapeHTML(n.nome)}</label>`;
    });
    div.innerHTML = html;
    
    const elNodeId = document.getElementById('mover-node-id');
    if(elNodeId) elNodeId.value = nodeId;
    
    abrirModal('modal-mover-nucleo');
}

window.salvarMoverNucleo = async function() {
    const nodeId = document.getElementById('mover-node-id')?.value;
    const selecionado = document.querySelector('input[name="mover-nucleo"]:checked');
    if (!selecionado) return mostrarToast('Selecione uma opção.', 'aviso');
    const nucleoId = selecionado.value || null; 

    try {
        await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/nucleo`, {
            method: 'PUT', body: JSON.stringify({ nucleo_id: nucleoId })
        });
        fecharModal('modal-mover-nucleo');
        carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
    } catch (err) { mostrarToast('Erro ao mover entidade.', 'erro'); }
}

// ==========================================
// CONTROLE DE MUNDO (ENTIDADES E FLAGS)
// ==========================================
async function carregarMundo(nucleoFiltro = '', textoFiltro = '') {
    try {
        const url = `/cronicas/${cronicaId}/nodes` + (nucleoFiltro ? `?nucleo_id=${nucleoFiltro}` : '');
        const res = await API.fetch(url);
        nodesCache = await res.json();
        let dados = nodesCache;
        if (textoFiltro) dados = dados.filter(n => n.nome.toLowerCase().includes(textoFiltro));
        renderizarGridMundo(dados);
    } catch (err) { console.error(err); }
}

function renderizarGridMundo(lista) {
    const grid = document.getElementById('grid-mundo');
    if (!grid) return;
    if (lista.length === 0) {
        grid.innerHTML = '<div class="info-block-vazio" style="grid-column: 1 / -1;">Nenhuma entidade encontrada.</div>';
        return;
    }
    grid.innerHTML = lista.map(node => `
        <div class="card world-card">
            <div class="world-card__head">
                <div class="world-card__ident">
                    <span class="world-card__icone"><i data-lucide="${iconeEntidade(node.tipo)}"></i></span>
                    <div class="world-card__titulo-wrap">
                        <strong id="node-nome-${node.id}" class="world-card__nome">${escapeHTML(node.nome)}</strong>
                        <span class="badge world-card__tipo">${escapeHTML(node.tipo)}</span>
                    </div>
                </div>
                <div class="world-card__acoes">
                    <button class="btn btn-secondary btn-sm" data-id="${node.id}" onclick="abrirModalSinapses(this.dataset.id)" title="Conexões (Sinapses)"><i data-lucide="share-2"></i></button>
                    <button class="btn btn-primary btn-sm" data-id="${node.id}" data-nome="${escapeHTML(node.nome)}" onclick="editarEntidade(this.dataset.id, this.dataset.nome)" title="Editar nome"><i data-lucide="pencil"></i></button>
                    <button class="btn btn-danger btn-sm" data-id="${node.id}" data-nome="${escapeHTML(node.nome)}" onclick="deletarEntidade(this.dataset.id, this.dataset.nome)" title="Deletar entidade"><i data-lucide="trash-2"></i></button>
                </div>
            </div>

            <div class="world-card__marcos-label">Marcos</div>
            <div id="flags-${node.id}" class="world-card__marcos">
                ${(node.flags || []).filter(f => f.key).map(f => `
                    <div class="marco-item">
                        <label class="marco-item__label">
                            <input type="checkbox" class="marco-item__check" ${f.value ? 'checked' : ''} data-node-id="${node.id}" data-flag-key="${escapeHTML(f.key)}" onchange="toggleFlag(this.dataset.nodeId, this.dataset.flagKey, this.checked)">
                            <span id="flag-nome-${node.id}-${escapeHTML(f.key)}" class="marco-item__nome" title="${escapeHTML(f.key)}">${escapeHTML(humanizarMarco(f.key))}</span>
                        </label>
                        <div class="marco-item__acoes">
                            <button class="btn btn-primary btn-sm" data-node-id="${node.id}" data-flag-key="${escapeHTML(f.key)}" onclick="editarFlag(this.dataset.nodeId, this.dataset.flagKey)" title="Renomear marco"><i data-lucide="pencil"></i></button>
                            <button class="btn btn-danger btn-sm" data-node-id="${node.id}" data-flag-key="${escapeHTML(f.key)}" onclick="deletarFlag(this.dataset.nodeId, this.dataset.flagKey)" title="Deletar marco"><i data-lucide="x"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="world-card__rodape">
                <div class="world-card__nucleo">
                    <span>Núcleo: <span id="node-nucleo-${node.id}" class="world-card__nucleo-nome">${escapeHTML(node.nucleo_nome || 'Nenhum')}</span></span>
                    <button class="btn btn-primary btn-sm flex-shrink-0" onclick="moverNodeNucleo('${node.id}')">Mover</button>
                </div>
                <button class="btn btn-primary btn-sm world-card__add-marco" onclick="adicionarFlag('${node.id}')"><i data-lucide="plus"></i> Novo Marco</button>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
}

window.salvarForja = async function() {
    const nome = document.getElementById('forja-nome')?.value.trim();
    const tipo = document.getElementById('forja-tipo')?.value;
    const nucleoId = document.getElementById('forja-nucleo')?.value;

    if (!nome) return mostrarToast('Digite um nome.', 'aviso');
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes`, {
            method: 'POST', body: JSON.stringify({ nome, tipo, nucleo_id: nucleoId || null })
        });
        if (res.ok) {
            fecharModal('modal-forja');
            carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
        }
    } catch (err) { mostrarToast('Erro ao forjar entidade.', 'erro'); }
}

window.editarEntidade = async function(nodeId, nomeAtual) {
    const novoNome = prompt('Novo nome da entidade:', nomeAtual);
    if (!novoNome || novoNome.trim() === '' || novoNome === nomeAtual) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, {
            method: 'PUT', body: JSON.stringify({ nome: novoNome.trim() })
        });
        if (res.ok) {
            carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
            const node = nodesCache.find(n => n.id === nodeId);
            if (node) node.nome = novoNome.trim();
        } else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao editar entidade.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.deletarEntidade = async function(nodeId, nome) {
    if (!confirm(`Deletar a entidade "${nome}"? Isso removerá TODOS os marcos e vínculos com eventos!`)) return;
    if (!confirm('Esta ação é IRREVERSÍVEL. Continuar?')) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, { method: 'DELETE' });
        if (res.ok) carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
        else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao deletar entidade.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

// ==========================================
// SINAPSES (CONEXÕES BIDIRECIONAIS ENTRE ENTIDADES)
// Modal dinâmico de instância única + navegação em teia. Consome MundoApi.
// Nomenclatura: Sinapse/Conexão/Link — nunca "Vínculo" (colisão com gatilhos de evento).
// ==========================================
let todosNodesSinapse = []; // lista completa de nós da crônica (independe do filtro do grid)
let sinapsesAtuais = [];    // links renderizados no modal aberto (fonte p/ o Contrato de Relação)
let nodeAtualSinapse = null; // nó central do modal de sinapses aberto

window.abrirModalSinapses = async function(nodeId) {
    fecharModalSinapses(); // instância única
    try {
        todosNodesSinapse = await MundoApi.getNodes(cronicaId); // lista completa (não a filtrada do grid)
    } catch (e) {
        mostrarToast('Erro ao carregar entidades.', 'erro');
        return;
    }
    const no = todosNodesSinapse.find(n => String(n.id) === String(nodeId));
    const nomeNo = no ? no.nome : 'Entidade';

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-sinapses';
    modal.innerHTML = `
        <div class="modal-box" style="width: 480px; max-width: 92%; max-height: 85vh; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 class="texto-roxo" style="margin: 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="share-2"></i> Conexões — ${escapeHTML(nomeNo)}</h3>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-secondary btn-sm" data-id="${escapeHTML(String(nodeId))}" onclick="abrirMapaSinapses(this.dataset.id)" title="Ver Mapa de Sinapses"><i data-lucide="network"></i> Mapa</button>
                    <button class="btn btn-ghost btn-sm" onclick="fecharModalSinapses()" title="Fechar"><i data-lucide="x"></i></button>
                </div>
            </div>

            <div id="sinapses-lista" style="flex: 1; overflow-y: auto; min-height: 60px; margin-bottom: 16px; display: flex; flex-wrap: wrap; align-content: flex-start;">
                <div class="info-block-vazio" style="width: 100%;"><span class="spinner"></span> A carregar conexões...</div>
            </div>

            <div style="border-top: 1px solid var(--borda); padding-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end;">
                <div style="flex: 1; min-width: 150px;">
                    <label style="font-size: 12px; color: var(--texto-mutado); display: block; margin-bottom: 4px;">Entidade</label>
                    <select id="sinapse-destino" class="input-sm" style="width: 100%;"></select>
                </div>
                <div style="min-width: 120px;">
                    <label style="font-size: 12px; color: var(--texto-mutado); display: block; margin-bottom: 4px;">Tipo</label>
                    <select id="sinapse-tipo" class="input-sm" style="width: 100%;">
                        <option value="associado">Associado</option>
                        <option value="aliado">Aliado</option>
                        <option value="inimigo">Inimigo</option>
                        <option value="localizacao">Localização</option>
                    </select>
                </div>
                <div style="width: 72px;">
                    <label style="font-size: 12px; color: var(--texto-mutado); display: block; margin-bottom: 4px;" title="Máximo de pressão (limite do termômetro)">Máx.</label>
                    <input type="number" id="sinapse-limite" class="input-sm" min="1" max="20" value="3" style="width: 100%;">
                </div>
                <button class="btn btn-primary btn-sm" data-id="${escapeHTML(String(nodeId))}" onclick="conectarSinapse(this.dataset.id)"><i data-lucide="link"></i> Conectar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharModalSinapses(); });
    lucide.createIcons();

    await recarregarSinapses(nodeId);
};

window.fecharModalSinapses = function() {
    const m = document.getElementById('modal-sinapses');
    if (m) m.remove();
};

// Re-busca conexões, redesenha os badges e repopula o dropdown (exclui self + já conectados).
async function recarregarSinapses(nodeId) {
    const cont = document.getElementById('sinapses-lista');
    if (!cont) return;

    let links = [];
    try {
        links = await MundoApi.listarLinks(cronicaId, nodeId);
    } catch (e) {
        cont.innerHTML = '<div class="info-block-vazio" style="width: 100%;">Erro ao carregar conexões.</div>';
        return;
    }

    // Estado p/ o Contrato de Relação localizar o link e o nó central.
    nodeAtualSinapse = nodeId;
    sinapsesAtuais = links;

    if (!links.length) {
        cont.innerHTML = '<div class="info-block-vazio" style="width: 100%;">Nenhuma conexão ainda.</div>';
    } else {
        cont.innerHTML = links.map(l => {
            const d = l.dados || {};
            const tags = Array.isArray(d.tags) ? d.tags : [];
            const limite = parseInt(d.limite, 10) || 3;
            const pressao = tags.length;
            const critico = pressao >= limite && pressao > 0;
            const termo = pressao > 0
                ? `<span class="badge-termometro-wrap" data-link="${escapeHTML(String(l.id))}" onclick="abrirContratoRelacao(this.dataset.link)" title="Pressão ${pressao}/${limite}${critico ? ' — MASSA CRÍTICA' : ''}">${barraPressaoHTML(pressao, limite, true)}</span>`
                : '';
            return `
            <span class="badge-link ${classeTipoLink(l.tipo_vinculo)}${critico ? ' link-massa-critica' : ''}">
                <span class="badge-link-nome" data-id="${escapeHTML(String(l.node_conectado_id))}" onclick="navegarSinapse(this.dataset.id)" title="Abrir entidade conectada">${escapeHTML(l.tipo_vinculo)}: ${escapeHTML(l.node_conectado_nome)}</span>
                ${termo}
                <i data-lucide="book-open" class="btn-contrato" data-link="${escapeHTML(String(l.id))}" onclick="abrirContratoRelacao(this.dataset.link)" title="Contrato de Relação"></i>
                <i data-lucide="x" class="btn-deletar-link" data-node="${escapeHTML(String(nodeId))}" data-link="${escapeHTML(String(l.id))}" onclick="removerSinapse(this.dataset.node, this.dataset.link)" title="Remover conexão"></i>
            </span>`;
        }).join('');
    }

    const conectados = links.map(l => String(l.node_conectado_id));
    popularDestinosSinapse(nodeId, conectados);
    lucide.createIcons();
}

// Popula o <select> de destino com os outros nós (exclui o próprio nó e os já conectados).
function popularDestinosSinapse(nodeId, conectadosIds) {
    const sel = document.getElementById('sinapse-destino');
    if (!sel) return;
    const excluir = new Set([String(nodeId), ...conectadosIds]);
    const opcoes = todosNodesSinapse.filter(n => !excluir.has(String(n.id)));
    sel.innerHTML = opcoes.length
        ? opcoes.map(n => `<option value="${escapeHTML(String(n.id))}">${escapeHTML(n.nome)} (${escapeHTML(n.tipo)})</option>`).join('')
        : '<option value="">— Sem entidades disponíveis —</option>';
}

window.conectarSinapse = async function(nodeId) {
    const destino = document.getElementById('sinapse-destino')?.value;
    const tipo = document.getElementById('sinapse-tipo')?.value || 'associado';
    if (!destino) { mostrarToast('Selecione uma entidade para conectar.', 'aviso'); return; }
    const limite = Math.min(20, Math.max(1, parseInt(document.getElementById('sinapse-limite')?.value, 10) || 3));
    try {
        // Criação rápida: nó + tipo + limite do termômetro. As tags (pressão) são
        // adicionadas depois, pelo Contrato de Relação ao clicar no badge.
        await MundoApi.criarLink(cronicaId, nodeId, destino, tipo, { limite });
        mostrarToast('Conexão criada!', 'sucesso');
        await recarregarSinapses(nodeId);
    } catch (e) {
        mostrarToast(e.message || 'Erro ao criar conexão.', 'erro');
    }
};

window.removerSinapse = async function(nodeId, linkId) {
    if (!confirm('Remover esta conexão?')) return;
    try {
        await MundoApi.deletarLink(cronicaId, nodeId, linkId);
        mostrarToast('Conexão removida.', 'sucesso');
        await recarregarSinapses(nodeId);
    } catch (e) {
        mostrarToast(e.message || 'Erro ao remover conexão.', 'erro');
    }
};

// Navegação em teia: fecha o modal atual e abre o da entidade conectada (instância única).
window.navegarSinapse = function(connectedNodeId) {
    abrirModalSinapses(connectedNodeId);
};

// ── PANELA DE PRESSÃO (Fase 11 refatorada): TAGS + TERMÔMETRO ──
// Estado local do Contrato aberto (fonte da verdade enquanto o modal vive).
let contratoLinkId = null;
let contratoTags = [];
let contratoLimite = 3;

// Barrinha de pressão contínua: largura = pressao/limite, cor modula brando→escuro
// (paleta Brasa) via color-mix das vars --pressao-baixa/--pressao-alta. `compacta` =
// versão miúda do badge. Largura% + cor são dinâmicos data-driven (Regra 2.5, barra-fill).
function barraPressaoHTML(pressao, limite, compacta = false) {
    const lim = Math.max(1, parseInt(limite, 10) || 3);
    const p = Math.max(0, parseInt(pressao, 10) || 0);
    const pct = Math.round(Math.min(p / lim, 1) * 100);
    const critico = p >= lim;
    const cor = `color-mix(in srgb, var(--pressao-alta) ${pct}%, var(--pressao-baixa))`;
    return `<span class="pressao-barra${compacta ? ' compacta' : ''}${critico ? ' massa-critica' : ''}">
        <span class="pressao-fill" style="width: ${pct}%; background: ${cor};"></span>
    </span>`;
}

// Corpo dinâmico do Contrato (pills + termômetro), re-renderizado a cada mudança.
function corpoContratoHTML() {
    const pressao = contratoTags.length;
    const critico = pressao >= contratoLimite;
    const pills = contratoTags.map((t, i) =>
        `<span class="tag">${escapeHTML(t)}<i data-lucide="x" class="tag-remover" data-idx="${i}" onclick="removerTagContrato(this.dataset.idx)" title="Remover"></i></span>`
    ).join('');
    return `
        <div class="tag-lista">${pills}</div>
        <div class="termometro-rotulo">
            ${barraPressaoHTML(pressao, contratoLimite, false)}
            <span class="termo-estado ${critico ? 'critico' : ''}">${critico ? 'MASSA CRÍTICA' : `Pressão ${pressao}/${contratoLimite}`}</span>
        </div>`;
}

// Micro-modal "Contrato de Relação": tags (FATE) que enchem o termômetro. Cada
// adição/remoção persiste já no JSONB `dados` via MundoApi.atualizarLink.
window.abrirContratoRelacao = function(linkId) {
    const l = sinapsesAtuais.find(x => String(x.id) === String(linkId));
    if (!l) { mostrarToast('Conexão não encontrada.', 'erro'); return; }
    fecharContrato();
    const central = todosNodesSinapse.find(n => String(n.id) === String(nodeAtualSinapse));
    const nomeA = central ? central.nome : 'Entidade';
    const d = l.dados || {};
    contratoLinkId = l.id;
    contratoTags = Array.isArray(d.tags) ? d.tags.slice() : [];
    contratoLimite = parseInt(d.limite, 10) || 3;

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-contrato';
    modal.innerHTML = `
        <div class="modal-box" style="width: 440px; max-width: 92%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h3 class="texto-roxo" style="margin: 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="flame"></i> Contrato de Relação</h3>
                <button class="btn btn-ghost btn-sm" onclick="fecharContrato()" title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <div class="contrato-partes">
                <span class="badge-link ${classeTipoLink(l.tipo_vinculo)}">${escapeHTML(nomeA)}</span>
                <i data-lucide="arrow-left-right"></i>
                <span class="badge-link ${classeTipoLink(l.tipo_vinculo)}">${escapeHTML(l.node_conectado_nome)}</span>
            </div>
            <p class="contrato-tipo">Tipo: ${escapeHTML(capitalizar(l.tipo_vinculo))}</p>
            <label>Incidentes / Motivos</label>
            <input type="text" id="contrato-tag-input" class="input-sm" placeholder="Adicionar incidente/motivo... (Enter)" onkeydown="contratoTagKeydown(event)" style="width: 100%;">
            <div id="contrato-corpo">${corpoContratoHTML()}</div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharContrato(); });
    lucide.createIcons();
    document.getElementById('contrato-tag-input')?.focus();
};
window.fecharContrato = function() {
    const m = document.getElementById('modal-contrato');
    if (m) m.remove();
};
// Enter no input → vira tag e persiste. Único ponto de escuta no elemento (Regra 2.9).
window.contratoTagKeydown = function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = (e.target.value || '').trim();
    if (!val) return;
    if (contratoTags.length >= 50) { mostrarToast('Limite de tags atingido.', 'aviso'); return; }
    contratoTags.push(val.slice(0, 120));
    e.target.value = '';
    persistirContrato();
};
window.removerTagContrato = function(idx) {
    contratoTags.splice(parseInt(idx, 10), 1);
    persistirContrato();
};
// Persiste o array de tags no JSONB e atualiza o corpo do modal + os badges do painel.
async function persistirContrato() {
    const corpo = document.getElementById('contrato-corpo');
    if (corpo) { corpo.innerHTML = corpoContratoHTML(); lucide.createIcons(); } // re-render otimista
    try {
        await MundoApi.atualizarLink(cronicaId, nodeAtualSinapse, contratoLinkId, { tags: contratoTags, limite: contratoLimite });
        await recarregarSinapses(nodeAtualSinapse); // reflete termômetro/massa crítica no badge
    } catch (e) {
        mostrarToast(e.message || 'Erro ao gravar a pressão da relação.', 'erro');
    }
}

// ── Helpers semânticos ─────────────────────────────────────
// Classe de cor por tipo de sinapse (fallback neutro = associado).
function classeTipoLink(tipo) {
    const t = String(tipo || '').toLowerCase();
    return ['aliado', 'inimigo', 'associado', 'localizacao'].includes(t) ? `badge-link-${t}` : 'badge-link-associado';
}
function capitalizar(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
}
// Exibição humana de um Marco (ex-flag): "porta_secreta" -> "Porta Secreta".
// NÃO altera o identificador real (flag_key); só o texto visível. O valor cru
// continua viajando em data-flag-key/title e no payload da API.
function humanizarMarco(key) {
    return String(key || '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
}
// Ícone Lucide por tipo de entidade (world_nodes.tipo).
function iconeEntidade(tipo) {
    const mapa = { npc: 'user', protagonista: 'crown', faccao: 'flag', local: 'map-pin', cenario: 'mountain' };
    return mapa[String(tipo || '').toLowerCase()] || 'box';
}

// ==========================================
// MAPA DE SINAPSES (VISÃO RELACIONAL EM TEIA — sem Canvas/WebGL)
// ==========================================
window.abrirMapaSinapses = async function(nodeId) {
    fecharModalSinapses();
    fecharMapaSinapses(); // instância única
    try {
        if (!todosNodesSinapse.length) todosNodesSinapse = await MundoApi.getNodes(cronicaId);
    } catch (e) { /* segue com o que houver em cache */ }

    let links = [];
    try {
        links = await MundoApi.listarLinks(cronicaId, nodeId);
    } catch (e) {
        mostrarToast('Erro ao carregar o mapa de sinapses.', 'erro');
        return;
    }

    const central = todosNodesSinapse.find(n => String(n.id) === String(nodeId));
    const nomeCentral = central ? central.nome : 'Entidade';
    const tipoCentral = central ? central.tipo : '';

    // Agrupa as conexões por tipo_vinculo (uma coluna por tipo).
    const grupos = {};
    links.forEach(l => {
        const t = l.tipo_vinculo || 'associado';
        (grupos[t] = grupos[t] || []).push(l);
    });

    const colunasHTML = Object.keys(grupos).length
        ? Object.entries(grupos).map(([tipo, ls]) => `
            <div class="mapa-coluna">
                <div class="mapa-coluna-titulo ${classeTipoLink(tipo)}">
                    <span>${escapeHTML(capitalizar(tipo))}</span>
                    <span class="mapa-coluna-contagem">${ls.length}</span>
                </div>
                ${ls.map(miniCardSinapse).join('')}
            </div>`).join('')
        : '<div class="info-block-vazio" style="grid-column: 1 / -1;">Nenhuma conexão para mapear.</div>';

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-mapa-sinapses';
    modal.innerHTML = `
        <div class="modal-box mapa-sinapses-box">
            <div class="mapa-sinapses-header">
                <h3 class="texto-roxo" style="margin: 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="network"></i> Mapa de Sinapses</h3>
                <button class="btn btn-ghost btn-sm" onclick="fecharMapaSinapses()" title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <div class="no-central">
                <i data-lucide="${iconeEntidade(tipoCentral)}"></i>
                <div>
                    <div class="no-central-nome">${escapeHTML(nomeCentral)}</div>
                    <div class="no-central-tipo">${escapeHTML(tipoCentral || '—')}</div>
                </div>
            </div>
            <div class="mapa-sinapses-grid">
                ${colunasHTML}
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharMapaSinapses(); });
    lucide.createIcons();
};

window.fecharMapaSinapses = function() {
    const m = document.getElementById('modal-mapa-sinapses');
    if (m) m.remove();
};

// Mini-card de uma conexão: borda colorida (cor do tipo) + ícone da entidade + "Abrir Card" (re-centra o mapa).
function miniCardSinapse(l) {
    return `
        <div class="mini-card-link ${classeTipoLink(l.tipo_vinculo)}">
            <i data-lucide="${iconeEntidade(l.node_conectado_tipo)}" class="mini-card-icone"></i>
            <span class="mini-card-nome" title="${escapeHTML(l.node_conectado_nome)}">${escapeHTML(l.node_conectado_nome)}</span>
            <button class="btn btn-secondary btn-sm" data-id="${escapeHTML(String(l.node_conectado_id))}" onclick="abrirMapaSinapses(this.dataset.id)" title="Centrar o mapa nesta entidade"><i data-lucide="arrow-right"></i> Abrir Card</button>
        </div>`;
}

window.toggleFlag = async function(nodeId, flagKey, value) {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags`, {
            method: 'PUT', body: JSON.stringify({ flag_key: flagKey, flag_value: value })
        });
        const data = await res.json();
        
        if (data.avisos && data.avisos.length > 0) {
            mostrarToast('Atenção! Eventos ultrapassaram a pool máxima:\n' + data.avisos.join('\n'), 'aviso');
        }
        
        // Atualiza a aba de Eventos instantaneamente se estiver aberta
        if (document.getElementById('tab-eventos')?.classList.contains('ativa')) carregarEventos();

        // 👇 A MÁGICA PARA A ENTIDADE APARECER SOZINHA 👇
        // Se a aba "Mundo" estiver aberta quando a flag for clicada, agendamos uma recarga silenciosa.
        // Damos 1 segundo (1000ms) para garantir que a fila assíncrona do backend já forjou a entidade.
        if (document.getElementById('tab-mundo')?.classList.contains('ativa')) {
            setTimeout(() => {
                const nucleoFiltroAtual = document.getElementById('filtro-nucleo-entidade')?.value;
                const textoBuscaAtual = document.getElementById('busca-mundo')?.value.trim().toLowerCase();
                // Recarrega os dados do banco e redesenha a grid mantendo os filtros
                carregarMundo(nucleoFiltroAtual, textoBuscaAtual);
            }, 1000); 
        }

    } catch (err) { console.error(err); }
}

window.adicionarFlag = async function(nodeId) {
    const nome = prompt('Nome do novo Marco:');
    if (!nome) return;
    await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags`, {
        method: 'POST', body: JSON.stringify({ flag_key: nome })
    });
    carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
}

window.editarFlag = async function(nodeId, flagKey) {
    const novoNome = prompt('Novo nome do marco:', humanizarMarco(flagKey));
    if (!novoNome || novoNome.trim() === '' || novoNome === flagKey) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags/${flagKey}`, {
            method: 'PUT', body: JSON.stringify({ novo_nome: novoNome.trim().toLowerCase().replace(/\s+/g, '_') })
        });
        if (res.ok) carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
        else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao renomear marco.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

window.deletarFlag = async function(nodeId, flagKey) {
    if (!confirm(`Deletar o marco "${humanizarMarco(flagKey)}"? Isso removerá os vínculos com eventos!`)) return;

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags/${flagKey}`, { method: 'DELETE' });
        if (res.ok) {
            carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value);
            if (document.getElementById('tab-eventos')?.classList.contains('ativa')) carregarEventos();
        } else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao deletar marco.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão.', 'erro'); }
}

// ==========================================
// AGENDA DE EVENTOS E VÍNCULOS (SISTEMA BLINDADO)
// ==========================================

async function carregarEventos(nucleoFiltro = '', textoFiltro = '') {
    try {
        const url = `/cronicas/${cronicaId}/eventos` + (nucleoFiltro ? `?nucleo_id=${nucleoFiltro}` : '');
        const res = await API.fetch(url, { cache: 'no-store' });
        
        let dadosBrutos = await res.json();
        
        // Garante que o frontend entende os arrays que chegam do backend
        eventosCache = dadosBrutos.map(ev => {
            if (typeof ev.nucleos === 'string') { try { ev.nucleos = JSON.parse(ev.nucleos); } catch(e) { ev.nucleos = []; } }
            if (!Array.isArray(ev.nucleos)) ev.nucleos = [];
            
            if (typeof ev.gatilhos === 'string') { try { ev.gatilhos = JSON.parse(ev.gatilhos); } catch(e) { ev.gatilhos = []; } }
            if (!Array.isArray(ev.gatilhos)) ev.gatilhos = [];
            
            return ev;
        });
        
        let dados = eventosCache;
        if (textoFiltro) dados = dados.filter(e => e.nome.toLowerCase().includes(textoFiltro));
        renderizarGridEventos(dados);
    } catch (err) { console.error("Erro ao carregar eventos:", err); }
}

function renderizarGridEventos(lista) {
    const grid = document.getElementById('grid-eventos');
    if (!grid) return;
    if (lista.length === 0) {
        grid.innerHTML = '<div class="info-block-vazio">Nenhum evento encontrado.</div>';
        return;
    }
    
    grid.innerHTML = lista.map(ev => {
        const pct = Math.min((ev.pool_atual / ev.pool_maxima) * 100, 100);
        const alerta = pct >= 100;
        const corBarra = pct < 50 ? '#2ecc71' : (pct < 75 ? '#f1c40f' : '#e74c3c');
        
        let gatilhosHtml = '';
        if (ev.gatilhos && ev.gatilhos.length > 0) {
            gatilhosHtml = ev.gatilhos.filter(g => g && g.node_nome).map(g => `
                <div style="font-size: 11px; background: rgba(255,255,255,0.03); padding: 4px 8px; border-radius: 4px; margin-bottom: 3px;">
                    <i data-lucide="settings"></i> <strong>${escapeHTML(g.node_nome)}</strong> → ${escapeHTML(humanizarMarco(g.flag_key))} (+${g.peso})
                </div>
            `).join('');
        }

        // Criar as Badges dos Núcleos
        const nucleosArray = ev.nucleos.filter(n => n && n.nome);
        const nucleosBadges = (nucleosArray.length > 0) 
            ? nucleosArray.map(n => `<span class="badge">${escapeHTML(n.nome)}</span>`).join(' ')
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
                    <button class="btn btn-primary btn-sm" onclick="abrirModalVinculo('${ev.id}')">+ Vincular</button>
                    <button class="btn btn-danger btn-sm" data-id="${ev.id}" data-nome="${escapeHTML(ev.nome)}" onclick="deletarEvento(this.dataset.id, this.dataset.nome)" title="Deletar evento"><i data-lucide="trash-2"></i></button>
                </div>
            </div>

            <div style="flex: 1; display: flex; flex-direction: column; margin-bottom: 10px;">
                ${gatilhosHtml || '<p style="font-size: 11px; color: var(--texto-mutado);">Nenhuma causa vinculada.</p>'}
            </div>

            <div style="margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <div class="barra-bg">
                    <div class="barra-fill ${alerta ? 'barra-alerta' : ''}" style="width: ${pct}%; background-color: ${corBarra};"></div>
                </div>
                <div class="evento-pool-info">
                    <span class="evento-pool-caption">Pool</span>
                    <span class="evento-pool-valor ${alerta ? 'evento-pool-valor--alerta' : ''}">${ev.pool_atual} / ${ev.pool_maxima}</span>
                </div>
                ${ev.ultima_excedida_em ? `<div style="font-size: 10px; color: var(--texto-mutado); margin-top: 5px; display: flex; align-items: center; gap: 4px;"><i data-lucide="clock"></i> Ativado em: ${new Date(ev.ultima_excedida_em).toLocaleString()}</div>` : ''}
                
                <div style="font-size: 11px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 5px;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Núcleos: ${nucleosBadges}</span>
                    <button class="btn btn-primary btn-sm flex-shrink-0" onclick="gerenciarNucleosEvento('${ev.id}')">Editar</button>
                </div>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

window.gerenciarNucleosEvento = async function(eventId) {
    await carregarNucleos('evento'); 
    
    // Pega o evento que está neste momento na memória local
    const ev = eventosCache.find(e => e.id === eventId);
    if (!ev) return mostrarToast('Evento não encontrado na memória.', 'erro');
    
    const nucleosVinculados = ev.nucleos || [];

    const div = document.getElementById('lista-nucleos-evento');
    if (div) {
        div.innerHTML = nucleosCache.evento.map(n => {
            const checked = nucleosVinculados.some(v => v.id === n.id);
            return `<label class="checkbox-label">
                <input type="checkbox" value="${n.id}" ${checked ? 'checked' : ''}> ${escapeHTML(n.nome)}
            </label>`;
        }).join('');
    }
    
    const elEventoId = document.getElementById('nucleos-evento-id');
    if (elEventoId) elEventoId.value = eventId;
    
    abrirModal('modal-nucleos-evento');
}

// =======================================================
// A MÁGICA ACONTECE AQUI: Atualiza a tela SEM a internet
// =======================================================
window.salvarNucleosEvento = async function() {
    const eventId = document.getElementById('nucleos-evento-id')?.value;
    const checkboxes = document.querySelectorAll('#lista-nucleos-evento input[type="checkbox"]');
    const selecionados = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

    const ev = eventosCache.find(e => e.id === eventId);
    if (!ev) return;

    const atuaisIds = (ev.nucleos || []).map(n => n.id);
    const paraAdicionar = selecionados.filter(id => !atuaisIds.includes(id));
    const paraRemover = atuaisIds.filter(id => !selecionados.includes(id));

    // MUTAÇÃO LOCAL: Grava na memória e desenha imediatamente no ecrã
    const novosNucleos = nucleosCache.evento.filter(n => selecionados.includes(n.id));
    ev.nucleos = novosNucleos;

    fecharModal('modal-nucleos-evento');
    
    // Atualiza apenas a interface visual
    const textoFiltro = document.getElementById('busca-eventos')?.value.trim().toLowerCase() || '';
    let dados = eventosCache;
    if (textoFiltro) dados = dados.filter(e => e.nome.toLowerCase().includes(textoFiltro));
    renderizarGridEventos(dados);

    // TRABALHO DE FUNDO: Envia silenciosamente para o banco de dados
    try {
        for (const id of paraAdicionar) {
            await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}/nucleos`, {
                method: 'POST', body: JSON.stringify({ nucleo_id: id })
            });
        }
        for (const id of paraRemover) {
            await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}/nucleos/${id}`, { method: 'DELETE' });
        }
    } catch (err) {
        console.error("Erro na sincronização oculta:", err);
    }
}

// ==========================================
// FUNÇÕES DE SALVAMENTO DE NÚCLEOS E AUTOMAÇÕES
// ==========================================

window.salvarNucleosEvento = async function() {
    const eventId = document.getElementById('nucleos-evento-id')?.value;
    const checkboxes = document.querySelectorAll('#lista-nucleos-evento input[type="checkbox"]');
    const selecionados = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

    const ev = eventosCache.find(e => e.id === eventId);
    if (!ev) return;

    const atuaisIds = (ev.nucleos || []).map(n => n.id);
    const paraAdicionar = selecionados.filter(id => !atuaisIds.includes(id));
    const paraRemover = atuaisIds.filter(id => !selecionados.includes(id));

    // MUTAÇÃO LOCAL: Grava na memória e desenha imediatamente no ecrã
    const novosNucleos = nucleosCache.evento.filter(n => selecionados.includes(n.id));
    ev.nucleos = novosNucleos;

    fecharModal('modal-nucleos-evento');
    
    // Atualiza apenas a interface visual
    const textoFiltro = document.getElementById('busca-eventos')?.value.trim().toLowerCase() || '';
    let dados = eventosCache;
    if (textoFiltro) dados = dados.filter(e => e.nome.toLowerCase().includes(textoFiltro));
    renderizarGridEventos(dados);

    // TRABALHO DE FUNDO: Envia silenciosamente para o banco de dados
    try {
        for (const id of paraAdicionar) {
            await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}/nucleos`, {
                method: 'POST', body: JSON.stringify({ nucleo_id: id })
            });
        }
        for (const id of paraRemover) {
            await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}/nucleos/${id}`, { method: 'DELETE' });
        }
    } catch (err) {
        console.error("Erro na sincronização oculta:", err);
    }
}

window.toggleAutomacaoStatus = async function(id, checkboxElem) {
    const isAtivo = checkboxElem.checked;

    // 1. Atualiza o cache local imediatamente
    const auto = automacoesCache.find(a => a.id === id);
    if (auto) auto.ativo = isAtivo;

    // 2. Atualiza o visual do cartão no DOM, sem esperar pelo servidor
    const card = document.getElementById(`auto-card-${id}`);
    if (card) {
        const label = card.querySelector('label');
        if (label) {
            // Atualiza o texto e a cor conforme o novo estado
            if (isAtivo) {
                label.innerHTML = `<input type="checkbox" onchange="toggleAutomacaoStatus('${id}', this)" checked> <i data-lucide="zap"></i> Automação Armada`;
                label.style.color = 'var(--texto)';
            } else {
                label.innerHTML = `<input type="checkbox" onchange="toggleAutomacaoStatus('${id}', this)"> <i data-lucide="moon"></i> Automação Desarmada`;
                label.style.color = 'var(--texto-mutado)';
            }
            lucide.createIcons();
        }
    }

    // 3. Tenta sincronizar com o servidor em segundo plano
    try {
        await API.fetch(`/cronicas/${cronicaId}/automacoes/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ ativo: isAtivo })
        });
        // Se quiseres podes mostrar um toast de sucesso, mas não é obrigatório
        // mostrarToast(isAtivo ? 'Automação armada' : 'Automação desarmada', 'sucesso');
    } catch (err) {
        console.error("Erro ao alternar automação:", err);
        // Reverte o estado local em caso de falha
        if (auto) auto.ativo = !isAtivo;
        checkboxElem.checked = !isAtivo;
        // Reverte também o visual do cartão
        if (card) {
            const label = card.querySelector('label');
            if (label) {
                if (!isAtivo) { // estava a tentar desarmar, mas falhou → volta a armado
                    label.innerHTML = `<input type="checkbox" onchange="toggleAutomacaoStatus('${id}', this)" checked> <i data-lucide="zap"></i> Automação Armada`;
                    label.style.color = 'var(--texto)';
                } else {
                    label.innerHTML = `<input type="checkbox" onchange="toggleAutomacaoStatus('${id}', this)"> <i data-lucide="moon"></i> Automação Desarmada`;
                    label.style.color = 'var(--texto-mutado)';
                }
                lucide.createIcons();
            }
        }
        mostrarToast('Erro ao tentar rearmar a automação.', 'erro');
    }
};

window.deletarEvento = async function(eventId, nome) {
    if (!confirm(`Tem certeza que deseja deletar o evento "${nome}"? Todos os vínculos serão removidos.`)) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}`, { method: 'DELETE' });
        if (res.ok) carregarEventos();
        else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao deletar evento.', 'erro');
        }
    } catch (err) { mostrarToast('Erro de conexão ao tentar deletar evento.', 'erro'); }
}

window.abrirModalVinculo = async function(eventId) {
    await carregarNucleos('evento'); 
    
    const elEventId = document.getElementById('vinculo-event-id');
    if(elEventId) elEventId.value = eventId;
    
    const select = document.getElementById('vinculo-node-id');
    if(select) {
        select.innerHTML = '<option value="">Selecione um nó...</option>';
        nodesCache.forEach(n => select.innerHTML += `<option value="${n.id}">${escapeHTML(n.nome)} (${escapeHTML(n.tipo)})</option>`);
    }
    const selectFlag = document.getElementById('vinculo-flag-key');
    if(selectFlag) selectFlag.innerHTML = '<option value="">Selecione um nó primeiro...</option>';
    
    abrirModal('modal-vinculo');
}

// 1. A função que tinha sumido (Para o botão "+ Forjar Evento" voltar a funcionar)
window.prepararModalEvento = async function() {
    await carregarNucleos('evento');
    const select = document.getElementById('evento-nucleos');
    if (select) {
        select.innerHTML = '';
        nucleosCache.evento.forEach(n => {
            const option = document.createElement('option');
            option.value = n.id;
            option.text = n.nome;
            select.appendChild(option);
        });
    }
    abrirModal('modal-evento');
}

// ==========================================
// CRIAÇÃO DE NOVOS EVENTOS
// ==========================================
window.salvarEvento = async function() {
    const nome = document.getElementById('evento-nome')?.value.trim();
    const descricao = document.getElementById('evento-descricao')?.value.trim();
    const pool_maxima = parseInt(document.getElementById('evento-pool')?.value) || 10;
    
    // Captura múltiplos núcleos se o utilizador tiver selecionado com Ctrl
    const selectNucleos = document.getElementById('evento-nucleos');
    const nucleos_ids = Array.from(selectNucleos?.selectedOptions || []).map(opt => opt.value);

    if (!nome) return mostrarToast('O nome do evento é obrigatório.', 'aviso');

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos`, {
            method: 'POST',
            body: JSON.stringify({ nome, descricao, pool_maxima, nucleos_ids })
        });

        if (res.ok) {
            fecharModal('modal-evento');
            
            // Limpa os campos para a próxima vez que abrir o modal
            if (document.getElementById('evento-nome')) document.getElementById('evento-nome').value = '';
            if (document.getElementById('evento-descricao')) document.getElementById('evento-descricao').value = '';
            if (document.getElementById('evento-pool')) document.getElementById('evento-pool').value = '10';
            
            // Pede ao banco de dados a lista atualizada com o novo evento
            carregarEventos(document.getElementById('filtro-nucleo-evento')?.value);
        } else {
            const err = await res.json();
            mostrarToast(err.erro || 'Erro ao forjar evento.', 'erro');
        }
    } catch (err) {
    console.error(err);
    mostrarToast('Erro de conexão ao tentar forjar o evento.', 'erro');
    }
}



window.abrirModalVinculo = async function(eventId) {
    const elEventId = document.getElementById('vinculo-event-id');
    if(elEventId) elEventId.value = eventId;
    
    const select = document.getElementById('vinculo-node-id');
    if(select) {
        select.innerHTML = '<option value="">Selecione um nó...</option>';
        nodesCache.forEach(n => select.innerHTML += `<option value="${n.id}">${escapeHTML(n.nome)} (${escapeHTML(n.tipo)})</option>`);
    }
    const selectFlag = document.getElementById('vinculo-flag-key');
    if(selectFlag) selectFlag.innerHTML = '<option value="">Selecione um nó primeiro...</option>';
    
    abrirModal('modal-vinculo');
}

window.atualizarFlagsVinculo = function() {
    const nodeId = document.getElementById('vinculo-node-id')?.value;
    const selectFlags = document.getElementById('vinculo-flag-key');
    if (!selectFlags) return;
    
    selectFlags.innerHTML = '<option value="">Selecione um marco...</option>';
    const node = nodesCache.find(n => n.id === nodeId);
    if (node?.flags) node.flags.filter(f => f.key).forEach(f => selectFlags.innerHTML += `<option value="${escapeHTML(f.key)}">${escapeHTML(humanizarMarco(f.key))}</option>`);
}

window.salvarVinculo = async function() {
    const eventId = document.getElementById('vinculo-event-id')?.value;
    const nodeId = document.getElementById('vinculo-node-id')?.value;
    const flagKey = document.getElementById('vinculo-flag-key')?.value;
    const peso = parseInt(document.getElementById('vinculo-peso')?.value) || 1;
    if (!nodeId || !flagKey) return mostrarToast('Selecione nó e marco.', 'aviso');
    
    try {
        await API.fetch(`/cronicas/${cronicaId}/eventos/${eventId}/pesos`, {
            method: 'POST', body: JSON.stringify({ node_id: nodeId, flag_key: flagKey, peso })
        });
        fecharModal('modal-vinculo');
        carregarEventos();
    } catch (err) { mostrarToast('Erro ao criar vínculo.', 'erro'); }
}

// ==========================================
// AUTOMAÇÕES
// ==========================================
async function carregarAutomacoes() {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/automacoes`);
        if (!res.ok) return;
        const automacoes = await res.json();
        automacoesCache = automacoes || [];

        const grid = document.getElementById('grid-automacoes');
        if (grid && document.getElementById('tab-automacoes')?.classList.contains('ativa')) {
            if (automacoesCache.length === 0) {
                grid.innerHTML = '<div class="info-block-vazio">Nenhuma automação.</div>';
                return;
            }
            grid.innerHTML = automacoesCache.map(auto => {
                let badgeTxt = auto.tipo_nome === 'alterar_flag' ? '<i data-lucide="flag"></i> Marco' : (auto.tipo_nome === 'postar_em_aba' ? '<i data-lucide="scroll"></i> Post' : '<i data-lucide="calendar"></i> Evento');
                
                // BOAS PRÁTICAS 1: Tabela Dinâmica e Limpa em vez de JSON cru
                const parametrosHtml = Object.entries(auto.parametros || {}).map(([key, value]) => `
                    <div style="display: contents;">
                        <span style="color: var(--texto-mutado); text-align: right;">${escapeHTML(String(key))}:</span>
                        <strong style="color: var(--texto-claro); word-break: break-word;">${escapeHTML(String(value))}</strong>
                    </div>
                `).join('');

                return `
                <div class="card" id="auto-card-${auto.id}" style="display: flex; flex-direction: column; height: 100%;">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px;">
                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start;">
                            <span class="badge" style="max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(auto.evento_nome)}">
                                Gatilho: ${escapeHTML(auto.evento_nome)}
                            </span>
                            <strong style="font-size: 14px; color: var(--texto-claro);">Ação: ${badgeTxt}</strong>
                        </div>
                        <button class="btn btn-danger btn-sm flex-shrink-0" onclick="deletarAutomacao('${auto.id}')"><i data-lucide="trash-2"></i></button>
                    </div>

                    <div style="flex: 1; display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; align-items: start; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; font-size: 12px; margin-bottom: 12px;">
                        ${parametrosHtml || '<span style="grid-column: span 2; color: var(--texto-mutado);">Sem parâmetros.</span>'}
                    </div>
                    
                    <div style="margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                        <label style="font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 8px; color: ${auto.ativo ? 'var(--texto)' : 'var(--texto-mutado)'}; margin: 0;">
                            <input type="checkbox" onchange="toggleAutomacaoStatus('${auto.id}', this)" ${auto.ativo ? 'checked' : ''} style="margin: 0; width: 16px; height: 16px; cursor: pointer;">
                            ${auto.ativo ? '<i data-lucide="zap"></i> Automação Armada' : '<i data-lucide="moon"></i> Automação Desarmada'}
                        </label>
                    </div>
                </div>`;
            }).join('');
            lucide.createIcons();
        }
    } catch (err) {
        console.warn('Não foi possível carregar automações:', err);
        automacoesCache = [];
    }
}

window.abrirModalAutomacao = async function() {
    if (nucleosCache.entidade.length === 0) await carregarNucleos('entidade');
    
    if (eventosCache.length === 0) {
        const resE = await API.fetch(`/cronicas/${cronicaId}/eventos`);
        if (resE.ok) eventosCache = await resE.json();
    }
    if (abasCache.length === 0) {
        const resA = await API.fetch(`/cronicas/${cronicaId}/comunidade`);
        if (resA.ok) {
            const dadosA = await resA.json();
            abasCache = dadosA.abas || [];
        }
    }
    
    const selectEvento = document.getElementById('auto-evento-id');
    if(selectEvento) {
        selectEvento.innerHTML = '<option value="">Selecione o Evento que vai engatilhar...</option>';
        eventosCache.forEach(e => selectEvento.innerHTML += `<option value="${e.id}">${escapeHTML(e.nome)}</option>`);
    }

    const autoTipo = document.getElementById('auto-tipo');
    if(autoTipo) autoTipo.value = "";
    window.renderizarCamposAutomacao();
    abrirModal('modal-automacao');
}

window.atualizarFlagsAutomacao = function() {
    const nodeId = document.getElementById('param-node-id')?.value;
    const selectFlag = document.getElementById('param-flag-key');
    if (!selectFlag) return;
    
    selectFlag.innerHTML = '<option value="">Selecione um marco...</option>';
    const node = nodesCache.find(n => n.id === nodeId);
    if (node?.flags) {
        node.flags.filter(f => f.key).forEach(f => selectFlag.innerHTML += `<option value="${escapeHTML(f.key)}">${escapeHTML(humanizarMarco(f.key))}</option>`);
    }
}

window.renderizarCamposAutomacao = function() {
    const tipo = document.getElementById('auto-tipo')?.value;
    const div = document.getElementById('auto-campos-dinamicos');
    if (!div) return;
    
    if (!tipo) { div.style.display = 'none'; div.innerHTML = ''; return; }
    div.style.display = 'block';
    let html = '';

    if (tipo === 'criar_flag') {
        html += `<label>Entidade Alvo</label><select id="param-node-id">`;
        nodesCache.forEach(n => html += `<option value="${n.id}">${escapeHTML(n.nome)}</option>`);
        html += `</select>
                 <label>Nome do Novo Marco (ex: amaldiçoado)</label>
                 <input type="text" id="param-flag-key" placeholder="Digite o nome do marco">
                 <label>Estado Inicial</label>
                 <select id="param-flag-value">
                    <option value="true">Verdadeiro (Ativa/Concedida)</option>
                    <option value="false">Falso (Desativada/Removida)</option>
                 </select>`;
    } 
    else if (tipo === 'alterar_flag') {
        html += `<label>Entidade Alvo</label><select id="param-node-id" onchange="atualizarFlagsAutomacao()">`;
        html += `<option value="">Selecione a entidade...</option>`;
        nodesCache.forEach(n => html += `<option value="${n.id}">${escapeHTML(n.nome)}</option>`);
        html += `</select>
                 <label>Qual Marco deseja alterar?</label>
                 <select id="param-flag-key"><option value="">Selecione a entidade primeiro...</option></select>
                 <label>Mudar para qual estado?</label>
                 <select id="param-flag-value">
                    <option value="true">Verdadeiro (Ativar)</option>
                    <option value="false">Falso (Desativar)</option>
                 </select>`;
    }
    else if (tipo === 'postar_em_aba') {
        html += `<label>Aba de Destino na Comunidade</label><select id="param-aba-id">`;
        abasCache.forEach(a => html += `<option value="${a.id}">${escapeHTML(a.nome)}</option>`);
        html += `</select>
                 <label>Mensagem da Postagem</label>
                 <textarea id="param-conteudo" rows="4" placeholder="Um grito ecoa..."></textarea>`;
    } 
    else if (tipo === 'criar_evento') {
        html += `<label>Nome do Novo Evento Consequência</label>
                 <input type="text" id="param-nome" placeholder="Ex: Fuga dos Prisioneiros">
                 <label>Descrição do Evento</label>
                 <textarea id="param-descricao" rows="2"></textarea>
                 <label>Tamanho da Pool do Novo Evento</label>
                 <input type="number" id="param-pool" value="10">`;
    }
    else if (tipo === 'criar_entidade') {
    html += `
        <label>Nome da Entidade</label>
        <input type="text" id="param-nome-entidade" placeholder="Ex: Guarda da Cidade">
        <label>Tipo</label>
        <select id="param-tipo-entidade">
            <option value="npc">NPC</option>
            <option value="protagonista">Protagonista</option>
            <option value="faccao">Facção</option>
            <option value="local">Local</option>
            <option value="cenario">Cenário Macro</option>
        </select>
        <label>Núcleo (opcional)</label>
        <select id="param-nucleo-entidade">
            <option value="">Nenhum</option>
            ${nucleosCache.entidade.map(n => `<option value="${n.id}">${n.nome}</option>`).join('')}
        </select>
        <label>Marcos (opcional)</label>
        <div id="param-flags-container">
            <div class="flag-row" style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="text" class="flag-key" placeholder="Chave" style="flex:1;">
                <select class="flag-value" style="width: 120px;">
                    <option value="true">Verdadeiro</option>
                    <option value="false">Falso</option>
                </select>
                <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>
            </div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" onclick="adicionarLinhaFlag()">+ Adicionar Marco</button>
    `;
    }
    div.innerHTML = html;
    if (html) lucide.createIcons();
}

window.salvarAutomacao = async function() {
    const evento_id = document.getElementById('auto-evento-id')?.value;
    const tipo_nome = document.getElementById('auto-tipo')?.value;

    if (!evento_id || !tipo_nome) return mostrarToast("Selecione um evento e um tipo de ação.", 'aviso');

    let parametros = {};

    if (tipo_nome === 'criar_flag') {
        parametros.node_id = document.getElementById('param-node-id').value;
        parametros.flag_key = document.getElementById('param-flag-key').value.trim();
        parametros.valor_inicial = document.getElementById('param-flag-value').value === 'true';
        if (!parametros.flag_key) return mostrarToast("O Marco precisa de um nome.", 'aviso');
    } 
    else if (tipo_nome === 'alterar_flag') {
        parametros.node_id = document.getElementById('param-node-id').value;
        parametros.flag_key = document.getElementById('param-flag-key').value.trim();
        parametros.novo_valor = document.getElementById('param-flag-value').value === 'true';
        if (!parametros.flag_key) return mostrarToast("Selecione um marco existente para alterar.", 'aviso');
    }
    else if (tipo_nome === 'postar_em_aba') {
        parametros.aba_id = document.getElementById('param-aba-id').value;
        parametros.conteudo = document.getElementById('param-conteudo').value.trim();
        if (!parametros.aba_id || !parametros.conteudo) return mostrarToast("Selecione uma aba e digite a mensagem da postagem.", 'aviso');
    }
    else if (tipo_nome === 'criar_evento') {
        parametros.nome = document.getElementById('param-nome').value.trim();
        parametros.descricao = document.getElementById('param-descricao').value.trim();
        parametros.pool_maxima = parseInt(document.getElementById('param-pool').value) || 10;
        if (!parametros.nome) return mostrarToast("O novo evento precisa de um nome.", 'aviso');
    }
    else if (tipo_nome === 'criar_entidade') {
    parametros.nome = document.getElementById('param-nome-entidade').value.trim();
    parametros.tipo = document.getElementById('param-tipo-entidade').value;
    parametros.nucleo_id = document.getElementById('param-nucleo-entidade').value || null;
    // Coleta flags
    const flagRows = document.querySelectorAll('#param-flags-container .flag-row');
    const flags = [];
    flagRows.forEach(row => {
        const key = row.querySelector('.flag-key').value.trim();
        const value = row.querySelector('.flag-value').value === 'true';
        if (key) flags.push({ key, value });
    });
    parametros.flags = flags;
    if (!parametros.nome) return mostrarToast("O nome da entidade é obrigatório.", 'aviso');
    }

    // 👇 1. LIGA O MODO CARREGAMENTO ANTES DE ENVIAR PARA O BANCO
    setLoading('btn-salvar-automacao', true, 'Forjando'); 

    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/automacoes`, {
            method: 'POST', body: JSON.stringify({ evento_id, tipo_nome, parametros })
        });
        
        if (res.ok) {
    fecharModal('modal-automacao');
    carregarAutomacoes();
    
    // 🌟 SE FOR UMA AUTOMAÇÃO DE CRIAR ENTIDADE, ADICIONA AO CACHE LOCAL
    if (tipo_nome === 'criar_entidade') {
        // Cria um objeto temporário com os dados que o backend vai gerar
        const novaEntidade = {
            id: 'temp-' + Date.now(), // ID temporário (será substituído no próximo carregarMundo)
            nome: parametros.nome,
            tipo: parametros.tipo,
            nucleo_id: parametros.nucleo_id || null,
            nucleo_nome: nucleosCache.entidade.find(n => n.id === parametros.nucleo_id)?.nome || 'Nenhum',
            flags: (parametros.flags || []).map(f => ({
                key: f.key,
                value: f.value
            }))
        };
        
        // Adiciona ao cache local
        nodesCache.unshift(novaEntidade);
        
        // Se a aba Mundo estiver ativa, renderiza imediatamente
        if (document.getElementById('tab-mundo')?.classList.contains('ativa')) {
            const textoFiltro = document.getElementById('busca-mundo')?.value.trim().toLowerCase() || '';
            let dados = nodesCache;
            if (textoFiltro) dados = dados.filter(n => n.nome.toLowerCase().includes(textoFiltro));
            renderizarGridMundo(dados);
        }
        
        // Agenda uma recarga silenciosa dos dados reais do servidor (substitui o temporário)
        setTimeout(() => carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value), 1500);
    }
    
    mostrarToast("Automação forjada com sucesso!", "sucesso");
} else {
            const erroDoServidor = await res.json();
            mostrarToast("A magia falhou: " + (erroDoServidor.detalhe || erroDoServidor.erro), 'erro');
        }
    } catch (err) { 
        mostrarToast("Erro de conexão.", 'erro'); 
    } finally {
        // 👇 3. DESLIGA O MODO CARREGAMENTO, INDEPENDENTEMENTE DE DAR CERTO OU ERRO
        setLoading('btn-salvar-automacao', false, 'Salvar Automação'); 
    }
}

window.deletarAutomacao = async function(id) {
    if (!confirm("Tem certeza que deseja desconectar este fio do destino?")) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/automacoes/${id}`, { method: 'DELETE' });
        if (res.ok) carregarAutomacoes();
    } catch (err) { mostrarToast("Erro de conexão.", 'erro'); }
}

window.adicionarLinhaFlag = function() {
    const container = document.getElementById('param-flags-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'flag-row';
    row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 5px;';
    row.innerHTML = `
        <input type="text" class="flag-key" placeholder="Chave" style="flex:1;">
        <select class="flag-value" style="width: 120px;">
            <option value="true">Verdadeiro</option>
            <option value="false">Falso</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>
    `;
    container.appendChild(row);
    lucide.createIcons();
};

// ==========================================
// SESSÕES E DIÁRIOS
// ==========================================
async function carregarSessoes() {
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/sessoes`);
        if (!res.ok) throw new Error('Erro ao buscar sessões');
        const data = await res.json();
        sessoesCache = Array.isArray(data) ? data : [];
        renderizarSessoes();
    } catch (err) {
        console.error(err);
        sessoesCache = [];
        renderizarSessoes();
    }
}

function formatarData(data) {
    if (!data) return '';
    const dateString = String(data).split('T')[0];
    const partes = dateString.split('-');
    if (partes.length === 3) {
        const [ano, mes, dia] = partes;
        return `${parseInt(dia)}/${parseInt(mes)}/${ano}`;
    }
    const d = new Date(data);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
}

// ========================================================
// 1. O Cartão da Sessão (Agora com a Badge do Núcleo)
// ========================================================
function renderizarSessoes(listaParaRenderizar = sessoesCache) {
    const grid = document.getElementById('grid-sessoes');
    if (!grid) return;
    
    if (listaParaRenderizar.length === 0) {
        grid.innerHTML = '<div class="info-block-vazio" style="grid-column: 1 / -1;">Nenhuma sessão registrada (ou encontrada neste núcleo).</div>';
        return;
    }
    
    grid.innerHTML = listaParaRenderizar.map(s => {
        const dataFormatada = formatarData(s.data_sessao);
        
        // Badge alinhada e protegida contra textos longos
        const nucleoBadge = s.nucleo_nome 
            ? `<span class="badge" style="max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; margin-bottom: 6px;">${escapeHTML(s.nucleo_nome)}</span>`
            : '';

        return `
        <div class="card" onclick="abrirDetalhesSessao('${s.id}')" 
             style="cursor: pointer; transition: border-color 0.2s ease; border: 1px solid var(--borda); display: flex; flex-direction: column; height: 100%;" 
             onmouseover="this.style.borderColor='var(--destaque)'" 
             onmouseout="this.style.borderColor='var(--borda)'">
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px;">
                <div style="flex: 1; min-width: 0;">
                    ${nucleoBadge}
                    <strong style="font-size: 16px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHTML(s.titulo)}">
                        ${escapeHTML(s.titulo)}
                    </strong>
                </div>
                <span style="color: var(--texto-mutado); font-size: 12px; flex-shrink: 0; margin-top: 4px;">
                    ${dataFormatada}
                </span>
            </div>

            <div style="flex: 1; margin-bottom: 15px;">
                <p style="font-size:13px; margin: 0; color: var(--texto-mutado); display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; line-height: 1.5;">
                    ${escapeHTML(s.resumo || 'Clique para ler os registros, entidades presentes e desfechos deste encontro...')}
                </p>
            </div>

            <div style="margin-top: auto; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: ${s.status === 'jogada' ? 'var(--destaque)' : 'var(--texto-mutado)'};">
                    Status: ${escapeHTML(s.status || 'planejada')}
                </span>
                <button class="btn btn-danger btn-sm"
                        onclick="event.stopPropagation(); excluirSessao('${s.id}')" title="Excluir Sessão">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

window.abrirModalSessao = async function(id = null) {
    // Assegura que todas as memórias cache estão prontas antes de abrir
    if (!nucleosCache.sessao || nucleosCache.sessao.length === 0) await carregarNucleos('sessao');
    if (!nucleosCache.evento || nucleosCache.evento.length === 0) await carregarNucleos('evento');
    if (nodesCache.length === 0) await carregarMundo();
    if (eventosCache.length === 0) await carregarEventos(); 
    if (automacoesCache.length === 0) await carregarAutomacoes();

    // 🌟 A MÁGICA: Juntar Núcleos de Sessão e de Evento no mesmo Dropdown!
    const selectModal = document.getElementById('sessao-nucleo-id');
    if (selectModal) {
        let html = '<option value="">Nenhum / Geral</option>';
        
        if (nucleosCache.sessao && nucleosCache.sessao.length > 0) {
            html += '<optgroup label="Núcleos de Sessão">';
            nucleosCache.sessao.forEach(n => html += `<option value="${n.id}">${n.nome}</option>`);
            html += '</optgroup>';
        }
        
        if (nucleosCache.evento && nucleosCache.evento.length > 0) {
            html += '<optgroup label="Arcos de Eventos">';
            nucleosCache.evento.forEach(n => html += `<option value="${n.id}">${n.nome}</option>`);
            html += '</optgroup>';
        }
        selectModal.innerHTML = html;
    }

    // Preenche as checkboxes
    const divEnt = document.getElementById('sessao-entidades');
    const divEv = document.getElementById('sessao-eventos');
    const divAuto = document.getElementById('sessao-automacoes');

    if(divEnt) divEnt.innerHTML = nodesCache.map(n => `<label class="checkbox-label"><input type="checkbox" value="${n.id}" class="check-entidade"> ${escapeHTML(n.nome)} (${escapeHTML(n.tipo)})</label>`).join('');
    if(divEv) divEv.innerHTML = eventosCache.map(e => `<label class="checkbox-label"><input type="checkbox" value="${e.id}" class="check-evento"> ${escapeHTML(e.nome)}</label>`).join('');
    if(divAuto) divAuto.innerHTML = (automacoesCache || []).map(a => `<label class="checkbox-label"><input type="checkbox" value="${a.id}" class="check-automacao"> ${escapeHTML(a.tipo_nome)} (${escapeHTML(a.evento_nome)})</label>`).join('');

    const txtDesfechos = document.getElementById('sessao-desfechos');

    if (id) {
        const s = sessoesCache.find(x => x.id === id);
        if (!s) return;
        document.getElementById('sessao-id').value = s.id;
        document.getElementById('sessao-titulo').value = s.titulo;
        
        // Garante que a data não quebre no input HTML
        document.getElementById('sessao-data').value = s.data_sessao ? s.data_sessao.split('T')[0] : '';
        document.getElementById('sessao-resumo').value = s.resumo || '';
        document.getElementById('sessao-status').value = s.status || 'planejada';
        document.getElementById('sessao-nucleo-id').value = s.nucleo_id || '';
        document.getElementById('modal-sessao-titulo').innerText = 'Editar Sessão';

        const entidadesAtuais = s.entidades || [];
        const eventosAtuais = s.eventos || [];
        const automacoesAtuais = s.automacoes || [];

        document.querySelectorAll('#sessao-entidades .check-entidade').forEach(cb => cb.checked = entidadesAtuais.includes(cb.value));
        document.querySelectorAll('#sessao-eventos .check-evento').forEach(cb => cb.checked = eventosAtuais.includes(cb.value));
        document.querySelectorAll('#sessao-automacoes .check-automacao').forEach(cb => cb.checked = automacoesAtuais.includes(cb.value));
        
        if(txtDesfechos) txtDesfechos.value = (s.desfechos || []).join('\n');
    } else {
        document.getElementById('sessao-id').value = '';
        document.getElementById('sessao-titulo').value = '';
        document.getElementById('sessao-data').value = '';
        document.getElementById('sessao-resumo').value = '';
        document.getElementById('sessao-status').value = 'planejada';
        document.getElementById('sessao-nucleo-id').value = '';
        document.getElementById('modal-sessao-titulo').innerText = 'Nova Sessão';
        
        document.querySelectorAll('.check-entidade, .check-evento, .check-automacao').forEach(cb => cb.checked = false);
        if(txtDesfechos) txtDesfechos.value = '';       
    }
    abrirModal('modal-sessao');
}

// ========================================================
// 2. O Salvamento (Mapeando o nome do núcleo instantaneamente)
// ========================================================
window.salvarSessao = async function() {
    const id = document.getElementById('sessao-id')?.value;
    const titulo = document.getElementById('sessao-titulo')?.value.trim();
    const data_sessao = document.getElementById('sessao-data')?.value;
    const resumo = document.getElementById('sessao-resumo')?.value.trim();
    const status = document.getElementById('sessao-status')?.value;
    const nucleo_id = document.getElementById('sessao-nucleo-id')?.value || null;

    if (!titulo) return mostrarToast('Título obrigatório.', 'aviso');

    const entidades = Array.from(document.querySelectorAll('#sessao-entidades .check-entidade:checked')).map(cb => cb.value);
    const eventos = Array.from(document.querySelectorAll('#sessao-eventos .check-evento:checked')).map(cb => cb.value);
    const automacoes = Array.from(document.querySelectorAll('#sessao-automacoes .check-automacao:checked')).map(cb => cb.value);
    const desfechos = document.getElementById('sessao-desfechos')?.value.split('\n').filter(l => l.trim() !== '') || [];

    // Mutaçāo Ouro: Encontra o nome do núcleo, independentemente de ser de Sessão ou de Evento
    let nucleo_nome = null;
    if (nucleo_id) {
        let nObj = nucleosCache.sessao?.find(n => n.id === nucleo_id);
        if (!nObj) nObj = nucleosCache.evento?.find(n => n.id === nucleo_id);
        if (nObj) nucleo_nome = nObj.nome;
    }

    const bodyObj = { titulo, data_sessao, resumo, status, nucleo_id, nucleo_nome, entidades, eventos, automacoes, desfechos };
    
    fecharModal('modal-sessao');

    try {
        if (id) {
            const index = sessoesCache.findIndex(s => s.id === id);
            if (index !== -1) {
                sessoesCache[index] = { ...sessoesCache[index], ...bodyObj };
                renderizarSessoes();
                if (document.getElementById('sessao-detalhes')?.style.display === 'block') abrirDetalhesSessao(id);
            }
            API.fetch(`/cronicas/${cronicaId}/sessoes/${id}`, { method: 'PUT', body: JSON.stringify(bodyObj) }).catch(e => console.error(e));
        } else {
            const resp = await API.fetch(`/cronicas/${cronicaId}/sessoes`, { method: 'POST', body: JSON.stringify(bodyObj) });
            if (resp.ok) {
                const novaSessao = await resp.json();
                novaSessao.nucleo_nome = nucleo_nome; 
                sessoesCache.unshift(novaSessao);
                renderizarSessoes();
            } else {
                mostrarToast("Erro ao gravar nova sessão.", 'erro');
            }
        }
    } catch (err) { mostrarToast('Erro fatal de conexão.', 'erro'); }
}

window.editarSessao = function(id) { abrirModalSessao(id); }

window.excluirSessao = async function(id) {
    if (!confirm('Excluir esta sessão permanentemente?')) return;
    
    // MUTAÇÃO LOCAL: Exclui da interface instantaneamente
    sessoesCache = sessoesCache.filter(s => s.id !== id);
    renderizarSessoes();

    try {
        // Envia comando para a base de dados em background
        await API.fetch(`/cronicas/${cronicaId}/sessoes/${id}`, { method: 'DELETE' });
    } catch (e) { console.error("Falha silenciosa ao deletar sessão:", e); }
}

window.abrirDetalhesSessao = async function(id) {
    const s = sessoesCache.find(x => x.id === id);
    if (!s) return;

    await carregarMundo(); 
    try {
        const resE = await API.fetch(`/cronicas/${cronicaId}/eventos`);
        if (resE.ok) eventosCache = await resE.json();
        const resA = await API.fetch(`/cronicas/${cronicaId}/automacoes`);
        if (resA.ok) automacoesCache = await resA.json();
    } catch (e) { console.warn("Aviso: Falha ao puxar dados.", e); }

    document.getElementById('grid-sessoes').style.display = 'none';
    const tabCabecalho = document.querySelector('#tab-sessoes > div:first-child');
    if (tabCabecalho) tabCabecalho.style.display = 'none';
    document.getElementById('sessao-detalhes').style.display = 'block';

    document.getElementById('detalhe-titulo').innerText = s.titulo;
    document.getElementById('detalhe-meta').innerText = `Data: ${formatarData(s.data_sessao)} | Status: ${s.status.toUpperCase()} | Núcleo: ${s.nucleo_nome || 'Geral'}`;
    document.getElementById('detalhe-resumo').innerText = s.resumo || 'Ainda não há registros escritos para este encontro.';

    const ulEntidades = document.getElementById('detalhe-entidades');
    const entidadesIds = (s.entidades || []).filter(id => nodesCache.some(n => n.id === id));
    if(ulEntidades) {
        ulEntidades.innerHTML = entidadesIds.length > 0
        ? entidadesIds.map(nodeId => {
            const node = nodesCache.find(n => n.id === nodeId);
            return `<li style="display: flex; align-items: center; gap: 8px;">
                <span><i data-lucide="user"></i> ${escapeHTML(node.nome)}</span>
                <button class="btn btn-danger btn-sm" style="padding: 2px 6px; font-size: 10px;"
                        onclick="removerVinculoSessao('entidade', '${nodeId}')"><i data-lucide="x"></i></button>
            </li>`;
        }).join('')
        : '<li style="color: var(--texto-mutado);">Nenhuma entidade atrelada.</li>';
    }

    const ulEventos = document.getElementById('detalhe-eventos');
    const eventosIds = s.eventos || [];
    let eventosHtml = eventosIds.map(evId => {
        const ev = eventosCache.find(e => e.id === evId);
        return `<li style="display: flex; align-items: center; gap: 8px;">
            <span><i data-lucide="calendar"></i> <strong class="texto-destaque">${ev ? escapeHTML(ev.nome) : 'Evento Desconhecido'}</strong></span>
            <button class="btn btn-danger btn-sm" style="padding: 2px 6px; font-size: 10px;"
                    onclick="removerVinculoSessao('evento', '${evId}')"><i data-lucide="x"></i></button>
        </li>`;
    }).join('');
    
    const automacoesIds = s.automacoes || [];
    let automacoesHtml = automacoesIds.map(autoId => {
        const auto = automacoesCache.find(a => a.id === autoId);
        return `<li style="display: flex; align-items: center; gap: 6px;"><i data-lucide="zap"></i> Automação: ${auto ? escapeHTML(auto.tipo_nome) + ' via ' + escapeHTML(auto.evento_nome) : 'Desconhecida'}</li>`;
    }).join('');
    
    if(ulEventos) ulEventos.innerHTML = eventosHtml + automacoesHtml || '<li style="color: var(--texto-mutado);">Nenhum evento ou automação.</li>';

    const ulDesfechos = document.getElementById('detalhe-desfechos');
    const desfechos = s.desfechos || [];
    if(ulDesfechos) ulDesfechos.innerHTML = desfechos.map(d => `<li>${escapeHTML(d)}</li>`).join('') || '<li style="color: var(--texto-mutado);">Nenhum desfecho registrado.</li>';

    lucide.createIcons();
    carregarSavesEscudo(s.id);
    document.getElementById('btn-editar-sessao-detalhe').onclick = () => editarSessao(s.id);
    window.location.hash = `sessao-${s.id}`;
}

window.fecharDetalhesSessao = function() {
    document.getElementById('sessao-detalhes').style.display = 'none';
    document.getElementById('grid-sessoes').style.display = 'grid';
    const tabCabecalho = document.querySelector('#tab-sessoes > div:first-child');
    if (tabCabecalho) tabCabecalho.style.display = 'flex';
    window.location.hash = ''; 
}

window.removerVinculoSessao = async function(tipo, id) {
    const sessaoId = window.location.hash.replace('#sessao-', '');
    if (!sessaoId) return;
    
    const s = sessoesCache.find(x => x.id === sessaoId);
    if (!s) return;

    // MUTAÇÃO LOCAL: Remove o vínculo na memória e redesenha a tela instantaneamente
    if (tipo === 'entidade') s.entidades = (s.entidades || []).filter(e => e !== id);
    else if (tipo === 'evento') s.eventos = (s.eventos || []).filter(e => e !== id);
    
    abrirDetalhesSessao(sessaoId); // Redesenha com a linha excluída

    try {
        // Sincroniza a remoção com a base de dados (Sem travar o utilizador)
        await API.fetch(`/cronicas/${cronicaId}/sessoes/${sessaoId}`, {
            method: 'PUT', body: JSON.stringify(s) 
        });
    } catch (err) { console.error('Erro na sincronização de desvinculação:', err); }
}

// ==========================================
// FILTROS E PESQUISAS
// ==========================================
window.aplicarFiltrosMundo = function() {
    textoBuscaMundo = document.getElementById('busca-mundo')?.value.trim().toLowerCase();
    const nucleoId = document.getElementById('filtro-nucleo-entidade')?.value;
    carregarMundo(nucleoId, textoBuscaMundo);
}

window.aplicarFiltrosEventos = function() {
    textoBuscaEventos = document.getElementById('busca-eventos')?.value.trim().toLowerCase();
    const nucleoId = document.getElementById('filtro-nucleo-evento')?.value;
    carregarEventos(nucleoId, textoBuscaEventos);
}

window.aplicarFiltrosSessoes = function() {
    textoBuscaSessoes = document.getElementById('busca-sessoes')?.value.trim().toLowerCase();
    const nucleoId = document.getElementById('filtro-nucleo-sessao')?.value;
    let dados = sessoesCache;
    if (nucleoId && nucleoId !== "__none__") dados = dados.filter(s => s.nucleo_id === nucleoId);
    if (nucleoId === "__none__") dados = dados.filter(s => !s.nucleo_id);
    if (textoBuscaSessoes) dados = dados.filter(s => s.titulo.toLowerCase().includes(textoBuscaSessoes));
    renderizarSessoes(dados);
}

window.filtrarPorNucleoEntidade = function() {
    const nucleoId = document.getElementById('filtro-nucleo-entidade')?.value;
    carregarMundo(nucleoId);
}

window.filtrarPorNucleoEvento = function() {
    const nucleoId = document.getElementById('filtro-nucleo-evento')?.value;
    carregarEventos(nucleoId);
}

window.filtrarPorNucleoSessao = function() { window.aplicarFiltrosSessoes(); }

// ==========================================
// INTEGRAÇÃO COM ESCUDO DO NARRADOR
// ==========================================
async function carregarSavesEscudo(sessaoId) {
    const ulSaves = document.getElementById('detalhe-saves-escudo');
    if (!ulSaves) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/escudo-saves?sessao_id=${sessaoId}`);
        if (res.ok) {
            const saves = await res.json();
            if (saves.length === 0) {
                ulSaves.innerHTML = '<li style="color: var(--texto-mutado);">Nenhum save de combate vinculado.</li>';
                return;
            }
            ulSaves.innerHTML = saves.map(s => `
                <li style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <i data-lucide="swords"></i> <strong>${escapeHTML(s.nome)}</strong>
                    <span class="texto-mutado" style="font-size: 11px;">(${new Date(s.criado_em).toLocaleString('pt-BR')})</span>
                    <button class="btn btn-outline-primary btn-sm" style="margin-left: 10px;" onclick="abrirEscudoComSave('${s.id}')">Carregar no Escudo</button>
                </li>
            `).join('');
            lucide.createIcons();
        }
    } catch (err) {
        ulSaves.innerHTML = '<li style="color: var(--erro);">Erro ao carregar saves.</li>';
    }
}

window.abrirEscudoComSave = function(saveId) {
    window.open(`/escudo_narrador.html?id=${cronicaId}&save=${saveId}`, '_blank');
}

// ==========================================
// MACRO-VISÃO (FASE 12) — ÁRVORE DE PROGRESSÃO POR NÚCLEO
// Tech tree vertical (CSS <ul>/<li>), nós ligados por world_links 'progressao'.
// Consome MundoApi.buscarArvoreNucleo. Núcleos reais = entidade_nucleos.
// ==========================================
let macroNucleoAtual = null;   // núcleo selecionado na aba Macro
let desbloqueioPaiId = null;   // pai do "Novo Desbloqueio" em curso

// Popula o <select> de núcleos da aba a partir do cache de entidades.
async function carregarMacroVisao() {
    if (!nucleosCache.entidade || nucleosCache.entidade.length === 0) await carregarNucleos('entidade');
    const sel = document.getElementById('macro-nucleo-select');
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">Selecione um núcleo...</option>'
        + nucleosCache.entidade.map(n => `<option value="${escapeHTML(String(n.id))}">${escapeHTML(n.nome)}</option>`).join('');
    if (atual) sel.value = atual;
}

window.carregarArvore = async function(nucleoId) {
    const cont = document.getElementById('macro-arvore');
    if (!cont) return;
    macroNucleoAtual = nucleoId || null;
    if (!nucleoId) {
        cont.innerHTML = '<div class="info-block-vazio">Selecione um núcleo para ver a árvore de progressão.</div>';
        return;
    }
    cont.innerHTML = '<div class="info-block-vazio"><span class="spinner"></span> A montar a árvore...</div>';
    let data;
    try {
        data = await MundoApi.buscarArvoreNucleo(cronicaId, nucleoId);
    } catch (e) {
        cont.innerHTML = '<div class="info-block-vazio">Erro ao carregar a árvore de progressão.</div>';
        return;
    }
    cont.innerHTML = montarArvoreHTML(data.nodes || [], data.links || []);
    lucide.createIcons();
};

// Algoritmo: raízes = nós que NÃO são destino de nenhum link; aninha filhos
// (origem→destino) recursivamente, com guarda de ciclo (visitados).
function montarArvoreHTML(nodes, links) {
    if (!nodes.length) {
        return '<div class="info-block-vazio">Este núcleo ainda não tem entidades. Crie uma na aba Mundo, depois desbloqueie a partir dela aqui.</div>';
    }
    const byId = new Map(nodes.map(n => [String(n.id), n]));
    const filhos = new Map();
    const ehDestino = new Set();
    links.forEach(l => {
        const o = String(l.origem_node_id), d = String(l.destino_node_id);
        if (!byId.has(o) || !byId.has(d)) return;
        if (!filhos.has(o)) filhos.set(o, []);
        filhos.get(o).push(d);
        ehDestino.add(d);
    });
    const visitados = new Set();
    const renderNo = (id) => {
        const sid = String(id);
        const n = byId.get(sid);
        if (!n || visitados.has(sid)) return ''; // guarda de ciclo
        visitados.add(sid);
        const kids = (filhos.get(sid) || []).map(renderNo).join('');
        return `<li>${techCardHTML(n)}${kids ? `<ul>${kids}</ul>` : ''}</li>`;
    };
    const raizes = nodes.filter(n => !ehDestino.has(String(n.id)));
    const topo = raizes.map(r => renderNo(r.id)).join('');
    // Defensivo: nós presos em ciclo, nunca alcançados a partir de uma raiz.
    const orfaos = nodes.filter(n => !visitados.has(String(n.id))).map(n => renderNo(n.id)).join('');
    return `<ul class="tech-tree-root">${topo}${orfaos}</ul>`;
}

function techCardHTML(n) {
    const id = escapeHTML(String(n.id));
    return `
        <div class="tech-card-wrap">
            <div class="tech-card" data-id="${id}" onclick="abrirModalSinapses(this.dataset.id)" title="Abrir conexões de ${escapeHTML(n.nome)}">
                <i data-lucide="${iconeEntidade(n.tipo)}" class="tech-card-icone"></i>
                <span class="tech-card-info">
                    <span class="tech-card-nome">${escapeHTML(n.nome)}</span>
                    <span class="tech-card-tipo">${escapeHTML(n.tipo)}</span>
                </span>
            </div>
            <button class="btn btn-outline btn-sm tech-card-add" data-pai="${id}" data-nome="${escapeHTML(n.nome)}" onclick="abrirNovoDesbloqueio(this.dataset.pai, this.dataset.nome)"><i data-lucide="plus"></i> Novo Desbloqueio</button>
        </div>`;
}

// "Novo Desbloqueio": forja uma entidade no núcleo atual e cria o link 'progressao'
// do pai para ela. Modal de instância única (padrão dos demais modais da tela).
window.abrirNovoDesbloqueio = function(paiId, paiNome) {
    fecharNovoDesbloqueio();
    desbloqueioPaiId = paiId;
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-desbloqueio';
    modal.innerHTML = `
        <div class="modal-box" style="width: 420px; max-width: 92%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                <h3 class="texto-roxo" style="margin: 0; display: flex; align-items: center; gap: 8px;"><i data-lucide="git-merge"></i> Novo Desbloqueio</h3>
                <button class="btn btn-ghost btn-sm" onclick="fecharNovoDesbloqueio()" title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <p class="contrato-tipo" style="text-align: left;">Desbloqueado por: <strong>${escapeHTML(paiNome)}</strong></p>
            <label>Nome da entidade</label>
            <input type="text" id="desbloqueio-nome" class="input-sm" style="width: 100%;" placeholder="Ex: Portão Interno" onkeydown="if (event.key === 'Enter') salvarDesbloqueio();">
            <label style="margin-top: 10px;">Tipo</label>
            <select id="desbloqueio-tipo" class="input-sm" style="width: 100%;">
                <option value="npc">NPC</option>
                <option value="protagonista">Protagonista</option>
                <option value="faccao">Facção</option>
                <option value="local">Local</option>
                <option value="cenario">Cenário Macro</option>
            </select>
            <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px;">
                <button class="btn btn-outline btn-sm" onclick="fecharNovoDesbloqueio()">Cancelar</button>
                <button class="btn btn-primary btn-sm" onclick="salvarDesbloqueio()"><i data-lucide="check"></i> Criar e ligar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharNovoDesbloqueio(); });
    lucide.createIcons();
    document.getElementById('desbloqueio-nome')?.focus();
};
window.fecharNovoDesbloqueio = function() {
    const m = document.getElementById('modal-desbloqueio');
    if (m) m.remove();
};
window.salvarDesbloqueio = async function() {
    const nome = document.getElementById('desbloqueio-nome')?.value.trim();
    const tipo = document.getElementById('desbloqueio-tipo')?.value || 'npc';
    if (!nome) return mostrarToast('Digite um nome.', 'aviso');
    if (!macroNucleoAtual || !desbloqueioPaiId) return mostrarToast('Selecione um núcleo primeiro.', 'aviso');
    try {
        // 1) forja a entidade atrelada ao núcleo atual
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes`, {
            method: 'POST', body: JSON.stringify({ nome, tipo, nucleo_id: macroNucleoAtual })
        });
        if (!res.ok) throw new Error('Falha ao criar entidade.');
        const novo = await res.json();
        // 2) liga pai → novo nó com tipo_vinculo 'progressao' (constrói a árvore)
        await MundoApi.criarLink(cronicaId, desbloqueioPaiId, novo.id, 'progressao');
        mostrarToast('Desbloqueio criado!', 'sucesso');
        fecharNovoDesbloqueio();
        await carregarArvore(macroNucleoAtual);
    } catch (e) {
        mostrarToast(e.message || 'Erro ao criar desbloqueio.', 'erro');
    }
};