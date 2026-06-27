// ==========================================
// ESTADO GLOBAL E CACHES
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const cronicaId = urlParams.get('id');

let nodesCache = [];
let eventosCache = [];
let abasCache = [];
let automacoesCache = [];
let oraculoAtivo = false; // F5: opt-in do Oráculo nesta crônica (lido do init, alternado pelo switch)
let oraculoHistorico = []; // memória multi-turn: [{role:'user'|'assistant', content}], só as últimas ~4 trocas
const ORACULO_HIST_MAX = 8; // teto local (4 trocas) — alinhado ao Zod/Python (defesa em profundidade)
let sessoesCache = [];
let nucleosCache = { entidade: [], evento: [], sessao: [] };
let nucleoAtivoTipo = 'entidade'; // 'entidade' | 'evento' | 'sessao'
// Diplomacia (Fase 14): relações núcleo↔núcleo. Fonte da verdade no Mundo; o Tabuleiro
// só reflete (auto-draw em desenharLinhasBoard). [{ id, nucleoA, nucleoB, status }]
let diplomaciaCache = [];
// Eventos no tabuleiro (Fase 15 — Revelação Sob Demanda): cache (carregado em carregarMesaGuerra)
// e invocações ativas via crachá. Ambos EFÊMEROS/read-only (fora do boardState).
let boardEventosCache = [];   // [{ id, nome, descricao, gatilhos:[{node_id,...}], ... }]
let eventosInvocados = {};    // { eventoId: {x, y} } — painéis flutuantes abertos no momento
const STATUS_DIP = { aliado: 'Aliados', inimigo: 'Inimigos', neutro: 'Neutros' };
const DIP_LIMITE = 5;             // "Ver mais": relações visíveis antes de expandir (evita a lista crescer demais)
let diplomaciaVerTudo = false;
let diplomaciaUltimoFoco = null;  // detecta troca de facção p/ recolher a lista de volta

// Visualização atual da aba Mundo + cache da lista já filtrada (Toggle re-renderiza
// sem refetch — troca é só de apresentação). Fase 17: 'kanban' deu lugar a 'cena'.
let mundoCurrentView = 'grid'; // 'grid' | 'cena'
let mundoListaAtual = [];

// Direção de Cena (Fase 17): layout efêmero em memória (persiste só no "Salvar Cena").
// cenaState.atores[nodeId] = colunaId → ator no palco; ausente → no Elenco (sidebar).
let cenaState = { colunas: [], atores: {} };
let cenaAtualId = null;
let cenaNomeAtual = '';

// Interatividade Passiva (Fase 15.4): dicionário reverse-lookup Marco→Eventos, em
// memória, p/ latência zero no tooltip de hover. Chave: `${node_id}_${flag_key}`.
let mapaDependenciasMarcos = {};

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
        inicializarViewToggle();
        await carregarNucleos('entidade');
        await carregarNucleos('evento');
        await carregarNucleos('sessao');
        await Promise.all([
            carregarMundo(),
            carregarEventos(),
            carregarSessoes()
        ]);
        construirMapaDependencias(); // silencioso: prepara o reverse-lookup do hover
        
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

        // F5: reflete o opt-in do Oráculo (vem de graça no SELECT * da crônica) no switch da aba.
        oraculoAtivo = !!dados.cronica?.oraculo_ativo;
        refletirEstadoOraculo();
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
    if (tab === 'mundo') { carregarMundo(document.getElementById('filtro-nucleo-entidade')?.value); construirMapaDependencias(); }
    else if (tab === 'eventos') {
        carregarNucleos('evento'); 
        carregarEventos(document.getElementById('filtro-nucleo-evento')?.value);
    } 
    else if (tab === 'automacoes') carregarAutomacoes();
    else if (tab === 'sessoes') {
        carregarSessoes();
        carregarNucleos('sessao');
    }
    else if (tab === 'macro') carregarMesaGuerra();
    else if (tab === 'oraculo') document.getElementById('oraculo-pergunta')?.focus();
}

// ======================================================
// ABA ORÁCULO (RAG — F5): consulta em linguagem natural
// A resposta da IA é texto NÃO-confiável → renderMarkdownSeguro (escapa TUDO antes, Regra 6.1) p/
// exibir a marcação (negrito/listas/títulos) sem abrir vetor de XSS.
// ======================================================
window.consultarOraculo = async function(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('oraculo-pergunta');
    const pergunta = (input.value || '').trim();
    if (!pergunta) return false;

    const conversa = document.getElementById('oraculo-conversa');
    const btn = document.getElementById('oraculo-enviar');

    // Tira o placeholder vazio na primeira pergunta.
    conversa.querySelector('.oraculo-vazio')?.remove();

    // Bolha do Narrador (pergunta escapada — XSS, Regra 6.1).
    conversa.insertAdjacentHTML('beforeend', `<div class="oraculo-msg oraculo-msg-narrador">${escapeHTML(pergunta)}</div>`);
    input.value = '';

    // Bolha temporária "a pensar".
    const idPensando = `oraculo-pensando-${Date.now()}`;
    conversa.insertAdjacentHTML('beforeend',
        `<div id="${idPensando}" class="oraculo-msg oraculo-msg-resposta oraculo-pensando">O Oráculo vira as cartas…</div>`);
    conversa.scrollTop = conversa.scrollHeight;
    btn.disabled = true;

    try {
        // Envia as trocas anteriores (sem a pergunta atual) p/ a memória multi-turn.
        const dados = await OraculoApi.consultar(cronicaId, pergunta, oraculoHistorico);
        const resp = dados.resposta_oraculo || 'O Oráculo silenciou.';
        // trechos_usados é inteiro vindo do backend; resp é markdown da IA (renderizado com escape-first).
        const meta = dados.trechos_usados
            ? `<span class="oraculo-msg-meta">Baseado em ${dados.trechos_usados} trecho(s) da crônica.</span>` : '';
        document.getElementById(idPensando).outerHTML =
            `<div class="oraculo-msg oraculo-msg-resposta">${renderMarkdownSeguro(resp)}${meta}</div>`;
        // Memória: empilha a troca e mantém só as últimas ORACULO_HIST_MAX mensagens.
        oraculoHistorico.push({ role: 'user', content: pergunta }, { role: 'assistant', content: resp });
        if (oraculoHistorico.length > ORACULO_HIST_MAX) {
            oraculoHistorico = oraculoHistorico.slice(-ORACULO_HIST_MAX);
        }
    } catch (e) {
        document.getElementById(idPensando)?.remove();
        mostrarToast(e.message || 'Erro ao consultar o Oráculo.', 'erro');
    } finally {
        btn.disabled = false;
        conversa.scrollTop = conversa.scrollHeight;
    }
    return false;
};

// Reflete o estado opt-in no switch + esmaece/bloqueia o chat quando desligado (critério de ouro:
// o Oráculo é opcional; desligado, a consulta nem fica acessível na UI).
function refletirEstadoOraculo() {
    const chk = document.getElementById('oraculo-toggle');
    const txt = document.getElementById('oraculo-toggle-txt');
    const input = document.getElementById('oraculo-pergunta');
    const btn = document.getElementById('oraculo-enviar');
    if (chk) chk.checked = oraculoAtivo;
    if (txt) txt.textContent = oraculoAtivo ? 'Ligado' : 'Desligado';
    document.querySelector('.oraculo-switch')?.classList.toggle('oraculo-switch--on', oraculoAtivo);
    document.querySelector('.oraculo-painel')?.classList.toggle('oraculo-painel--off', !oraculoAtivo);
    if (input) input.disabled = !oraculoAtivo;
    if (btn) btn.disabled = !oraculoAtivo;
}

// Liga/desliga o Oráculo (PUT /cronicas/:id/oraculo). Otimista com reversão em falha (Regra 3.2).
window.alternarOraculo = async function(el) {
    const novo = el.checked;
    el.disabled = true;
    try {
        const dados = await OraculoApi.toggle(cronicaId, novo);
        oraculoAtivo = !!dados.oraculo_ativo;
        mostrarToast(dados.mensagem || (oraculoAtivo ? 'Oráculo ligado.' : 'Oráculo desligado.'), 'sucesso');
    } catch (e) {
        el.checked = !novo; // reverte o switch — o estado de domínio não mudou
        mostrarToast(e.message || 'Falha ao alternar o Oráculo.', 'erro');
    } finally {
        el.disabled = false;
        refletirEstadoOraculo(); // reabilita/bloqueia o chat conforme o estado real
    }
};

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
        <div class="nucleo-linha">
            <span class="nucleo-ident">
                ${n.avatar_url ? `<img class="nucleo-brasao" src="${escapeHTML(n.avatar_url)}" alt="" draggable="false" onerror="this.remove()">` : ''}
                <span id="nucleo-nome-${n.id}">${escapeHTML(n.nome)}</span>
            </span>
            <div class="card-topo-acoes">
                ${tipo === 'entidade' ? `<button class="btn btn-secondary btn-sm" onclick="definirBrasaoNucleo('${n.id}')" title="Definir brasão"><i data-lucide="image"></i></button>` : ''}
                ${tipo === 'entidade' && n.avatar_url ? `<button class="btn btn-secondary btn-sm" onclick="removerBrasaoNucleo('${n.id}')" title="Remover brasão"><i data-lucide="image-off"></i></button>` : ''}
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
        renderizarMundo(dados);
    } catch (err) { console.error(err); }
}

// Dispatcher de visualização: a troca NÃO refaz fetch — opera sobre a mesma lista já
// em memória. Fase 17: 'cena' (Direção de Cena) substitui o antigo Kanban.
function renderizarMundo(lista) {
    if (lista) mundoListaAtual = lista; // guarda p/ re-render no Toggle
    const container = document.getElementById('mundo-view-container');
    if (container) container.classList.toggle('view-cena', mundoCurrentView === 'cena');
    if (mundoCurrentView === 'cena') {
        renderizarCena(mundoListaAtual);
    } else {
        document.getElementById('cena-painel')?.remove(); // não deixa o painel pendurado
        renderizarGridMundo(mundoListaAtual);
    }
}

// Markup de um card de entidade da Grelha (não-arrastável; o Elenco da Cena usa cards
// minimalistas próprios). data-node-id mantido para edição/kebab.
function cardMundoHTML(node) {
    return `
        <div class="card world-card" data-node-id="${escapeHTML(String(node.id))}">
            <div class="world-card__head">
                ${cardIdentHTML(node)}
                <div class="world-card__acoes">
                    <button class="btn btn-secondary btn-sm" data-id="${node.id}" onclick="abrirModalSinapses(this.dataset.id)" title="Conexões (Sinapses)"><i data-lucide="share-2"></i></button>
                    <i data-lucide="more-vertical" class="kebab-trigger cursor-pointer" title="Mais ações" onclick="abrirMenuKebab(event, '${node.id}')"></i>
                </div>
            </div>

            <div class="card-acoes-inline">
                <button class="btn btn-ghost btn-sm" onclick="iniciarEdicaoNome('${node.id}')"><i data-lucide="edit"></i> Editar</button>
                <button class="btn btn-ghost btn-sm" onclick="definirAvatarEntidade('${node.id}')"><i data-lucide="image"></i> Foto</button>
                ${node.avatar_url ? `<button class="btn btn-ghost btn-sm" onclick="removerAvatarEntidade('${node.id}')"><i data-lucide="image-off"></i> Tirar Foto</button>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="moverNodeNucleo('${node.id}')"><i data-lucide="map-pin"></i> Mudar Núcleo</button>
                <button class="btn btn-ghost btn-sm btn-del" onclick="confirmarDeletarEntidade(this, '${node.id}')"><i data-lucide="trash"></i> Deletar</button>
            </div>

            <div class="world-card__marcos-label">Marcos</div>
            <div id="flags-${node.id}" class="world-card__marcos">
                ${(node.flags || []).filter(f => f.key).map(f => marcoItemHTML(node.id, f)).join('')}
                <input type="text" class="input-inline-marco" maxlength="60" placeholder="+ Novo Marco (Enter)" onkeydown="adicionarMarcoInline(event, '${node.id}')">
            </div>

            ${cardRodapeNucleoHTML(node)}
        </div>
    `;
}

// Um item de Marco (extraído p/ reuso no card E no add inline otimista — DRY).
// Nome editável por duplo-clique (inline); apagar via × que só aparece no hover (Regra 7.2).
function marcoItemHTML(nodeId, f) {
    const k = escapeHTML(f.key);
    // Affordance (Pill) + gatilhos de HOVER só nos marcos QUE têm eventos atrelados —
    // evita disparar o tooltip (e timers) em marcos sem dependência mecânica.
    const temEventos = (mapaDependenciasMarcos[chaveMarco(nodeId, f.key)] || []).length > 0;
    const classeEventos = temEventos ? ' marco-has-events' : '';
    const hover = temEventos
        ? ` onmouseenter="mostrarTooltipMarco(event, '${nodeId}', '${k}')" onmouseleave="agendarFechoTooltip()"`
        : '';
    return `
        <div class="marco-item" data-flag-key="${k}">
            <input type="checkbox" class="marco-item__check" ${f.value ? 'checked' : ''} data-node-id="${nodeId}" data-flag-key="${k}" onchange="toggleFlag(this.dataset.nodeId, this.dataset.flagKey, this.checked)">
            <span class="marco-item__nome${classeEventos}"${hover} ondblclick="iniciarEdicaoMarco(event, '${nodeId}', '${k}')">${escapeHTML(humanizarMarco(f.key))}</span>
            <i data-lucide="x" class="btn-del-marco" title="Apagar marco" onclick="confirmarDeletarMarco(this, '${nodeId}', '${k}')"></i>
        </div>`;
}

// Lente GRELHA (renderizador clássico): galeria plana de todas as entidades filtradas.
function renderizarGridMundo(lista) {
    const grid = document.getElementById('grid-mundo');
    if (!grid) return;
    if (!lista.length) {
        grid.innerHTML = '<div class="info-block-vazio col-full">Nenhuma entidade encontrada.</div>';
        lucide.createIcons();
        return;
    }
    grid.innerHTML = lista.map(cardMundoHTML).join('');
    lucide.createIcons();
}

// ══════════════════════════════════════════════════════════════════════════
// DIREÇÃO DE CENA (FASE 17) — Elenco (sidebar) + Palco (colunas dinâmicas).
// Layout efêmero em world_cenas; mover um ator NÃO altera o nucleo_id do nó (Salvar
// manual, Regra 2.7). [Fatia 3: estrutura + render + CRUD de cena. DnD → fatia 5.]
// ══════════════════════════════════════════════════════════════════════════
function cenaSkeletonHTML() {
    return `
        <div class="cena-toolbar">
            <select id="cena-salva-select" onchange="abrirCena(this.value)"><option value="">— Selecione uma cena —</option></select>
            <button class="btn btn-primary btn-sm" onclick="novaCena()"><i data-lucide="plus"></i> Nova</button>
            <button class="btn btn-primary btn-sm" onclick="salvarCena()"><i data-lucide="save"></i> Salvar Cena</button>
            <button class="btn btn-secondary btn-sm" onclick="adicionarColunaCena()"><i data-lucide="plus-square"></i> Nova Coluna</button>
            <button class="btn btn-danger btn-sm" onclick="deletarCenaAtual()" title="Excluir cena"><i data-lucide="trash-2"></i></button>
        </div>
        <div class="cena-corpo">
            <aside class="cena-elenco" id="cena-elenco">
                <select id="elenco-nucleo-select" onchange="filtrarElenco()"><option value="">Todos os núcleos</option></select>
                <input type="text" id="elenco-busca" placeholder="Filtrar ator..." oninput="filtrarElenco()">
                <div class="elenco-lista" id="elenco-lista"></div>
            </aside>
            <div class="cena-palco" id="cena-palco"></div>
        </div>`;
}

function renderizarCena() {
    const container = document.getElementById('mundo-view-container');
    if (!container) return;
    let painel = document.getElementById('cena-painel');
    if (!painel) {
        painel = document.createElement('div');
        painel.id = 'cena-painel';
        painel.className = 'cena-painel';
        painel.innerHTML = cenaSkeletonHTML();
        container.appendChild(painel);
        popularNucleoSelectElenco();
        carregarListaCenas();
        bindCenaDnD(painel); // motor de Drag & Drop (uma vez; sobrevive aos re-renders)
        lucide.createIcons();
    }
    renderElenco();
    renderPalco();
}

function popularNucleoSelectElenco() {
    const sel = document.getElementById('elenco-nucleo-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">Todos os núcleos</option>'
        + nucleosCache.entidade.map(n => `<option value="${escapeHTML(String(n.id))}">${escapeHTML(n.nome)}</option>`).join('');
}

// O Elenco lista os atores (NPCs) filtrados por núcleo + busca. Quem está no palco vira
// "fantasma" (inerte, salvo o X de remover de cena).
window.filtrarElenco = function() { renderElenco(); };
function renderElenco() {
    const cont = document.getElementById('elenco-lista');
    if (!cont) return;
    const nucleo = document.getElementById('elenco-nucleo-select')?.value || '';
    const busca = (document.getElementById('elenco-busca')?.value || '').trim().toLowerCase();
    let atores = nodesCache;
    if (nucleo) atores = atores.filter(n => String(n.nucleo_id) === String(nucleo));
    if (busca) atores = atores.filter(n => n.nome.toLowerCase().includes(busca));
    if (!atores.length) { cont.innerHTML = '<div class="info-block-vazio">Nenhum ator.</div>'; return; }
    const colIds = new Set(cenaState.colunas.map(c => String(c.id)));
    cont.innerHTML = atores.map(n => {
        // Fantasma só se o ator estiver mapeado a uma coluna QUE AINDA EXISTE (resiliência).
        const noPalco = colIds.has(String(cenaState.atores[String(n.id)]));
        const id = escapeHTML(String(n.id));
        const x = noPalco ? `<i data-lucide="x" class="ator-remover" title="Remover de cena" onclick="removerAtorDaCena('${id}')"></i>` : '';
        return `<div class="ator-card${noPalco ? ' ator-fantasma' : ''}" draggable="${noPalco ? 'false' : 'true'}" data-node-id="${id}" data-origem="elenco">
            <i data-lucide="${iconeEntidade(n.tipo)}" class="ator-card__icone" title="Expandir detalhes" onclick="toggleExpandirAtor(event, '${id}')"></i>
            <span class="ator-card__nome" title="Expandir detalhes" onclick="toggleExpandirAtor(event, '${id}')">${escapeHTML(n.nome)}</span>
            ${x}
        </div>`;
    }).join('');
    lucide.createIcons();
}

// O Palco renderiza as colunas de cenaState.colunas; cada ator cai na sua coluna
// (cenaState.atores[nodeId]). Cards de ator que apontam p/ nós inexistentes são ignorados.
function renderPalco() {
    const palco = document.getElementById('cena-palco');
    if (!palco) return;
    if (!cenaState.colunas.length) {
        palco.innerHTML = '<div class="info-block-vazio">Sem colunas. Use “+ Nova Coluna”.</div>';
        return;
    }
    palco.innerHTML = cenaState.colunas.map(col => {
        const cid = escapeHTML(String(col.id));
        const atoresCol = Object.keys(cenaState.atores)
            .filter(nodeId => String(cenaState.atores[nodeId]) === String(col.id))
            .map(nodeId => nodesCache.find(n => String(n.id) === String(nodeId)))
            .filter(Boolean);
        const cards = atoresCol.length
            ? atoresCol.map(n => { const aid = escapeHTML(String(n.id)); return `<div class="ator-card" draggable="true" data-node-id="${aid}" data-origem="palco">
                    <i data-lucide="${iconeEntidade(n.tipo)}" class="ator-card__icone" title="Expandir detalhes" onclick="toggleExpandirAtor(event, '${aid}')"></i>
                    <span class="ator-card__nome" title="Expandir detalhes" onclick="toggleExpandirAtor(event, '${aid}')">${escapeHTML(n.nome)}</span>
                </div>`; }).join('')
            : '<div class="info-block-vazio">Vazio.</div>';
        return `<div class="cena-coluna" data-col-id="${cid}">
            <div class="cena-coluna__header">
                <span class="cena-coluna__nome" title="Duplo-clique renomeia" ondblclick="renomearColunaCena('${cid}')">${escapeHTML(col.nome)}</span>
                <i data-lucide="trash-2" class="cena-coluna__del" title="Excluir coluna" onclick="deletarColunaCena('${cid}')"></i>
            </div>
            <div class="cena-coluna__cards" data-col-id="${cid}">${cards}</div>
        </div>`;
    }).join('');
    lucide.createIcons();
}

// Expansão In-place (accordion) do ator — Fase 17.9. Substitui o modal abrirCardCompleto:
// clicar no nome/ícone expande o próprio card com os Marcos, sem tirar o Narrador do fluxo.
// Renderização Just-in-Time (Fase 17.9.1): a cada expansão o .ator-detalhes é RECONSTRUÍDO
// a partir do nó fresco do nodesCache → nunca mostra dado obsoleto (resolve o stale-data).
// Marcos reusam marcoItemHTML (DRY, Regra 3); handlers são DOM-relativos → sem id global que
// colida com a Grelha. Mover ator entre colunas continua só por arrasto (DnD nativo).
window.toggleExpandirAtor = function(e, nodeId) {
    const card = e.target.closest('.ator-card');
    if (!card) return;
    // toggle() devolve true se a classe foi ADICIONADA (expandindo).
    const abrindo = card.classList.toggle('ator-card--expandido');
    if (!abrindo) return; // fechando: o CSS oculta; não mexe nos dados
    const node = nodesCache.find(n => String(n.id) === String(nodeId));
    if (!node) return;
    let det = card.querySelector('.ator-detalhes');
    if (!det) { det = document.createElement('div'); det.className = 'ator-detalhes'; card.appendChild(det); }
    const id = escapeHTML(String(node.id));
    const marcos = (node.flags || []).filter(f => f.key).map(f => marcoItemHTML(node.id, f)).join('');
    det.innerHTML = `
        <div class="world-card__marcos-label">Marcos</div>
        <div class="world-card__marcos">
            ${marcos}
            <input type="text" class="input-inline-marco" maxlength="60" placeholder="+ Novo Marco (Enter)" onkeydown="adicionarMarcoInline(event, '${id}')">
        </div>`;
    lucide.createIcons({ elements: det.querySelectorAll('[data-lucide]') });
};

// ── CRUD de Cenas (toolbar superior) ────────────────────────
async function carregarListaCenas() {
    const sel = document.getElementById('cena-salva-select');
    if (!sel) return;
    let lista = [];
    try { lista = await MundoApi.listarCenas(cronicaId); }
    catch (e) { mostrarToast('Erro ao listar cenas.', 'erro'); return; }
    sel.innerHTML = '<option value="">— Selecione uma cena —</option>'
        + lista.map(c => `<option value="${escapeHTML(String(c.id))}">${escapeHTML(c.nome)}</option>`).join('');
    sel.value = cenaAtualId || '';
}

window.novaCena = async function() {
    const nome = (prompt('Nome da nova cena:') || '').trim();
    if (!nome) return;
    try {
        const c = await MundoApi.criarCena(cronicaId, nome);
        mostrarToast('Cena criada!', 'sucesso');
        await carregarListaCenas();
        await abrirCena(c.id);
    } catch (e) { mostrarToast(e.message || 'Erro ao criar cena.', 'erro'); }
};

window.abrirCena = async function(cenaId) {
    cenaAtualId = cenaId || null;
    if (!cenaId) { cenaState = { colunas: [], atores: {} }; cenaNomeAtual = ''; renderElenco(); renderPalco(); return; }
    let resp;
    try { resp = await MundoApi.buscarCena(cronicaId, cenaId); }
    catch (e) { mostrarToast(e.message || 'Erro ao carregar a cena.', 'erro'); return; }
    cenaNomeAtual = resp.nome || '';
    const d = resp.dados || {};
    cenaState = {
        colunas: Array.isArray(d.colunas) ? d.colunas : [],
        atores: (d.atores && typeof d.atores === 'object') ? d.atores : {}
    };
    const sel = document.getElementById('cena-salva-select'); if (sel) sel.value = cenaAtualId;
    renderElenco();
    renderPalco();
};

window.salvarCena = async function() {
    if (!cenaAtualId) return mostrarToast('Selecione ou crie uma cena primeiro.', 'aviso');
    try {
        await MundoApi.atualizarCena(cronicaId, cenaAtualId, { dados: cenaState });
        mostrarToast('Cena salva.', 'sucesso');
    } catch (e) { mostrarToast(e.message || 'Erro ao salvar a cena.', 'erro'); }
};

window.deletarCenaAtual = async function() {
    if (!cenaAtualId) return mostrarToast('Nenhuma cena aberta.', 'aviso');
    if (!confirm(`Excluir a cena "${cenaNomeAtual}"? Esta ação é permanente.`)) return;
    try {
        await MundoApi.deletarCena(cronicaId, cenaAtualId);
        mostrarToast('Cena removida.', 'sucesso');
        cenaAtualId = null; cenaNomeAtual = ''; cenaState = { colunas: [], atores: {} };
        await carregarListaCenas();
        renderElenco(); renderPalco();
    } catch (e) { mostrarToast(e.message || 'Erro ao remover a cena.', 'erro'); }
};

// Remove um ator do palco (apaga do mapa atores) — devolve-o ao Elenco. Não toca no banco
// até "Salvar Cena". Os NPCs nunca são deletados daqui.
window.removerAtorDaCena = function(nodeId) {
    delete cenaState.atores[String(nodeId)];
    renderElenco();
    renderPalco();
};

// ── Colunas dinâmicas do Palco (memória; persiste só no "Salvar Cena") ──
function novoIdColuna() { return 'col' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

window.adicionarColunaCena = function() {
    if (!cenaAtualId) return mostrarToast('Abra ou crie uma cena primeiro.', 'aviso');
    const nome = (prompt('Nome da nova coluna:') || '').trim();
    if (!nome) return;
    cenaState.colunas.push({ id: novoIdColuna(), nome: nome.slice(0, 120) });
    renderPalco();
};

window.renomearColunaCena = function(colId) {
    const col = cenaState.colunas.find(c => String(c.id) === String(colId));
    if (!col) return;
    const raw = prompt('Nome da coluna:', col.nome || '');
    if (raw === null) return;
    col.nome = raw.trim().slice(0, 120);
    renderPalco();
};

// Deleta a coluna e DEVOLVE os atores dela ao Elenco (apaga só o mapeamento; o NPC
// permanece no banco, intocado).
window.deletarColunaCena = function(colId) {
    const col = cenaState.colunas.find(c => String(c.id) === String(colId));
    if (!col) return;
    if (!confirm(`Excluir a coluna "${col.nome}"? Os atores voltam ao Elenco.`)) return;
    cenaState.colunas = cenaState.colunas.filter(c => String(c.id) !== String(colId));
    for (const nodeId of Object.keys(cenaState.atores)) {
        if (String(cenaState.atores[nodeId]) === String(colId)) delete cenaState.atores[nodeId];
    }
    renderElenco();
    renderPalco();
};

// ── MOTOR DRAG & DROP NATIVO (FASE 17 — fatia 4) ────────────────────────────
// API HTML5 pura (Regra 7.1), por delegação no painel (sobrevive aos re-renders).
// Drop atualiza SÓ a RAM (cenaState.atores) + re-render completo; persiste no Salvar.
// Escopo isolado do DnD da Mesa (Pointer Events) — sem conflito.
function bindCenaDnD(painel) {
    if (painel.dataset.dndBound === '1') return;
    painel.dataset.dndBound = '1';
    painel.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.ator-card[draggable="true"]');
        if (!card) return;
        e.dataTransfer.setData('text/plain', card.dataset.nodeId);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
    });
    painel.addEventListener('dragend', (e) => {
        e.target.closest('.ator-card')?.classList.remove('dragging');
        limparCenaDragOver(painel);
    });
    painel.addEventListener('dragover', (e) => {
        const alvo = e.target.closest('.cena-coluna, .cena-elenco');
        if (!alvo) return;
        e.preventDefault(); // habilita o drop
        e.dataTransfer.dropEffect = 'move';
        limparCenaDragOver(painel);
        alvo.classList.add('drag-over');
    });
    painel.addEventListener('dragleave', (e) => {
        if (!painel.contains(e.relatedTarget)) limparCenaDragOver(painel);
    });
    painel.addEventListener('drop', handleCenaDrop);
}
function limparCenaDragOver(painel) {
    painel.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}
function handleCenaDrop(e) {
    const painel = document.getElementById('cena-painel');
    const alvo = e.target.closest('.cena-coluna, .cena-elenco');
    if (!alvo) return;            // drop fora de zona válida → ignora
    e.preventDefault();
    limparCenaDragOver(painel);
    const nodeId = e.dataTransfer.getData('text/plain');
    if (!nodeId) return;

    if (alvo.classList.contains('cena-coluna')) {
        const destId = alvo.dataset.colId;
        if (!destId) return;
        if (String(cenaState.atores[String(nodeId)]) === String(destId)) return; // mesma coluna → no-op
        cenaState.atores[String(nodeId)] = destId; // SÓ RAM (Regra 2.7 — persiste no Salvar)
    } else {
        // drop no Elenco → tira de cena (devolve ao elenco), sem tocar no NPC do banco.
        if (cenaState.atores[String(nodeId)] === undefined) return;
        delete cenaState.atores[String(nodeId)];
    }
    renderElenco();   // re-render completo rápido do painel da Cena
    renderPalco();
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

// ── MENU KEBAB (Divulgação Progressiva — Regra 7.2) ─────────────────────────
// Kebab INLINE (pivô do GD): nada de menu flutuante. Apenas faz toggle da .card-acoes-inline
// DENTRO do card clicado, empurrando o conteúdo para baixo. Imune a zoom/scroll por construção.
window.abrirMenuKebab = function(e, nodeId) {
    e.stopPropagation();
    const card = e.target.closest('.world-card, .ator-card');
    const acoes = card?.querySelector('.card-acoes-inline');
    if (!acoes) return;
    const aberto = acoes.style.display === 'flex';
    // Fecha qualquer outro menu inline aberto (um de cada vez).
    document.querySelectorAll('.card-acoes-inline').forEach(el => { if (el !== acoes) el.style.display = 'none'; });
    acoes.style.display = aberto ? 'none' : 'flex';
};

// Deletar entidade em 2 passos no menu inline (sem confirm() nativo).
window.confirmarDeletarEntidade = function(item, nodeId) {
    if (item.dataset.armado === '1') { executarDeletarEntidade(nodeId); return; }
    item.dataset.armado = '1';
    item.innerHTML = '<i data-lucide="alert-triangle"></i> Confirmar exclusão?';
    lucide.createIcons();
    setTimeout(() => {
        if (item.isConnected && item.dataset.armado === '1') {
            item.dataset.armado = '0';
            item.innerHTML = '<i data-lucide="trash"></i> Deletar';
            lucide.createIcons();
        }
    }, 3000);
};
async function executarDeletarEntidade(nodeId) {
    const card = document.querySelector(`.world-card[data-node-id="${cssEscape(nodeId)}"]`);
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, { method: 'DELETE' });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.erro); }
        // Optimistic: remove do DOM (Grelha) + cache, sem recarregar a lista inteira.
        card?.remove();
        nodesCache = nodesCache.filter(n => String(n.id) !== String(nodeId));
        mostrarToast('Entidade deletada.', 'sucesso');
    } catch (err) { mostrarToast(err.message || 'Erro ao deletar entidade.', 'erro'); }
}

// Renomear a entidade inline no próprio título do card (Enter salva, Esc cancela).
// ── AVATAR / BRASÃO (Fase 15 — Atualização Imersiva, Fatia 2b) ──────────────
// Uploader reutilizável: abre o seletor, envia p/ /midia/upload/<pasta> (Sharp→WebP, nomes
// hash) e devolve a url (ou null). Pastas DEDICADAS: 'entidades' (foto) e 'nucleos' (brasão).
function selecionarEEnviarImagem(pasta) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp';
        input.onchange = async () => {
            const arquivo = input.files && input.files[0];
            if (!arquivo) return resolve(null);
            const fd = new FormData(); fd.append('imagens', arquivo);
            try {
                const res = await API.fetch(`/midia/upload/${pasta}`, { method: 'POST', body: fd });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || !data.urls || !data.urls[0]) throw new Error(data.erro || 'Falha no upload.');
                resolve(data.urls[0]);
            } catch (e) { mostrarToast(e.message || 'Erro ao enviar imagem.', 'erro'); resolve(null); }
        };
        input.click();
    });
}
// Foto da entidade (upload → PUT {nome, avatar_url}); o backend faz MERGE no jsonb (2a).
window.definirAvatarEntidade = async function(nodeId) {
    const node = nodesCache.find(n => String(n.id) === String(nodeId));
    if (!node) return;
    const url = await selecionarEEnviarImagem('entidades');
    if (!url) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify({ nome: node.nome, avatar_url: url }) });
        if (!res.ok) throw new Error();
        node.avatar_url = url; renderizarMundo(); mostrarToast('Foto atualizada!', 'sucesso');
    } catch { mostrarToast('Erro ao salvar a foto.', 'erro'); }
};
window.removerAvatarEntidade = async function(nodeId) {
    const node = nodesCache.find(n => String(n.id) === String(nodeId));
    if (!node || !node.avatar_url) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify({ nome: node.nome, avatar_url: null }) });
        if (!res.ok) throw new Error();
        node.avatar_url = null; renderizarMundo(); mostrarToast('Foto removida.', 'aviso');
    } catch { mostrarToast('Erro ao remover a foto.', 'erro'); }
};
// Brasão do núcleo (só tipo 'entidade'; PUT {nome, avatar_url} → coluna avatar_url, 2a).
window.definirBrasaoNucleo = async function(id) {
    const nucleo = nucleosCache.entidade.find(n => String(n.id) === String(id));
    if (!nucleo) return;
    const url = await selecionarEEnviarImagem('nucleos');
    if (!url) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/entidade-nucleos/${id}`, { method: 'PUT', body: JSON.stringify({ nome: nucleo.nome, avatar_url: url }) });
        if (!res.ok) throw new Error();
        await carregarNucleos('entidade'); mostrarToast('Brasão atualizado!', 'sucesso');
    } catch { mostrarToast('Erro ao salvar o brasão.', 'erro'); }
};
window.removerBrasaoNucleo = async function(id) {
    const nucleo = nucleosCache.entidade.find(n => String(n.id) === String(id));
    if (!nucleo || !nucleo.avatar_url) return;
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/entidade-nucleos/${id}`, { method: 'PUT', body: JSON.stringify({ nome: nucleo.nome, avatar_url: null }) });
        if (!res.ok) throw new Error();
        await carregarNucleos('entidade'); mostrarToast('Brasão removido.', 'aviso');
    } catch { mostrarToast('Erro ao remover o brasão.', 'erro'); }
};

window.iniciarEdicaoNome = function(nodeId) {
    edicaoInlineTexto(document.getElementById('node-nome-' + nodeId), {
        aoSalvar: async (novo, atual, alvo) => {
            alvo.textContent = novo; // optimistic
            const node = nodesCache.find(n => String(n.id) === String(nodeId));
            if (node) node.nome = novo;
            try {
                const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, { method: 'PUT', body: JSON.stringify({ nome: novo }) });
                if (!res.ok) throw new Error();
            } catch {
                alvo.textContent = atual;
                if (node) node.nome = atual;
                mostrarToast('Erro ao renomear. Revertido.', 'erro');
            }
        }
    });
};

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
        <div class="modal-box modal-sinapses-box">
            <div class="modal-head">
                <h3 class="texto-roxo modal-titulo"><i data-lucide="share-2"></i> Conexões — ${escapeHTML(nomeNo)}</h3>
                <div class="modal-head-botoes">
                    <button class="btn btn-secondary btn-sm" data-id="${escapeHTML(String(nodeId))}" onclick="abrirMapaSinapses(this.dataset.id)" title="Ver Mapa de Sinapses"><i data-lucide="network"></i> Mapa</button>
                    <button class="btn btn-ghost btn-sm" onclick="fecharModalSinapses()" title="Fechar"><i data-lucide="x"></i></button>
                </div>
            </div>

            <div id="sinapses-lista" class="sinapse-lista">
                <div class="info-block-vazio"><span class="spinner"></span> A carregar conexões...</div>
            </div>

            <div class="sinapse-form">
                <div class="sinapse-col-ent">
                    <label class="campo-label">Entidade</label>
                    <select id="sinapse-destino" class="input-sm input-full"></select>
                </div>
                <div class="sinapse-col-tipo">
                    <label class="campo-label">Tipo</label>
                    <select id="sinapse-tipo" class="input-sm input-full">
                        <option value="associado">Associado</option>
                        <option value="aliado">Aliado</option>
                        <option value="inimigo">Inimigo</option>
                        <option value="localizacao">Localização</option>
                    </select>
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
        cont.innerHTML = '<div class="info-block-vazio">Erro ao carregar conexões.</div>';
        return;
    }

    // Estado p/ o Contrato de Relação localizar o link e o nó central.
    nodeAtualSinapse = nodeId;
    sinapsesAtuais = links;

    if (!links.length) {
        cont.innerHTML = '<div class="info-block-vazio">Nenhuma conexão ainda.</div>';
    } else {
        cont.innerHTML = links.map(l => {
            // Reta de Relação: posição derivada das tags assinadas (RelacaoEscala, fonte única).
            const { posicao, tier, tags } = RelacaoEscala.lerRelacao(l.dados || {}, l.tipo_vinculo);
            const extremo = tier.nivel === 'extremo';
            const sinalNum = `${posicao > 0 ? '+' : ''}${posicao}`;
            const reta = tags.length
                ? `<span class="reta-badge reta-pos--${tier.lado}" data-link="${escapeHTML(String(l.id))}" onclick="abrirContratoRelacao(this.dataset.link)" title="${tier.nivel === 'neutro' ? 'Neutro' : escapeHTML(tier.rotulo)} (${sinalNum} de 10)">${barraRetaHTML(posicao, true)}<span class="reta-badge-num">${sinalNum}</span></span>`
                : '';
            return `
            <span class="badge-link ${classeTipoLink(l.tipo_vinculo)}${extremo ? ' link-extremo' : ''}">
                <span class="badge-link-nome" data-id="${escapeHTML(String(l.node_conectado_id))}" onclick="navegarSinapse(this.dataset.id)" title="Abrir entidade conectada">${escapeHTML(l.tipo_vinculo)}: ${escapeHTML(l.node_conectado_nome)}</span>
                ${reta}
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
    try {
        // Criação rápida: nó + tipo. As tags assinadas (que movem a Reta de Relação) são
        // adicionadas depois, pelo Contrato de Relação ao clicar no badge.
        await MundoApi.criarLink(cronicaId, nodeId, destino, tipo, { tags: [] });
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

// ── RETA DE RELAÇÃO (reta_relacao.md): TAGS ASSINADAS + RETA BIPOLAR -10..+10 ──
// Estado local do Contrato aberto (fonte da verdade enquanto o modal vive). As tags são objetos
// {texto, sinal}; o tipo_vinculo guia a inferência de tags LEGADAS (string) na abertura (decisão 5).
let contratoLinkId = null;
let contratoTags = [];
let contratoTipoVinculo = 'associado';

// Barra DIVERGENTE: preenche do centro (0) até a posição. Direita (+) = aliado, esquerda (−) = inimigo.
// left/width são data-driven (Regra 2.5 permite inline p/ layout dinâmico); a COR vem de classe/token.
function barraRetaHTML(posicao, compacta = false) {
    const pos = Math.max(-10, Math.min(10, parseInt(posicao, 10) || 0));
    const metade = (Math.abs(pos) / 10) * 50;                 // % do total, a partir do centro
    const lado = pos > 0 ? 'reta-fill--pos' : (pos < 0 ? 'reta-fill--neg' : '');
    const estiloFill = pos >= 0 ? `left:50%;width:${metade}%;` : `left:${50 - metade}%;width:${metade}%;`;
    const agulha = 50 + (pos / 10) * 50;                      // % posição da agulha
    return `<span class="reta-barra${compacta ? ' compacta' : ''}">
        <span class="reta-zero"></span>
        <span class="reta-fill ${lado}" style="${estiloFill}"></span>
        <span class="reta-agulha" style="left:${agulha}%;"></span>
    </span>`;
}

// Corpo dinâmico do Contrato (pills assinadas + reta), re-renderizado a cada mudança.
function corpoContratoHTML() {
    const { posicao, tier } = RelacaoEscala.lerRelacao({ tags: contratoTags }, contratoTipoVinculo);
    const pills = contratoTags.map((t, i) => {
        const cls = t.sinal > 0 ? 'tag--pos' : (t.sinal < 0 ? 'tag--neg' : 'tag--neutro');
        const icone = t.sinal > 0 ? 'plus' : (t.sinal < 0 ? 'minus' : 'circle');
        return `<span class="tag ${cls}"><i data-lucide="${icone}" class="tag-selo"></i>${escapeHTML(t.texto)}<i data-lucide="x" class="tag-remover" data-idx="${i}" onclick="removerTagContrato(this.dataset.idx)" title="Remover"></i></span>`;
    }).join('');
    const sinalNum = `${posicao > 0 ? '+' : ''}${posicao}`;
    const rotulo = tier.nivel === 'neutro' ? 'Neutro' : tier.rotulo;
    return `
        <div class="tag-lista">${pills}</div>
        ${barraRetaHTML(posicao, false)}
        <div class="reta-rotulo">
            <span class="reta-pos reta-pos--${tier.lado}">${sinalNum}</span>
            <span class="reta-tier">${escapeHTML(rotulo)}</span>
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
    contratoTipoVinculo = l.tipo_vinculo || 'associado';
    // Normaliza: tolera tags LEGADAS (string) → {texto, sinal} inferido do tipo_vinculo (decisão 5).
    // Soft-migration: ao persistir, voltam gravadas como objetos assinados.
    contratoTags = RelacaoEscala.normalizarTags(d.tags, contratoTipoVinculo).map(t => ({ texto: t.texto, sinal: t.sinal }));

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-contrato';
    modal.innerHTML = `
        <div class="modal-box modal-contrato-box">
            <div class="modal-head">
                <h3 class="texto-roxo modal-titulo"><i data-lucide="move-horizontal"></i> Contrato de Relação</h3>
                <button class="btn btn-ghost btn-sm" onclick="fecharContrato()" title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <div class="contrato-partes">
                <span class="badge-link ${classeTipoLink(l.tipo_vinculo)}">${escapeHTML(nomeA)}</span>
                <i data-lucide="arrow-left-right"></i>
                <span class="badge-link ${classeTipoLink(l.tipo_vinculo)}">${escapeHTML(l.node_conectado_nome)}</span>
            </div>
            <p class="contrato-tipo">Tipo: ${escapeHTML(capitalizar(l.tipo_vinculo))}</p>
            <label>Incidentes / Motivos</label>
            <input type="text" id="contrato-tag-input" class="input-sm input-full" placeholder="Descreva o incidente/motivo…" onkeydown="contratoTagKeydown(event)">
            <div class="contrato-add-acoes">
                <button type="button" class="btn btn-sm btn-aproxima" onclick="adicionarTagContrato(1)"><i data-lucide="plus"></i> Aproxima</button>
                <button type="button" class="btn btn-sm btn-afasta" onclick="adicionarTagContrato(-1)"><i data-lucide="minus"></i> Afasta</button>
            </div>
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
// Adiciona uma tag ASSINADA (+1 aproxima / −1 afasta) e persiste. Um passo move a reta (decisão 4).
window.adicionarTagContrato = function(sinal) {
    const input = document.getElementById('contrato-tag-input');
    const val = (input?.value || '').trim();
    if (!val) return;
    if (contratoTags.length >= 50) { mostrarToast('Limite de tags atingido.', 'aviso'); return; }
    contratoTags.push({ texto: val.slice(0, 120), sinal: sinal < 0 ? -1 : 1 });
    if (input) input.value = '';
    persistirContrato();
};
// Enter no input = atalho p/ "Aproxima" (+); o "Afasta" (−) fica no botão. Único ponto de escuta (Regra 2.9).
window.contratoTagKeydown = function(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    adicionarTagContrato(1);
};
window.removerTagContrato = function(idx) {
    contratoTags.splice(parseInt(idx, 10), 1);
    persistirContrato();
};
// Persiste o array de tags ASSINADAS no JSONB e atualiza o corpo do modal + os badges do painel.
async function persistirContrato() {
    const corpo = document.getElementById('contrato-corpo');
    if (corpo) { corpo.innerHTML = corpoContratoHTML(); lucide.createIcons(); } // re-render otimista
    const dados = { tags: contratoTags }; // `dados` só guarda as tags (limite é obsoleto — reta_relacao.md)
    try {
        await MundoApi.atualizarLink(cronicaId, nodeAtualSinapse, contratoLinkId, dados);
        await recarregarSinapses(nodeAtualSinapse); // reflete a reta no badge
    } catch (e) {
        mostrarToast(e.message || 'Erro ao gravar a relação.', 'erro');
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
// humanizarMarco/iconeEntidade migraram para /js/mundo/mundoUtils.js (compartilhado com o
// escudo_narrador; carregado antes deste script). Caminho B — fim da duplicação.

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
        : '<div class="info-block-vazio col-full">Nenhuma conexão para mapear.</div>';

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-mapa-sinapses';
    modal.innerHTML = `
        <div class="modal-box mapa-sinapses-box">
            <div class="mapa-sinapses-header">
                <h3 class="texto-roxo modal-titulo"><i data-lucide="network"></i> Mapa de Sinapses</h3>
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

// Criar Marco inline (Enter) — Optimistic UI. Espelha a normalização do backend
// (`flag_key.trim().toLowerCase().replace(/\s+/g,'_')`, mundoController.js) para a
// chave otimista bater com a persistida (toggle/apagar funcionam sem reload).
window.adicionarMarcoInline = async function(e, nodeId) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const input = e.target;
    const nome = input.value.trim();
    if (!nome) return;
    const chave = nome.toLowerCase().replace(/\s+/g, '_');
    const node = nodesCache.find(n => String(n.id) === String(nodeId));
    if (node?.flags?.some(f => f.key === chave)) return mostrarToast('Esse marco já existe.', 'aviso');
    input.value = '';
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags`, {
            method: 'POST', body: JSON.stringify({ flag_key: nome })
        });
        if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.erro); }
        if (node) { node.flags = node.flags || []; node.flags.push({ key: chave, value: false }); }
        input.insertAdjacentHTML('beforebegin', marcoItemHTML(nodeId, { key: chave, value: false }));
        lucide.createIcons();
        input.focus(); // permite encadear vários marcos
    } catch (err) {
        input.value = nome; // devolve o texto p/ o utilizador tentar de novo
        mostrarToast(err.message || 'Erro ao criar marco.', 'erro');
    }
};

// Renomear marco inline (duplo-clique no nome). Re-renderiza só o item (chaves/handlers coerentes).
window.iniciarEdicaoMarco = function(e, nodeId, flagKey) {
    e.stopPropagation();
    const item = e.target.closest('.marco-item');
    edicaoInlineTexto(item?.querySelector('.marco-item__nome'), {
        classe: 'input-inline-marco input-inline-marco--edit',
        maxLength: 60,
        aoSalvar: async (novo, atual, alvo) => {
            try {
                const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags/${flagKey}`, {
                    method: 'PUT', body: JSON.stringify({ novo_nome: novo })
                });
                if (!res.ok) throw new Error();
                const novaKey = novo.toLowerCase().replace(/\s+/g, '_');
                const node = nodesCache.find(n => String(n.id) === String(nodeId));
                const fl = node?.flags?.find(f => f.key === flagKey); if (fl) fl.key = novaKey;
                const checked = item.querySelector('.marco-item__check')?.checked;
                item.outerHTML = marcoItemHTML(nodeId, { key: novaKey, value: checked });
                lucide.createIcons();
            } catch { alvo.textContent = atual; mostrarToast('Erro ao renomear marco.', 'erro'); }
        }
    });
};

// Apagar marco em 2 passos inline: × → botão "apagar?" (3s) → executa (sem confirm() nativo).
window.confirmarDeletarMarco = function(icon, nodeId, flagKey) {
    const item = icon.closest('.marco-item'); // referência sobrevive ao outerHTML do filho
    icon.outerHTML = `<button type="button" class="btn-del-marco-confirmar" onclick="executarDeletarMarco('${nodeId}', '${flagKey}', this)">apagar?</button>`;
    const btn = item?.querySelector('.btn-del-marco-confirmar'); // escopado ao card certo
    if (btn) btn._timer = setTimeout(() => reverterDelMarco(btn, nodeId, flagKey), 3000);
};
function reverterDelMarco(btn, nodeId, flagKey) {
    if (btn && btn.isConnected) {
        btn.outerHTML = `<i data-lucide="x" class="btn-del-marco" title="Apagar marco" onclick="confirmarDeletarMarco(this, '${nodeId}', '${flagKey}')"></i>`;
        lucide.createIcons();
    }
}
async function executarDeletarMarco(nodeId, flagKey, btn) {
    if (btn?._timer) clearTimeout(btn._timer);
    const item = btn?.closest('.marco-item');
    try {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags/${flagKey}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        item?.remove();
        const node = nodesCache.find(n => String(n.id) === String(nodeId));
        if (node?.flags) node.flags = node.flags.filter(f => f.key !== flagKey);
        if (document.getElementById('tab-eventos')?.classList.contains('ativa')) carregarEventos();
    } catch { mostrarToast('Erro ao deletar marco.', 'erro'); reverterDelMarco(btn, nodeId, flagKey); }
}

// ── INTERATIVIDADE PASSIVA: HOVER PREVIEW DE DEPENDÊNCIAS (FASE 15.4) ────────
// Constrói o reverse-lookup Marco→Eventos a partir dos gatilhos (event_flag_weights,
// expostos com node_id na query). Silencioso; latência zero no hover depois disto.
// PADRONIZAÇÃO ABSOLUTA DA CHAVE (Fase 17.6.2): a MESMA função gera a chave ao popular o
// mapa E ao lê-lo, eliminando o Key Mismatch. Espelha a normalização do backend
// (lowercase + trim + espaço→underscore), pois event_flag_weights pode guardar a chave
// crua enquanto world_flags a guarda normalizada.
function chaveMarco(nodeId, flagKey) {
    return String(nodeId) + '_' + String(flagKey).toLowerCase().trim().replace(/\s+/g, '_');
}

async function construirMapaDependencias() {
    mapaDependenciasMarcos = {};
    let eventos = [];
    try { eventos = await EventosApi.getEventos(cronicaId); } catch { return; }
    eventos.forEach(ev => {
        let gatilhos = ev.gatilhos;
        if (typeof gatilhos === 'string') { try { gatilhos = JSON.parse(gatilhos); } catch { gatilhos = []; } }
        if (!Array.isArray(gatilhos)) return;
        gatilhos.forEach(g => {
            if (!g || !g.node_id || !g.flag_key) return; // defensivo (Regra 4.2)
            const chave = chaveMarco(g.node_id, g.flag_key);
            (mapaDependenciasMarcos[chave] ||= []).push({
                idEvento: ev.id,
                nomeEvento: ev.nome,
                peso: g.peso,
                pool_atual: ev.pool_atual,
                pool_maxima: ev.pool_maxima
            });
        });
    });
    // Re-render para aplicar a affordance .marco-has-events nos cards já desenhados
    // (o mapa é construído após carregarMundo no init).
    if (mundoListaAtual.length) renderizarMundo();
}

// ── TOOLTIP DE MARCO POR HOVER (Fase 17.6.5) — fixed + rect cru, imune ao zoom ───
// Fecho instantâneo (Fase 17.8): sair do marco/tooltip esconde de imediato (sem túnel).
let tooltipDelayTimeout = null;

function ensureTooltipMarcoEl() {
    let tip = document.getElementById('tooltip-marco');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'tooltip-marco';
        tip.className = 'tooltip-marco-oculto';
        tip.addEventListener('mouseleave', esconderTooltipMarco);
        document.body.appendChild(tip);
    }
    return tip;
}

window.mostrarTooltipMarco = function(e, nodeId, flagKey) {
    const deps = mapaDependenciasMarcos[chaveMarco(nodeId, flagKey)];
    if (!deps || !deps.length) return;

    const tip = ensureTooltipMarcoEl();
    tip.innerHTML = `
        <div class="tooltip-marco__head"><i data-lucide="link"></i> ${escapeHTML(humanizarMarco(flagKey))}</div>
        ${deps.map(d => {
            const max = Number(d.pool_maxima) || 0;
            const atual = Number(d.pool_atual) || 0;
            const pct = max > 0 ? Math.min(100, Math.round((atual / max) * 100)) : 0;
            return `<div class="tooltip-marco__evento">
                <div class="tooltip-marco__top">
                    <span class="tooltip-marco__nome">${escapeHTML(d.nomeEvento)}</span>
                    <span class="tooltip-marco__peso">+${escapeHTML(String(d.peso))}</span>
                </div>
                <div class="tooltip-marco__bar"><div class="tooltip-marco__fill" style="width: ${pct}%;"></div></div>
                <div class="tooltip-marco__pool">${escapeHTML(String(atual))}/${escapeHTML(String(max))}</div>
            </div>`;
        }).join('')}`;
    lucide.createIcons();
    tip.classList.remove('tooltip-marco-oculto');
    tip.classList.add('tooltip-marco-visivel');

    posicionarTooltipHover(e.currentTarget, tip);
};

window.agendarFechoTooltip = function() {
    esconderTooltipMarco();
};

function esconderTooltipMarco() {
    const tip = document.getElementById('tooltip-marco');
    if (!tip) return;
    tip.classList.remove('tooltip-marco-visivel');
    tip.classList.add('tooltip-marco-oculto');
}

// SORO ANTI-ZOOM (Fase 17.7.1): position:fixed + DIVISÃO pelo fator de zoom. O Chrome
// aplica double-scaling com :root{zoom} — getBoundingClientRect vem escalado E o style.top/
// left é re-escalado ao renderizar. Dividir as coords pelo zoom anula a 2ª multiplicação,
// colando o tooltip abaixo-esquerda do gatilho. Injetado no body, sem margin/transform.
function posicionarTooltipHover(gatilho, tooltip) {
    tooltip.style.position = 'fixed';
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const rect = gatilho.getBoundingClientRect();
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    // Espaço /zoom: rect e janela divididos pelo fator, p/ casar com o style aplicado.
    const vw = window.innerWidth / zoom, vh = window.innerHeight / zoom;
    let top = (rect.bottom + 4) / zoom;   // logo abaixo do gatilho
    let left = rect.left / zoom;          // alinhado à esquerda (não foge p/ a direita)
    if (left + tw > vw - 8) left = (rect.right / zoom) - tw;   // vaza à direita → alinha pela direita
    if (left < 8) left = 8;
    if (top + th > vh - 8) top = (rect.top / zoom) - th - 4;   // sem espaço abaixo → acima
    if (top < 8) top = 8;
    tooltip.style.left = Math.round(left) + 'px';
    tooltip.style.top = Math.round(top) + 'px';
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
        const classeBarraCor = pct < 50 ? '' : (pct < 75 ? ' barra-fill--aviso' : ' barra-alerta');
        
        let gatilhosHtml = '';
        if (ev.gatilhos && ev.gatilhos.length > 0) {
            gatilhosHtml = ev.gatilhos.filter(g => g && g.node_nome).map(g => `
                <div class="evento-gatilho">
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
        <div class="card card-col">
            <div class="card-topo">
                <div class="card-topo-info">
                    <strong class="card-titulo">${escapeHTML(ev.nome)}</strong>
                    <span class="evento-estado${alerta ? ' evento-estado--alerta' : ''}">
                        ${alerta ? '<i data-lucide="alert-triangle"></i> PRONTO' : '<i data-lucide="eye"></i> Monitorando'}
                    </span>
                </div>
                <div class="card-topo-acoes">
                    <button class="btn btn-primary btn-sm" onclick="abrirModalVinculo('${ev.id}')">+ Vincular</button>
                    <button class="btn btn-danger btn-sm" data-id="${ev.id}" data-nome="${escapeHTML(ev.nome)}" onclick="deletarEvento(this.dataset.id, this.dataset.nome)" title="Deletar evento"><i data-lucide="trash-2"></i></button>
                </div>
            </div>

            <div class="evento-corpo">
                ${gatilhosHtml || '<p class="nota-mini">Nenhuma causa vinculada.</p>'}
            </div>

            <div class="card-rodape">
                <div class="barra-bg">
                    <div class="barra-fill${classeBarraCor}" style="width: ${pct}%;"></div>
                </div>
                <div class="evento-pool-info">
                    <span class="evento-pool-caption">Pool</span>
                    <span class="evento-pool-valor ${alerta ? 'evento-pool-valor--alerta' : ''}">${ev.pool_atual} / ${ev.pool_maxima}</span>
                </div>
                ${ev.ultima_excedida_em ? `<div class="evento-ativado"><i data-lucide="clock"></i> Ativado em: ${new Date(ev.ultima_excedida_em).toLocaleString()}</div>` : ''}

                <div class="evento-nucleos-linha">
                    <span class="truncate">Núcleos: ${nucleosBadges}</span>
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
                    <div class="auto-param">
                        <span class="auto-param__chave">${escapeHTML(String(key))}:</span>
                        <strong class="auto-param__valor">${escapeHTML(String(value))}</strong>
                    </div>
                `).join('');

                return `
                <div class="card card-col" id="auto-card-${auto.id}">

                    <div class="card-topo">
                        <div class="auto-ident">
                            <span class="badge truncate" title="${escapeHTML(auto.evento_nome)}">
                                Gatilho: ${escapeHTML(auto.evento_nome)}
                            </span>
                            <strong class="auto-acao">Ação: ${badgeTxt}</strong>
                        </div>
                        <button class="btn btn-danger btn-sm flex-shrink-0" onclick="deletarAutomacao('${auto.id}')"><i data-lucide="trash-2"></i></button>
                    </div>

                    <div class="auto-params">
                        ${parametrosHtml || '<span class="auto-param-vazio">Sem parâmetros.</span>'}
                    </div>

                    <div class="card-rodape">
                        <label class="auto-toggle${auto.ativo ? '' : ' auto-toggle--off'}">
                            <input type="checkbox" class="auto-toggle__check" onchange="toggleAutomacaoStatus('${auto.id}', this)" ${auto.ativo ? 'checked' : ''}>
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
            <div class="flag-row">
                <input type="text" class="flag-key" placeholder="Chave">
                <select class="flag-value">
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
            renderizarMundo(dados); // via dispatcher → respeita a lente ativa (Grelha/Kanban)
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
    row.innerHTML = `
        <input type="text" class="flag-key" placeholder="Chave">
        <select class="flag-value">
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
        grid.innerHTML = '<div class="info-block-vazio col-full">Nenhuma sessão registrada (ou encontrada neste núcleo).</div>';
        return;
    }
    
    grid.innerHTML = listaParaRenderizar.map(s => {
        const dataFormatada = formatarData(s.data_sessao);
        
        // Badge alinhada e protegida contra textos longos
        const nucleoBadge = s.nucleo_nome 
            ? `<span class="badge sessao-badge truncate">${escapeHTML(s.nucleo_nome)}</span>`
            : '';

        return `
        <div class="card card-col card-clicavel" onclick="abrirDetalhesSessao('${s.id}')">

            <div class="card-topo">
                <div class="card-topo-info">
                    ${nucleoBadge}
                    <strong class="card-titulo truncate" title="${escapeHTML(s.titulo)}">
                        ${escapeHTML(s.titulo)}
                    </strong>
                </div>
                <span class="sessao-data">
                    ${dataFormatada}
                </span>
            </div>

            <div class="sessao-corpo">
                <p class="sessao-resumo-preview">
                    ${escapeHTML(s.resumo || 'Clique para ler os registros, entidades presentes e desfechos deste encontro...')}
                </p>
            </div>

            <div class="card-rodape card-rodape--flex">
                <span class="sessao-status${s.status === 'jogada' ? ' sessao-status--ativa' : ''}">
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
            return `<li class="detalhe-item">
                <span><i data-lucide="user"></i> ${escapeHTML(node.nome)}</span>
                <button class="btn btn-danger btn-sm btn-mini"
                        onclick="removerVinculoSessao('entidade', '${nodeId}')"><i data-lucide="x"></i></button>
            </li>`;
        }).join('')
        : '<li class="texto-mutado">Nenhuma entidade atrelada.</li>';
    }

    const ulEventos = document.getElementById('detalhe-eventos');
    const eventosIds = s.eventos || [];
    let eventosHtml = eventosIds.map(evId => {
        const ev = eventosCache.find(e => e.id === evId);
        return `<li class="detalhe-item">
            <span><i data-lucide="calendar"></i> <strong class="texto-destaque">${ev ? escapeHTML(ev.nome) : 'Evento Desconhecido'}</strong></span>
            <button class="btn btn-danger btn-sm btn-mini"
                    onclick="removerVinculoSessao('evento', '${evId}')"><i data-lucide="x"></i></button>
        </li>`;
    }).join('');
    
    const automacoesIds = s.automacoes || [];
    let automacoesHtml = automacoesIds.map(autoId => {
        const auto = automacoesCache.find(a => a.id === autoId);
        return `<li class="detalhe-item"><i data-lucide="zap"></i> Automação: ${auto ? escapeHTML(auto.tipo_nome) + ' via ' + escapeHTML(auto.evento_nome) : 'Desconhecida'}</li>`;
    }).join('');
    
    if(ulEventos) ulEventos.innerHTML = eventosHtml + automacoesHtml || '<li class="texto-mutado">Nenhum evento ou automação.</li>';

    const ulDesfechos = document.getElementById('detalhe-desfechos');
    const desfechos = s.desfechos || [];
    if(ulDesfechos) ulDesfechos.innerHTML = desfechos.map(d => `<li>${escapeHTML(d)}</li>`).join('') || '<li class="texto-mutado">Nenhum desfecho registrado.</li>';

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

// Toggle de visualização (Grelha / Direção de Cena): troca só a apresentação,
// re-renderizando a lista já em memória — sem refetch. Listeners nativos.
function inicializarViewToggle() {
    const toggle = document.querySelector('.view-toggle');
    if (!toggle) return;
    toggle.querySelectorAll('button[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            if (view === mundoCurrentView) return;
            mundoCurrentView = view;
            toggle.querySelectorAll('button[data-view]').forEach(b => b.classList.toggle('active', b === btn));
            renderizarMundo(); // re-render da lista atual na nova visualização
        });
    });
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
                ulSaves.innerHTML = '<li class="texto-mutado">Nenhum save de combate vinculado.</li>';
                return;
            }
            ulSaves.innerHTML = saves.map(s => `
                <li class="save-item">
                    <i data-lucide="swords"></i> <strong>${escapeHTML(s.nome)}</strong>
                    <span class="nota-mini">(${new Date(s.criado_em).toLocaleString('pt-BR')})</span>
                    <button class="btn btn-outline-primary btn-sm save-item__acao" onclick="abrirEscudoComSave('${s.id}')">Carregar no Escudo</button>
                </li>
            `).join('');
            lucide.createIcons();
        }
    } catch (err) {
        ulSaves.innerHTML = '<li class="texto-erro">Erro ao carregar saves.</li>';
    }
}

window.abrirEscudoComSave = function(saveId) {
    window.open(`/escudo_narrador.html?id=${cronicaId}&save=${saveId}`, '_blank');
}

// ==========================================
// TABULEIRO DE CAMPANHA (FASE 13) — INFINITE CANVAS
// Canvas livre multi-board: o Narrador escolhe um Tabuleiro (world_boards),
// adiciona entidades (cards arrastáveis) e organiza o espaço com Pan/Zoom.
// O estado vive em boardState e persiste em world_boards.dados pelo botão SALVAR
// (Regra 2.7 — sem auto-save). Cores são tokens → classes .board-cor-* (Regra 2.5).
// [Fatia 2: infra. Shapes/zonas → fatia 3; linhas + edição cor/ícone → fatia 4.]
// ==========================================
const CORES_BOARD = ['roxo', 'azul', 'verde', 'ambar', 'vermelho', 'cinza', 'rosa'];
// Props: nomes REAIS dos SVGs em /public/icons/rpg/ (sem extensão). Espelha o disco;
// o backend valida por regex anti-traversal. Mantê-los em sincronia com a pasta.
const ICONES_RPG = [
    'shield', 'crossed-swords', 'broadsword', 'battered-axe', 'bow-arrow', 'fangs',
    'pistol-gun', 'revolver', 'hammer', 'wizard-staff', 'spell-book', 'secret-book',
    'book-cover', 'tied-scroll', 'quill-ink', 'potion-ball', 'drop', 'first-aid-kit',
    'health-normal', 'torch', 'lantern-flame', 'pentacle', 'all-seeing-eye', 'magnifying-glass',
    'backpack', 'lockpicks', 'id-card', 'dice-six-faces-six', 'dice-twenty-faces-twenty',
    'perspective-dice-six-faces-random', 'gears', 'cogsplosion', 'clout', 'laptop', 'smartphone'
];

// ============================================
// DIPLOMACIA (FASE 14) — controle global na aba Mundo (fonte única da verdade).
// Selects populados com nucleosCache.entidade; persistência via bulk replace.
// ============================================
window.abrirModalDiplomacia = async function() {
    if (nucleosCache.entidade.length === 0) await carregarNucleos('entidade');
    diplomaciaCache = await MundoApi.getDiplomacia(cronicaId); // tolerante a backend ausente (→ [])
    // Popula só o select de Foco; o resto (lista + formulário) é por facção em foco.
    diplomaciaVerTudo = false; diplomaciaUltimoFoco = null; // cada abertura começa recolhida
    const foco = document.getElementById('dip-foco');
    if (foco) foco.innerHTML = '<option value="">— Selecione uma facção —</option>'
        + nucleosCache.entidade.map(n => `<option value="${escapeHTML(String(n.id))}">${escapeHTML(n.nome)}</option>`).join('');
    renderizarListaDiplomacia();
    abrirModal('modal-diplomacia');
};

function nomeNucleoDip(id) {
    const n = nucleosCache.entidade.find(x => String(x.id) === String(id));
    return n ? n.nome : '—';
}

// Visão Centrada: mostra só as relações da facção em foco + monta o formulário em andares
// (A = foco herdado). Sem foco → lista vazia e formulário oculto (.diplomacia-andares:empty).
function renderizarListaDiplomacia() {
    const focoId = document.getElementById('dip-foco')?.value || '';
    if (focoId !== diplomaciaUltimoFoco) { diplomaciaVerTudo = false; diplomaciaUltimoFoco = focoId; } // nova facção começa recolhida
    const lista = document.getElementById('lista-diplomacia');
    const form = document.getElementById('form-diplomacia-andares');
    if (!lista || !form) return;
    if (!focoId) {
        lista.innerHTML = '<div class="info-block-vazio">Selecione uma facção para ver e definir as suas relações.</div>';
        form.innerHTML = '';
        return;
    }
    const rels = diplomaciaCache.filter(r => String(r.nucleoA) === focoId || String(r.nucleoB) === focoId);
    if (!rels.length) {
        lista.innerHTML = '<div class="info-block-vazio">Esta facção ainda não tem relações.</div>';
    } else {
        const mostrar = diplomaciaVerTudo ? rels : rels.slice(0, DIP_LIMITE);
        const linhas = mostrar.map(r => {
            const outroId = String(r.nucleoA) === focoId ? r.nucleoB : r.nucleoA;
            return `<div class="diplomacia-linha diplomacia-grupo--${r.status}">
                <span class="diplomacia-par"><i data-lucide="arrow-left-right"></i> ${escapeHTML(nomeNucleoDip(outroId))}</span>
                <span class="badge">${STATUS_DIP[r.status] || r.status}</span>
                <button class="btn btn-ghost btn-sm diplomacia-remover" title="Remover" onclick="removerDiplomacia('${escapeHTML(String(r.id))}')"><i data-lucide="x"></i></button>
            </div>`;
        }).join('');
        // "Ver mais (+N)" / "Ver menos" só quando passa do limite (paginação leve, sem depender de scroll).
        const toggle = rels.length > DIP_LIMITE
            ? (diplomaciaVerTudo
                ? `<button class="btn btn-ghost btn-sm diplomacia-vermais" onclick="alternarVerTudoDiplomacia()"><i data-lucide="chevron-up"></i> Ver menos</button>`
                : `<button class="btn btn-ghost btn-sm diplomacia-vermais" onclick="alternarVerTudoDiplomacia()"><i data-lucide="chevron-down"></i> Ver mais (+${rels.length - DIP_LIMITE})</button>`)
            : '';
        lista.innerHTML = linhas + toggle;
    }
    // Formulário em andares: Status + Outra facção (B) + Adicionar. A vem do Foco.
    const outras = nucleosCache.entidade.filter(n => String(n.id) !== focoId);
    form.innerHTML = `
        <div class="diplomacia-andar">
            <label>Status</label>
            <select id="dip-status" class="input-full">
                <option value="aliado">Aliados</option>
                <option value="inimigo">Inimigos</option>
                <option value="neutro">Neutros</option>
            </select>
        </div>
        <div class="diplomacia-andar">
            <label>Com a facção</label>
            <select id="dip-nucleo-b" class="input-full">
                ${outras.map(n => `<option value="${escapeHTML(String(n.id))}">${escapeHTML(n.nome)}</option>`).join('')}
            </select>
        </div>
        <button class="btn btn-primary btn-sm" onclick="adicionarDiplomacia()"><i data-lucide="plus"></i> Adicionar relação</button>`;
    lucide.createIcons();
}

window.adicionarDiplomacia = async function() {
    const a = document.getElementById('dip-foco')?.value;        // facção em foco (herdada)
    const b = document.getElementById('dip-nucleo-b')?.value;
    const status = document.getElementById('dip-status')?.value;
    if (!a) return mostrarToast('Selecione a facção em foco.', 'aviso');
    if (!b) return mostrarToast('Selecione a outra facção.', 'aviso');
    if (a === b) return mostrarToast('Um núcleo não pode ter relação consigo mesmo.', 'aviso');
    // Par já existe (em qualquer ordem)? então só troca o status; senão, cria.
    const existente = diplomaciaCache.find(r =>
        (String(r.nucleoA) === a && String(r.nucleoB) === b) ||
        (String(r.nucleoA) === b && String(r.nucleoB) === a));
    if (existente) existente.status = status;
    else diplomaciaCache.push({ id: novoIdLocal('dip'), nucleoA: a, nucleoB: b, status });
    await persistirDiplomacia();
    renderizarListaDiplomacia();
};

window.removerDiplomacia = async function(id) {
    diplomaciaCache = diplomaciaCache.filter(r => String(r.id) !== String(id));
    await persistirDiplomacia();
    renderizarListaDiplomacia();
};

// Alterna a paginação "Ver mais / Ver menos" da lista da facção em foco.
window.alternarVerTudoDiplomacia = function() {
    diplomaciaVerTudo = !diplomaciaVerTudo;
    renderizarListaDiplomacia();
};

// Bulk replace: envia o conjunto inteiro e adota os ids reais devolvidos pelo servidor.
async function persistirDiplomacia() {
    try {
        const salvo = await MundoApi.salvarDiplomacia(cronicaId, diplomaciaCache.map(r => ({ nucleoA: r.nucleoA, nucleoB: r.nucleoB, status: r.status })));
        if (Array.isArray(salvo)) diplomaciaCache = salvo;
    } catch (e) {
        mostrarToast(e.message || 'Erro ao salvar diplomacia.', 'erro');
    }
}

// Temas do tabuleiro (Fase 15 — Atualização Imersiva, Fatia 3). Paradigma 5: classe escopada
// no #board-canvas (board-tema-*), pura apresentação; persiste no boardState (Salvar, Regra 2.7).
const TEMAS_BOARD = ['esquema', 'investigacao'];
const boardVazio = () => ({ camera: { x: 0, y: 0, zoom: 1 }, fundo: 'dots', fundoImagem: null, tema: 'esquema', nodes: [], shapes: [], celulas: [], texts: [], props: [], localLinks: [], overrides_linhas: {} });
let boardAtualId = null;
let boardNomeAtual = '';
let boardState = boardVazio();
let hoveredNodeId = null; // card sob o cursor → re-aplica .linha-destaque a cada redraw (persiste no arrasto)
let boardNodesCache = []; // todos os world_nodes (id → nome/tipo para render)
// Modo Constelação (Fase 14): lente force-directed transitória dos núcleos (read-only).
let modoConstelacao = false;
let constelacaoSnapshot = [];   // layout original das células p/ restaurar ao sair
let constelacaoSnapshotNodes = null; // clone dos nodes (membros) p/ restaurar — anti-espalhamento
let constelacaoRAF = null;      // id do requestAnimationFrame do loop de física
let constelacaoFisica = null;   // velocidades {id:{vx,vy}} — vivem só durante o modo (não tocam boardState)
let celulaArrastandoId = null;  // célula em arrasto ativo → "massa infinita" na física
let boardPan = null;      // estado do pan em curso

const elBoardCanvas = () => document.getElementById('board-canvas');
const elBoardWorld = () => document.getElementById('board-world');
const boardNodeInfo = (id) => boardNodesCache.find(n => String(n.id) === String(id));

// Entrada da aba: carrega cache de nós + lista de tabuleiros + liga Pan/Zoom.
async function carregarMesaGuerra() {
    if (!elBoardCanvas()) return;
    // Os 3 carregamentos são independentes → em paralelo (1 ida ao servidor em vez de 3
    // sequenciais). allSettled p/ tolerância: a falha de um não derruba os outros.
    const [nodesR, diploR, eventosR] = await Promise.allSettled([
        MundoApi.getNodes(cronicaId),
        MundoApi.getDiplomacia(cronicaId),
        EventosApi.getEventos(cronicaId)
    ]);
    if (nodesR.status === 'fulfilled') boardNodesCache = nodesR.value; // falha → mantém cache anterior
    else mostrarToast('Erro ao carregar entidades.', 'erro');
    diplomaciaCache = diploR.status === 'fulfilled' ? diploR.value : []; // board reflete a diplomacia do Mundo (tolerante → [])
    // Eventos (p/ crachás na render): tolerante a falha (→ []); gatilhos normalizado abaixo.
    boardEventosCache = eventosR.status === 'fulfilled' ? eventosR.value : [];
    boardEventosCache.forEach(ev => {
        if (typeof ev.gatilhos === 'string') { try { ev.gatilhos = JSON.parse(ev.gatilhos); } catch (_) { ev.gatilhos = []; } }
        if (!Array.isArray(ev.gatilhos)) ev.gatilhos = [];
    });
    await recarregarListaBoards();
    ativarPanZoom();
    // Re-render ao (re)entrar na aba com o cache fresco: o agrupamento das células e a
    // ocultação de membros passam a refletir mudanças de núcleo feitas na aba Mundo
    // (re-sync passivo, não-destrutivo — não move nem importa cards; só recomputa
    // grupo/visibilidade a partir do nucleo_id atual). Render trata board aberto e vazio.
    renderBoard();
}

async function recarregarListaBoards() {
    const sel = document.getElementById('board-select');
    if (!sel) return;
    let lista = [];
    try { lista = await MundoApi.listarBoards(cronicaId); }
    catch (e) { mostrarToast('Erro ao listar tabuleiros.', 'erro'); return; }
    sel.innerHTML = '<option value="">— Selecione um tabuleiro —</option>'
        + lista.map(b => `<option value="${escapeHTML(String(b.id))}">${escapeHTML(b.nome)}</option>`).join('');
    sel.value = boardAtualId || '';
}

window.novoBoard = async function() {
    const nome = (prompt('Nome do novo tabuleiro:') || '').trim();
    if (!nome) return;
    try {
        const b = await MundoApi.criarBoard(cronicaId, nome, boardVazio());
        mostrarToast('Tabuleiro criado!', 'sucesso');
        await recarregarListaBoards();
        await abrirBoard(b.id);
    } catch (e) { mostrarToast(e.message || 'Erro ao criar tabuleiro.', 'erro'); }
};

window.abrirBoard = async function(boardId) {
    boardAtualId = boardId || null;
    eventosInvocados = {}; // invocações são por-tabuleiro: troca de board zera os painéis efêmeros
    ajustandoFundo = false; // sai do modo de ajuste de fundo ao trocar de tabuleiro
    document.getElementById('btn-ajustar-fundo')?.classList.remove('ativo');
    sincronizarControlesFundo();
    if (!boardId) { boardState = boardVazio(); boardNomeAtual = ''; renderBoard(); return; }
    let resp;
    try { resp = await MundoApi.buscarBoard(cronicaId, boardId); }
    catch (e) { mostrarToast(e.message || 'Erro ao carregar tabuleiro.', 'erro'); return; }
    boardNomeAtual = resp.nome || '';
    const d = resp.dados || {};
    boardState = {
        camera: d.camera || { x: 0, y: 0, zoom: 1 },
        fundo: d.fundo || 'dots',
        fundoImagem: (d.fundoImagem && typeof d.fundoImagem.url === 'string') ? d.fundoImagem : null, // defensivo (Regra 4.2)
        tema: TEMAS_BOARD.includes(d.tema) ? d.tema : 'esquema', // Fatia 3 (defensivo, Regra 4.2)
        nodes: Array.isArray(d.nodes) ? d.nodes : [],
        shapes: Array.isArray(d.shapes) ? d.shapes : [],
        celulas: Array.isArray(d.celulas) ? d.celulas : [],
        texts: Array.isArray(d.texts) ? d.texts : [],
        props: Array.isArray(d.props) ? d.props : [],
        localLinks: Array.isArray(d.localLinks) ? d.localLinks : [],
        overrides_linhas: d.overrides_linhas || {}
    };
    if (resp.atualizado_automaticamente) {
        mostrarToast('Aviso: Entidades ausentes foram removidas do tabuleiro.', 'aviso');
    }
    const sel = document.getElementById('board-select'); if (sel) sel.value = boardAtualId;
    const selFundo = document.getElementById('board-fundo-select'); if (selFundo) selFundo.value = boardState.fundo;
    const selTema = document.getElementById('board-tema-select'); if (selTema) selTema.value = boardState.tema;
    renderBoard();
    atualizarLinksBoard(); // busca os world_links reais entre os nós e desenha as linhas
};

window.salvarBoard = async function() {
    if (!boardAtualId) return mostrarToast('Selecione ou crie um tabuleiro primeiro.', 'aviso');
    if (modoConstelacao) return mostrarToast('Saia do modo Constelação antes de salvar (layout transitório).', 'aviso');
    try {
        await MundoApi.atualizarBoard(cronicaId, boardAtualId, { dados: boardState });
        mostrarToast('Tabuleiro salvo.', 'sucesso');
    } catch (e) { mostrarToast(e.message || 'Erro ao salvar tabuleiro.', 'erro'); }
};

window.deletarBoardAtual = async function() {
    if (!boardAtualId) return mostrarToast('Nenhum tabuleiro aberto.', 'aviso');
    if (!confirm(`Excluir o tabuleiro "${boardNomeAtual}"? Esta ação é permanente.`)) return;
    try {
        await MundoApi.deletarBoard(cronicaId, boardAtualId);
        mostrarToast('Tabuleiro removido.', 'sucesso');
        boardAtualId = null; boardNomeAtual = ''; boardState = boardVazio();
        await recarregarListaBoards();
        renderBoard();
    } catch (e) { mostrarToast(e.message || 'Erro ao remover tabuleiro.', 'erro'); }
};

// Render do mundo: cards das entidades em boardState.nodes. Aplica a câmera e religa
// o arrasto dos cards. (Shapes → fatia 3; linhas → fatia 4.)
function renderBoard() {
    const world = elBoardWorld();
    if (!world) return;
    if (!boardAtualId) {
        world.innerHTML = '<div class="board-vazio info-block-vazio">Selecione um tabuleiro no menu, ou crie um novo.</div>';
        world.style.transform = '';
        return;
    }
    // Núcleos minimizados → esconder os cards-membros (cruza via boardNodeInfo).
    const nucleosMin = new Set((boardState.celulas || []).filter(c => c.minimizada).map(c => String(c.nucleo_id)));
    const comEvento = nodesComEvento(); // ids que disparam ≥1 evento → recebem crachá
    const cards = boardState.nodes.map(node => {
        const info = boardNodeInfo(node.id);
        if (!info) return ''; // defensivo: o sync já deveria ter removido órfãos
        const corClasse = CORES_BOARD.includes(node.cor) ? ` board-cor-${node.cor}` : '';
        const oculto = info.nucleo_id != null && nucleosMin.has(String(info.nucleo_id)) ? ' is-membro-oculto' : '';
        const icone = node.icone || iconeEntidade(info.tipo);
        // Crachá de evento (Revelação Sob Demanda): só se o nó é gatilho de algum evento.
        // onpointerdown.stopPropagation evita iniciar o arrasto do card ao clicar no crachá.
        // Origem da invocação: à direita do card (largura 180px) + folga, p/ o painel nascer
        // afastado da entidade em vez de sobrepô-la (cascata aplica o resto em invocarEventosDoNode).
        const badge = comEvento.has(String(node.id))
            ? `<div class="card-badge-evento" title="Ver eventos" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation(); invocarEventosDoNode('${escapeHTML(String(node.id))}', ${Math.round(node.x + 200)}, ${Math.round(node.y - 50)})"><i data-lucide="scroll-text"></i></div>`
            : '';
        return `<div class="board-card${corClasse}${oculto}" data-node="${escapeHTML(String(node.id))}" style="left: ${Math.round(node.x)}px; top: ${Math.round(node.y)}px;">
            <span class="board-card-thumb">
                <i data-lucide="${escapeHTML(icone)}" class="board-card-icone"></i>
                ${info.avatar_url ? `<img class="board-card-avatar" src="${escapeHTML(info.avatar_url)}" alt="" draggable="false" onerror="this.remove()">` : ''}
            </span>
            <span class="board-card-info">
                <span class="board-card-nome">${escapeHTML(info.nome)}</span>
                <span class="board-card-tipo">${escapeHTML(info.tipo)}</span>
            </span>${badge}
        </div>`;
    }).join('');
    const celulas = (boardState.celulas || []).map(celulaHTML).join(''); // células de núcleo (z-index 1, sob os cards)
    const shapes = boardState.shapes.map(shapeHTML).join(''); // zonas (z-index 1, sob os cards)
    const props = boardState.props.map(propHTML).join('');     // ícones RPG (z-index 1)
    const texts = boardState.texts.map(textHTML).join('');     // textos flutuantes (z-index 3)
    const eventos = eventosInvocadosHTML();                    // painéis de evento invocados via crachá (efêmero/read-only)
    const corpo = celulas + shapes + props + eventos + texts + cards;
    // Fatia 1a: camada de imagem de fundo (mapa/textura) dentro do #board-world → move/zooma com
    // os cards; z-index -1 via CSS (sob as zonas). pointer-events:none (posicionar virá na 1b).
    const fi = boardState.fundoImagem;
    const fundoOpac = typeof fi?.opacidade === 'number' ? fi.opacidade : 1;
    const fundoImg = fi
        ? `<div class="board-imagem-fundo${ajustandoFundo ? ' is-editando' : ''}" style="left: ${Math.round(fi.x)}px; top: ${Math.round(fi.y)}px; width: ${Math.round(fi.w)}px; height: ${Math.round(fi.h)}px; opacity: ${fundoOpac};"><img src="${escapeHTML(fi.url)}" alt="" draggable="false" onerror="this.closest('.board-imagem-fundo')?.remove()">${ajustandoFundo ? '<span class="board-fundo-resize" title="Redimensionar"></span>' : ''}</div>`
        : '';
    world.innerHTML = '<svg class="board-svg"></svg>' + fundoImg + (corpo || (fundoImg ? '' : '<div class="board-vazio info-block-vazio">Tabuleiro vazio. Use “+ Entidade” ou “+ Zona” para começar.</div>'));
    aplicarCamera();
    aplicarTemaBoard(); // Fatia 3: classe de tema escopada no #board-canvas (Paradigma 5)
    lucide.createIcons();
    ativarArrastoCards();
    ativarArrastoCelulas();
    ativarInteracoesShapes();
    ativarInteracoesProps();
    ativarInteracoesTexts();
    ativarArrastoEventos();
    ativarInteracoesFundo();
    if (mapaCalor) pintarCalorBoard(); // escala os boxes ANTES das linhas (re-ancoram no tamanho novo)
    desenharLinhasBoard(); // linhas a partir do cache boardLinks + localLinks
}

function aplicarCamera() {
    const world = elBoardWorld();
    if (!world) return;
    const c = boardState.camera;
    world.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.zoom})`;
    // Fundo no viewport estático segue a câmera (parallax 1:1, infinito). O tipo
    // (pontilhado/grade/liso) é escolhido pelo Narrador: a IMAGEM/cor do padrão vem das
    // classes CSS .board-canvas--grid/--dots (cores em tokens); aqui só togglamos o tipo
    // e mantemos background-size/-position seguindo a câmera (anti-Moiré).
    const canvas = elBoardCanvas();
    if (!canvas) return;
    // Auto-esconder a grade quando há imagem de fundo (Fatia 1c): view-rule reversível — não
    // muta boardState.fundo, então a escolha do Narrador volta ao remover a imagem.
    const tipo = boardState.fundoImagem ? 'none' : (boardState.fundo || 'dots');
    let passo = (tipo === 'grid' ? 32 : 24) * c.zoom;
    // Anti-Moiré: duplica o passo até ele sair da faixa de "chiado" (pontos colidindo).
    while (passo > 0 && passo < 14) passo *= 2;

    canvas.classList.toggle('board-canvas--grid', tipo === 'grid');
    canvas.classList.toggle('board-canvas--dots', tipo === 'dots');
    if (tipo !== 'none') {
        canvas.style.backgroundSize = `${passo}px ${passo}px`;
    }
    canvas.style.backgroundPosition = `${c.x}px ${c.y}px`;
}

// Tema do tabuleiro (Paradigma 5): aplica board-tema-* no #board-canvas (escopo). Pura
// apresentação — não muta domínio. 'esquema' = sem overrides (a classe existe mas é no-op).
function aplicarTemaBoard() {
    const canvas = elBoardCanvas();
    if (!canvas) return;
    const ativo = TEMAS_BOARD.includes(boardState.tema) ? boardState.tema : 'esquema';
    TEMAS_BOARD.forEach(t => canvas.classList.toggle(`board-tema-${t}`, t === ativo));
}
// Troca o tema (visual imediato); persiste só no Salvar (Regra 2.7, nada de auto-save).
window.setTemaBoard = function(t) {
    boardState.tema = TEMAS_BOARD.includes(t) ? t : 'esquema';
    aplicarTemaBoard();
};

// Arrasto dos cards (coordenadas de mundo = delta de tela / zoom). Atualiza
// boardState.nodes em memória; persiste só no Salvar (Regra 2.7).
function ativarArrastoCards() {
    const world = elBoardWorld();
    if (!world) return;
    world.querySelectorAll('.board-card').forEach(card => {
        card.onpointerdown = (e) => {
            if (e.button !== 0) return;
            e.stopPropagation(); // não inicia o Pan do canvas
            const node = boardState.nodes.find(n => String(n.id) === String(card.dataset.node));
            if (!node) return;
            const z = boardState.camera.zoom || 1;
            const sx = e.clientX, sy = e.clientY, ox = node.x, oy = node.y;
            card.setPointerCapture(e.pointerId);
            card.classList.add('dragging');
            const onMove = (ev) => {
                node.x = Math.round(ox + (ev.clientX - sx) / z);
                node.y = Math.round(oy + (ev.clientY - sy) / z);
                card.style.left = node.x + 'px';
                card.style.top = node.y + 'px';
                agendarRedesenhoLinhas(); // coalesce 1 redesenho/frame (rAF) → card sem lag
            };
            const onUp = () => {
                card.classList.remove('dragging');
                card.removeEventListener('pointermove', onMove);
                card.removeEventListener('pointerup', onUp);
                card.removeEventListener('pointercancel', onUp);
            };
            card.addEventListener('pointermove', onMove);
            card.addEventListener('pointerup', onUp);
            card.addEventListener('pointercancel', onUp); // ponteiro cancelado → solta mesmo assim
        };
        card.ondblclick = (e) => { e.stopPropagation(); abrirEditorNode(card, e); };
        // Dimming seletivo: ao passar o cursor, realça só as linhas ligadas a este card.
        card.onmouseenter = () => { hoveredNodeId = card.dataset.node; destacarLinhasDe(hoveredNodeId, true); };
        card.onmouseleave = () => { hoveredNodeId = null; destacarLinhasDe(card.dataset.node, false); };
    });
}

// Liga/desliga .linha-destaque nas linhas cujo data-a/data-b casa com o nó (sem seletor
// dinâmico → imune a id com caracteres especiais). on=false limpa todas as casadas.
function destacarLinhasDe(nodeId, on) {
    const svg = elBoardWorld()?.querySelector('.board-svg');
    if (!svg) return;
    const id = String(nodeId);
    svg.querySelectorAll('.board-line').forEach(p => {
        const ligada = p.dataset.a === id || p.dataset.b === id;
        if (ligada) p.classList.toggle('linha-destaque', on);
    });
}

// ── LENTE DE DESTAQUE (FASE 15 F1) — "farol no escuro" ──────────────────────
// Busca por nome: escurece o board e realça só os nós casados + vizinhos diretos
// (e as linhas entre eles). Lente read-only/transitória — NÃO toca boardState.
let focoTermo = '';
let focoSet = null; // Set<string> de ids em foco (casados + vizinhos); null = inativo

window.aplicarFocoBoard = function(termo) {
    focoTermo = String(termo || '').trim().toLowerCase();
    const world = elBoardWorld();
    if (!world) return;
    if (focoTermo) desligarMapaCalor(); // lentes exclusivas na v1 (eventos invocados convivem)
    if (!focoTermo) {
        focoSet = null;
        world.classList.remove('modo-foco');
        world.querySelectorAll('.em-foco').forEach(el => el.classList.remove('em-foco'));
        desenharLinhasBoard(); // limpa o destaque das linhas
        return;
    }
    // Nós cujo NOME casa o termo (via boardNodeInfo) + seus vizinhos diretos (boardLinks).
    const casados = new Set();
    boardState.nodes.forEach(n => {
        const info = boardNodeInfo(n.id);
        if (info && (info.nome || '').toLowerCase().includes(focoTermo)) casados.add(String(n.id));
    });
    focoSet = new Set(casados);
    boardLinks.forEach(lk => {
        if (casados.has(String(lk.a))) focoSet.add(String(lk.b));
        if (casados.has(String(lk.b))) focoSet.add(String(lk.a));
    });
    world.classList.add('modo-foco');
    pintarFocoBoard();
};

// Aplica .em-foco aos cards do focoSet e .linha-destaque às linhas entre eles. Idempotente
// e barato — re-chamado no fim do desenharLinhasBoard (re-render/arrasto) p/ persistir o foco.
function pintarFocoBoard() {
    const world = elBoardWorld();
    if (!world || !focoSet) return;
    world.querySelectorAll('.board-card.em-foco').forEach(el => el.classList.remove('em-foco'));
    focoSet.forEach(id => {
        const card = world.querySelector(`.board-card[data-node="${cssEscape(id)}"]`);
        if (card) card.classList.add('em-foco');
    });
    const svg = world.querySelector('.board-svg');
    if (svg) svg.querySelectorAll('.board-line[data-a]').forEach(p => {
        p.classList.toggle('linha-destaque', focoSet.has(p.dataset.a) && focoSet.has(p.dataset.b));
    });
}

// ── MAPA DE CALOR (FASE 15 F2) — influência em DOIS canais ──────────────────
// Canal 1 (TAMANHO + BRILHO) = quantidade de conexões (world_links diretos + diplomacia
// da facção), normalizado pico-relativo, teto 1.5×. Canal 2 (COR de borda+glow) = balanço
// POLÍTICO: mais aliados → verde, mais inimigos → vermelho, equilíbrio/sem alinhamento →
// neutro. Células de núcleo idem (diplomacia + somatório dos membros) → ver de relance qual
// facção domina e de que lado pende. Lente read-only/transitória: NÃO toca boardState; ambos
// os canais vão em CSS vars inline (--heat escala o BOX width/font/ícone — nunca `transform:
// scale`, que distorce hit-box e desancora linhas; --heat-cor tinge borda+glow via tokens).
let mapaCalor = false;
const CALOR_ESC_MAX = 1.5; // teto da escala de influência

function desligarMapaCalor() {
    if (!mapaCalor) return;
    mapaCalor = false;
    elBoardWorld()?.classList.remove('modo-calor');
    document.getElementById('btn-mapa-calor')?.classList.remove('ativo');
    limparCalorBoard();
    desenharLinhasBoard(); // re-ancora nas dimensões originais ao trocar de lente
}

// Cor POLÍTICA divergente (verde aliado ↔ cinza neutro ↔ vermelho inimigo) a partir do
// balanço de conexões. r = (aliados - inimigos)/total ∈ [-1,+1]; pct = |r|*100 satura a cor.
// Só tokens (Regra 2.5) — mesmo precedente da linha de diplomacia (style="stroke: var(--link-*)").
function corPoliticaHeat(aliados, inimigos) {
    const soma = aliados + inimigos;
    if (soma <= 0) return 'var(--texto-mutado)';            // sem alinhamento → neutro
    const pct = Math.round(Math.abs((aliados - inimigos) / soma) * 100);
    if (pct === 0) return 'var(--texto-mutado)';            // equilíbrio perfeito → neutro
    const token = aliados >= inimigos ? 'var(--link-aliado)' : 'var(--link-inimigo)';
    return `color-mix(in srgb, ${token} ${pct}%, var(--texto-mutado))`;
}

// Dois canais: TAMANHO/BRILHO = quantidade de conexões (pico-relativo, teto 1.5×);
// COR (borda+glow) = balanço político (aliado→verde / inimigo→vermelho). Ambos via CSS vars
// inline (--heat, --heat-cor) que a .modo-calor consome. Read-only/transitório (não toca boardState).
function pintarCalorBoard() {
    const world = elBoardWorld();
    if (!world || !mapaCalor) return;
    const bump = (m, k) => m.set(String(k), (m.get(String(k)) || 0) + 1);
    const g = (m, k) => m.get(String(k)) || 0;
    const overrides = boardState.overrides_linhas || {};

    // Grau total + por tipo político de cada nó. O tipo "visível" honra o override de cor
    // (ov.cor || lk.tipo) — a temperatura do nó casa exatamente com a cor das linhas desenhadas.
    const grauNo = new Map(), alNo = new Map(), inNo = new Map();
    boardLinks.forEach(lk => {
        bump(grauNo, lk.a); bump(grauNo, lk.b);
        const ov = overrides[chaveLinha(lk.a, lk.b)] || {};
        const t = String(ov.cor || lk.tipo || '').toLowerCase();
        if (t === 'aliado') { bump(alNo, lk.a); bump(alNo, lk.b); }
        else if (t === 'inimigo') { bump(inNo, lk.a); bump(inNo, lk.b); }
    });
    // Diplomacia por núcleo (Mundo é a fonte da verdade — read-only): total + aliado/inimigo.
    const grauNuc = new Map(), alNuc = new Map(), inNuc = new Map();
    (diplomaciaCache || []).forEach(r => {
        bump(grauNuc, r.nucleoA); bump(grauNuc, r.nucleoB);
        const s = String(r.status || '').toLowerCase();
        if (s === 'aliado') { bump(alNuc, r.nucleoA); bump(alNuc, r.nucleoB); }
        else if (s === 'inimigo') { bump(inNuc, r.nucleoA); bump(inNuc, r.nucleoB); }
    });

    // ── Nós (cards): peso/balanço = links diretos + diplomacia herdada da facção.
    const nucOf = (id) => { const i = boardNodeInfo(id); return i ? i.nucleo_id : null; };
    const diplDe = (m, id) => { const nuc = nucOf(id); return nuc != null ? g(m, nuc) : 0; };
    const pesoNo = (id) => g(grauNo, id) + diplDe(grauNuc, id);
    let maxNo = 0;
    boardState.nodes.forEach(n => { maxNo = Math.max(maxNo, pesoNo(n.id)); });
    const escalaNo = (p) => maxNo <= 0 ? 1 : 1 + (CALOR_ESC_MAX - 1) * (p / maxNo);
    world.querySelectorAll('.board-card').forEach(card => {
        const id = card.dataset.node;
        card.style.setProperty('--heat', escalaNo(pesoNo(id)).toFixed(3));
        card.style.setProperty('--heat-cor', corPoliticaHeat(g(alNo, id) + diplDe(alNuc, id), g(inNo, id) + diplDe(inNuc, id)));
    });

    // ── Células (facções): peso/balanço = diplomacia do núcleo + somatório dos membros no board.
    const membros = (nuc) => boardState.nodes.filter(n => { const i = boardNodeInfo(n.id); return i && String(i.nucleo_id) === String(nuc); });
    const somaMembros = (m, nuc) => membros(nuc).reduce((s, n) => s + g(m, n.id), 0);
    const pesoCel = (nuc) => g(grauNuc, nuc) + somaMembros(grauNo, nuc);
    let maxCel = 0;
    (boardState.celulas || []).forEach(c => { maxCel = Math.max(maxCel, pesoCel(c.nucleo_id)); });
    const escalaCel = (p) => maxCel <= 0 ? 1 : 1 + (CALOR_ESC_MAX - 1) * (p / maxCel);
    world.querySelectorAll('.board-celula').forEach(el => {
        const nuc = el.dataset.nucleo;
        el.style.setProperty('--heat', escalaCel(pesoCel(nuc)).toFixed(3));
        el.style.setProperty('--heat-cor', corPoliticaHeat(g(alNuc, nuc) + somaMembros(alNo, nuc), g(inNuc, nuc) + somaMembros(inNo, nuc)));
    });
}

// Remove a escala inline (a classe .modo-calor já foi tirada; isto é só higiene anti-resíduo).
function limparCalorBoard() {
    const world = elBoardWorld();
    if (!world) return;
    world.querySelectorAll('.board-card, .board-celula').forEach(el => {
        el.style.removeProperty('--heat'); el.style.removeProperty('--heat-cor');
    });
}

window.toggleMapaCalor = function() {
    if (!boardAtualId) return mostrarToast('Abra um tabuleiro primeiro.', 'aviso');
    const world = elBoardWorld();
    if (!world) return;
    mapaCalor = !mapaCalor;
    if (mapaCalor) {
        // Lentes não se sobrepõem na v1: sai da Lente de Destaque e da Constelação.
        const bf = document.getElementById('board-busca-foco'); if (bf) bf.value = '';
        focoTermo = ''; focoSet = null; world.classList.remove('modo-foco');
        if (modoConstelacao) toggleConstelacao(); // restaura layout + desliga a Constelação
        world.classList.add('modo-calor');
        document.getElementById('btn-mapa-calor')?.classList.add('ativo');
        pintarCalorBoard();
        desenharLinhasBoard(); // re-ancora as linhas nos boxes já escalados
    } else {
        world.classList.remove('modo-calor');
        document.getElementById('btn-mapa-calor')?.classList.remove('ativo');
        limparCalorBoard();
        desenharLinhasBoard(); // re-ancora nas dimensões originais
    }
};

// ── EVENTOS NO TABULEIRO (FASE 15) — Revelação Sob Demanda (padrão Obsidian) ──
// Os eventos NÃO poluem o board por padrão. Card de NPC envolvido em algum evento ganha um
// CRACHÁ; clicar invoca o(s) evento(s) como painel(éis) flutuante(s) EFÊMERO(S) perto do nó
// + fios até todos os gatilhos. Estado fora do boardState (read-only): boardEventosCache é o
// cache (carregado em carregarMesaGuerra) e eventosInvocados são as invocações ativas
// (`{ eventoId: {x,y} }`). Vínculo evento→nó = gatilho.node_id (de event_flag_weights).
// boardEventosCache / eventosInvocados declarados no topo do arquivo (globais).

// Set dos node ids que disparam ≥1 evento → decide quais cards recebem crachá (memo por render).
function nodesComEvento() {
    const set = new Set();
    boardEventosCache.forEach(ev => (ev.gatilhos || []).forEach(g => set.add(String(g.node_id))));
    return set;
}

// Painel flutuante do evento invocado (efêmero; não vai ao boardState). co = {x,y} da invocação.
function eventoNodeHTML(ev, co) {
    const desc = (ev.descricao || '').trim();
    const eid = escapeHTML(String(ev.id));
    return `<div class="board-evento-node" data-evento="${eid}" style="left: ${Math.round(co.x)}px; top: ${Math.round(co.y)}px;">
        <div class="evento-node-header">
            <i data-lucide="scroll-text" class="evento-node-icone"></i>
            <span class="evento-node-titulo" title="${escapeHTML(ev.nome || 'Evento')}">${escapeHTML(ev.nome || 'Evento')}</span>
            <button type="button" class="evento-node-fechar" title="Fechar" onclick="fecharEventoInvocado('${eid}')"><i data-lucide="x"></i></button>
        </div>
        <div class="evento-node-body">${desc ? escapeHTML(desc) : 'Evento sem descrição.'}</div>
    </div>`;
}

// HTML dos painéis invocados (lidos de eventosInvocados; ignora ids que sumiram do cache).
function eventosInvocadosHTML() {
    return Object.keys(eventosInvocados).map(evId => {
        const ev = boardEventosCache.find(e => String(e.id) === String(evId));
        return ev ? eventoNodeHTML(ev, eventosInvocados[evId]) : '';
    }).join('');
}

// Crachá = "Toggle Group": se ALGUM evento do nó está aberto → fecha todos; senão → abre todos
// (em cascata espaçada p/ não sobrepor; depois arrastáveis pelo header). Read-only (efêmero).
window.invocarEventosDoNode = function(nodeId, x, y) {
    const envolvidos = boardEventosCache.filter(ev => (ev.gatilhos || []).some(g => String(g.node_id) === String(nodeId)));
    if (!envolvidos.length) return;
    const algumAberto = envolvidos.some(ev => eventosInvocados[String(ev.id)]);
    if (algumAberto) {
        envolvidos.forEach(ev => { delete eventosInvocados[String(ev.id)]; });   // fecha o grupo inteiro
    } else {
        envolvidos.forEach((ev, i) => {                                          // abre em cascata (anti-stack)
            eventosInvocados[String(ev.id)] = { x: Math.round(x + i * 40), y: Math.round(y - 80 + i * 120) };
        });
    }
    renderBoard();
};

window.fecharEventoInvocado = function(eventoId) {
    delete eventosInvocados[String(eventoId)];
    renderBoard();
};

// Arrasto do painel pelo header (resolve o empilhamento). Coords de mundo = delta de tela / zoom;
// escreve direto no DOM + cache (eventosInvocados) e redesenha só as linhas a 60fps (sem renderBoard).
// Registra pointerup E pointercancel (lição Fase 14: todo drag novo trata o cancel do ponteiro).
function ativarArrastoEventos() {
    const world = elBoardWorld();
    if (!world) return;
    world.querySelectorAll('.board-evento-node').forEach(el => {
        const id = String(el.dataset.evento);
        const header = el.querySelector('.evento-node-header');
        if (!header) return;
        header.onpointerdown = (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.evento-node-fechar')) return; // botão fechar não arrasta
            const co = eventosInvocados[id];
            if (!co) return;
            e.stopPropagation();                                 // não inicia o Pan do canvas
            const z = boardState.camera.zoom || 1;
            const sx = e.clientX, sy = e.clientY, ox = co.x, oy = co.y;
            header.setPointerCapture(e.pointerId);
            el.classList.add('arrastando');
            const mv = (ev) => {
                co.x = Math.round(ox + (ev.clientX - sx) / z);
                co.y = Math.round(oy + (ev.clientY - sy) / z);
                el.style.left = co.x + 'px'; el.style.top = co.y + 'px';
                desenharLinhasBoard();                           // fios acompanham (sem re-render)
            };
            const up = () => {
                el.classList.remove('arrastando');
                header.removeEventListener('pointermove', mv);
                header.removeEventListener('pointerup', up);
                header.removeEventListener('pointercancel', up);
            };
            header.addEventListener('pointermove', mv);
            header.addEventListener('pointerup', up);
            header.addEventListener('pointercancel', up);
        };
    });
}

// Visibilidade das conexões (view-only; não persiste em boardState). A classe vive no
// board-canvas, que sobrevive aos re-renders do board-world.
window.toggleLinhasBoard = function(btn) {
    const canvas = elBoardCanvas();
    if (!canvas) return;
    const ocultas = canvas.classList.toggle('board-linhas-ocultas');
    btn.title = ocultas ? 'Mostrar conexões' : 'Ocultar conexões';
    btn.innerHTML = `<i data-lucide="${ocultas ? 'eye-off' : 'eye'}"></i>`;
    lucide.createIcons({ elements: btn.querySelectorAll('[data-lucide]') });
};

// Plano de fundo da mesa (pontilhado/grade/liso). Muta boardState.fundo e repinta o
// canvas via aplicarCamera (que aplica o passo anti-Moiré). Persiste só no Salvar (Regra 2.7).
window.mudarFundoBoard = function(v) { boardState.fundo = v; aplicarCamera(); };

// ── IMAGEM DE FUNDO (Fase 15 — Atualização Imersiva, Fatias 1a/1b) ──────────
// Upload reusa o pipeline /midia/upload/fundos (Sharp→WebP, nomes hash; Regras 6.3/6.5).
// Define o rect centrado no mundo com o tamanho natural (Sharp já limita a 1920×1080).
// Efêmero até Salvar (Regra 2.7). Sem URL externa (decisão 7.0.1) → sem superfície de XSS.
// ajustandoFundo (transitório, fora do boardState): no modo de ajuste o fundo sobe e fica
// arrastável/redimensionável; fora dele é pointer-events:none (pan livre por cima do mapa).
let ajustandoFundo = false;
window.onFundoSelecionado = async function(input) {
    const arquivo = input.files && input.files[0];
    input.value = ''; // permite re-selecionar o mesmo arquivo depois
    if (!arquivo) return;
    if (!boardAtualId) return mostrarToast('Abra um tabuleiro primeiro.', 'aviso');
    const fd = new FormData();
    fd.append('imagens', arquivo);
    let url;
    try {
        const res = await API.fetch('/midia/upload/fundos', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.urls || !data.urls[0]) throw new Error(data.erro || 'Falha no upload.');
        url = data.urls[0];
    } catch (e) { return mostrarToast(e.message || 'Erro ao enviar imagem.', 'erro'); }
    const img = new Image();
    img.onload = () => {
        const c = centroMundo();
        const w = img.naturalWidth || 800, h = img.naturalHeight || 600;
        boardState.fundoImagem = { url, x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h, opacidade: 1 };
        renderBoard();
        mostrarToast('Imagem de fundo aplicada. Use Salvar para persistir.', 'sucesso');
    };
    img.onerror = () => mostrarToast('Imagem inválida.', 'erro');
    img.src = url;
};
window.removerFundoBoard = function() {
    if (!boardState.fundoImagem) return mostrarToast('Não há imagem de fundo.', 'aviso');
    boardState.fundoImagem = null;
    ajustandoFundo = false; // sai do modo de ajuste (não há mais o que ajustar)
    document.getElementById('btn-ajustar-fundo')?.classList.remove('ativo');
    sincronizarControlesFundo();
    renderBoard();
    mostrarToast('Imagem de fundo removida. Use Salvar para persistir.', 'aviso');
};

// Modo de ajuste (Fatia 1b): liga/desliga o posicionamento do fundo. No modo, o fundo sobe
// (z-index), ganha moldura + handle e fica arrastável; fora, volta a ser fundo pannável.
window.toggleAjusteFundo = function() {
    if (!boardState.fundoImagem) return mostrarToast('Não há imagem de fundo para ajustar.', 'aviso');
    ajustandoFundo = !ajustandoFundo;
    document.getElementById('btn-ajustar-fundo')?.classList.toggle('ativo', ajustandoFundo);
    sincronizarControlesFundo(); // opacidade + aumentar/diminuir só aparecem no modo de ajuste
    renderBoard();
    if (ajustandoFundo) mostrarToast('Use + / − para aumentar/diminuir (proporcional); arraste para mover; o canto redimensiona livre; o slider muda a opacidade. Clique de novo p/ concluir.', 'sucesso');
};
// Mostra/esconde o slider de opacidade conforme o modo de ajuste e reflete o valor atual.
function sincronizarControlesFundo() {
    const ativo = ajustandoFundo && !!boardState.fundoImagem;
    document.querySelectorAll('.board-fundo-ctrl').forEach(el => { el.hidden = !ativo; }); // opacidade + zoom
    const slider = document.getElementById('board-fundo-opacidade');
    if (ativo && slider) slider.value = (typeof boardState.fundoImagem.opacidade === 'number') ? boardState.fundoImagem.opacidade : 1;
}
// Opacidade do fundo (live, sem re-render). Persiste em boardState.fundoImagem (Salvar).
window.setOpacidadeFundo = function(v) {
    if (!boardState.fundoImagem) return;
    const o = Math.min(1, Math.max(0.1, parseFloat(v) || 1));
    boardState.fundoImagem.opacidade = o;
    const el = elBoardWorld()?.querySelector('.board-imagem-fundo');
    if (el) el.style.opacity = o;
};
// Aumenta/diminui o fundo PROPORCIONALMENTE (mantém o aspecto, ao contrário da alça livre),
// crescendo/encolhendo no LUGAR (centro fixo). Clampa o fator p/ nenhum lado ficar < 40px.
window.escalarFundo = function(fator) {
    const fi = boardState.fundoImagem;
    if (!fi) return;
    const f = Math.max(fator, 40 / Math.min(fi.w, fi.h)); // piso de 40px preservando proporção
    const nw = Math.round(fi.w * f), nh = Math.round(fi.h * f);
    fi.x = Math.round(fi.x + (fi.w - nw) / 2);
    fi.y = Math.round(fi.y + (fi.h - nh) / 2);
    fi.w = nw; fi.h = nh;
    renderBoard();
};

// Mover (corpo) + redimensionar (canto) o fundo, só no modo de ajuste. Coords de mundo =
// delta/zoom; escreve no DOM + boardState.fundoImagem (persiste no Salvar). pointerup+pointercancel.
function ativarInteracoesFundo() {
    if (!ajustandoFundo) return;
    const world = elBoardWorld();
    const el = world && world.querySelector('.board-imagem-fundo');
    const fi = boardState.fundoImagem;
    if (!el || !fi) return;
    el.onpointerdown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.board-fundo-resize')) return; // handle trata o resize
        e.stopPropagation();
        const z = boardState.camera.zoom || 1;
        const sx = e.clientX, sy = e.clientY, ox = fi.x, oy = fi.y;
        el.setPointerCapture(e.pointerId);
        el.classList.add('arrastando');
        const mv = (ev) => { fi.x = Math.round(ox + (ev.clientX - sx) / z); fi.y = Math.round(oy + (ev.clientY - sy) / z); el.style.left = fi.x + 'px'; el.style.top = fi.y + 'px'; };
        const up = () => { el.classList.remove('arrastando'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    const handle = el.querySelector('.board-fundo-resize');
    if (handle) handle.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const z = boardState.camera.zoom || 1;
        const sx = e.clientX, sy = e.clientY, ow = fi.w, oh = fi.h;
        handle.setPointerCapture(e.pointerId);
        const mv = (ev) => { fi.w = Math.max(40, Math.round(ow + (ev.clientX - sx) / z)); fi.h = Math.max(40, Math.round(oh + (ev.clientY - sy) / z)); el.style.width = fi.w + 'px'; el.style.height = fi.h + 'px'; };
        const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
        handle.addEventListener('pointermove', mv); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
    };
}

window.removerNodeBoard = function(nodeId) {
    fecharPopover(); // evita popover órfão quando a exclusão vem do editor
    boardState.nodes = boardState.nodes.filter(n => String(n.id) !== String(nodeId));
    renderBoard();
    atualizarLinksBoard();
};

// Pan (arrastar o fundo) + Zoom (wheel para o cursor). Ligado UMA vez ao canvas.
function ativarPanZoom() {
    const canvas = elBoardCanvas();
    if (!canvas || canvas.dataset.bound === '1') return;
    canvas.dataset.bound = '1';
    // R5: clicar fora de um popover (em qualquer lugar) fecha os popovers ativos.
    document.addEventListener('pointerdown', (e) => {
        if (!document.getElementById('board-popover')) return;
        if (e.target.closest('.board-popover')) return;
        fecharPopover();
    }, true);
    canvas.addEventListener('pointerdown', (e) => {
        if (!boardAtualId || e.button !== 0) return;
        if (e.target.closest('.board-card, .board-celula, .board-shape:not(.is-travada), .board-prop, .board-text, .board-evento-node, .board-line-hit, .board-popover')) return; // não panja sobre elementos (mas a zona FIXA conta como fundo → pode panjar)
        // clique no fundo: cancela o modo de conexão pendente.
        if (conectandoDe) { conectandoDe = null; canvas.classList.remove('conectando'); }
        boardPan = { sx: e.clientX, sy: e.clientY, ox: boardState.camera.x, oy: boardState.camera.y };
        canvas.classList.add('panning');
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!boardPan) return;
        boardState.camera.x = boardPan.ox + (e.clientX - boardPan.sx);
        boardState.camera.y = boardPan.oy + (e.clientY - boardPan.sy);
        aplicarCamera();
    });
    const fimPan = () => { boardPan = null; canvas.classList.remove('panning'); };
    canvas.addEventListener('pointerup', fimPan);
    canvas.addEventListener('pointercancel', fimPan);
    canvas.addEventListener('wheel', (e) => {
        if (!boardAtualId) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const cam = boardState.camera;
        const fator = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        // Range do zoom: [0.05, 4]. O MÍNIMO (mais zoom-out) tem de espelhar o validador Zod
        // do save (mundoValidator dadosBoardSchema.camera.zoom.min) — senão salvar dá 400.
        const novo = Math.min(4, Math.max(0.05, cam.zoom * fator));
        cam.x = mx - ((mx - cam.x) / cam.zoom) * novo; // zoom em direção ao cursor
        cam.y = my - ((my - cam.y) / cam.zoom) * novo;
        cam.zoom = novo;
        aplicarCamera();
    }, { passive: false });
}

// Modal "+ Entidade": lista nós da crônica fora do tabuleiro; ao escolher, adiciona
// no centro da viewport (convertido para coordenadas de mundo).
window.abrirSeletorEntidade = function() {
    if (!boardAtualId) return mostrarToast('Abra ou crie um tabuleiro primeiro.', 'aviso');
    fecharSeletorEntidade();
    const noBoard = new Set(boardState.nodes.map(n => String(n.id)));
    const disp = boardNodesCache.filter(n => !noBoard.has(String(n.id)));
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-board-entidade';
    modal.innerHTML = `
        <div class="modal-box board-entidade-box">
            <div class="modal-head">
                <h3 class="texto-roxo modal-titulo"><i data-lucide="plus-circle"></i> Adicionar Entidade</h3>
                <button class="btn btn-ghost btn-sm" onclick="fecharSeletorEntidade()" title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <input type="text" id="busca-entidade-board" class="input-sm board-entidade-busca" placeholder="Buscar por nome ou tipo..." oninput="filtrarEntidadesBoard(this.value)">
            <div class="board-entidade-lista">
                ${disp.length ? disp.map(n => `<button type="button" class="btn btn-outline btn-sm btn-entidade-board" data-id="${escapeHTML(String(n.id))}" data-nome="${escapeHTML(n.nome.toLowerCase())}" data-tipo="${escapeHTML(n.tipo.toLowerCase())}" onclick="adicionarEntidadeBoard(this.dataset.id)"><i data-lucide="${iconeEntidade(n.tipo)}"></i> ${escapeHTML(n.nome)} <span class="board-card-tipo">${escapeHTML(n.tipo)}</span></button>`).join('')
                    : '<div class="info-block-vazio">Todas as entidades já estão no tabuleiro.</div>'}
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharSeletorEntidade(); });
    lucide.createIcons();
};
window.fecharSeletorEntidade = function() {
    const m = document.getElementById('modal-board-entidade'); if (m) m.remove();
};
// Filtro client-side da lista do modal (sem refetch): casa o termo contra nome OU tipo
// via data-attrs já normalizados (lowercase). Alterna só o display dos botões.
window.filtrarEntidadesBoard = function(termo) {
    const modal = document.getElementById('modal-board-entidade');
    if (!modal) return;
    const t = String(termo || '').toLowerCase().trim();
    modal.querySelectorAll('.btn-entidade-board').forEach(btn => {
        const ok = (btn.dataset.nome || '').includes(t) || (btn.dataset.tipo || '').includes(t);
        btn.style.display = ok ? 'flex' : 'none';
    });
};
window.adicionarEntidadeBoard = function(nodeId) {
    if (boardState.nodes.some(n => String(n.id) === String(nodeId))) return;
    const canvas = elBoardCanvas();
    const cam = boardState.camera;
    const cw = canvas ? canvas.clientWidth : 800, ch = canvas ? canvas.clientHeight : 600;
    // centro da viewport em coords de mundo + jitter ±20px (cards não ficam invisíveis
    // exatamente uns sob os outros ao adicionar vários em sequência).
    const jitter = () => Math.round((Math.random() - 0.5) * 40);
    const wx = Math.round((cw / 2 - cam.x) / cam.zoom - 90) + jitter();
    const wy = Math.round((ch / 2 - cam.y) / cam.zoom - 32) + jitter();
    boardState.nodes.push({ id: nodeId, x: wx, y: wy });
    fecharSeletorEntidade();
    renderBoard();
    atualizarLinksBoard();
};

// ── CÉLULAS DE NÚCLEO (FASE 14 — Smart Containers) ─────────────────────────
// Núcleos vivem em entidade_nucleos (nucleosCache.entidade), NÃO em world_nodes.
// Um node sabe seu núcleo por world_nodes.nucleo_id (vem no boardNodesCache).
const CELULA_HEADER_H = 40, CELULA_PAD = 16, MEMBRO_W = 180, MEMBRO_H = 64, MEMBRO_GAP = 12;
const CELULA_MIN_W = 220, CELULA_MIN_H = 140; // resize: cabe pelo menos 1 card + paddings

window.abrirSeletorNucleoBoard = async function() {
    if (!boardAtualId) return mostrarToast('Abra ou crie um tabuleiro primeiro.', 'aviso');
    if (nucleosCache.entidade.length === 0) await carregarNucleos('entidade');
    fecharSeletorNucleoBoard();
    const jaNoBoard = new Set((boardState.celulas || []).map(c => String(c.nucleo_id)));
    const disp = nucleosCache.entidade.filter(n => !jaNoBoard.has(String(n.id)));
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-board-nucleo';
    modal.innerHTML = `
        <div class="modal-box board-entidade-box">
            <div class="modal-head">
                <h3 class="texto-roxo modal-titulo"><i data-lucide="users"></i> Importar Núcleo</h3>
                <button class="btn btn-ghost btn-sm" onclick="fecharSeletorNucleoBoard()" title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <div class="board-entidade-lista">
                ${disp.length ? disp.map(n => `<button type="button" class="btn btn-outline btn-sm btn-entidade-board" data-id="${escapeHTML(String(n.id))}" onclick="importarCelulaBoard(this.dataset.id)"><i data-lucide="users"></i> ${escapeHTML(n.nome)}</button>`).join('')
                    : '<div class="info-block-vazio">Nenhum núcleo disponível (todos já estão no tabuleiro, ou não há núcleos de entidade).</div>'}
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharSeletorNucleoBoard(); });
    lucide.createIcons();
};
window.fecharSeletorNucleoBoard = function() {
    const m = document.getElementById('modal-board-nucleo'); if (m) m.remove();
};

window.importarCelulaBoard = function(nucleoId) {
    if (!boardState.celulas) boardState.celulas = [];                 // defensivo (boards antigos)
    if (boardState.celulas.some(c => String(c.nucleo_id) === String(nucleoId))) { fecharSeletorNucleoBoard(); return; }
    const centro = centroMundo();
    const W = 400, H = 300;
    const celula = {
        id: novoIdLocal('cel'), nucleo_id: nucleoId,
        x: Math.round(centro.x - W / 2), y: Math.round(centro.y - H / 2),
        w: W, h: H, minimizada: false, cor: 'roxo'
    };
    boardState.celulas.push(celula);
    // Auto-importa os membros do núcleo que ainda não estão no tabuleiro.
    const noBoard = new Set(boardState.nodes.map(n => String(n.id)));
    boardNodesCache
        .filter(n => String(n.nucleo_id) === String(nucleoId))
        .forEach(m => { if (!noBoard.has(String(m.id))) boardState.nodes.push({ id: m.id, x: celula.x, y: celula.y }); });
    organizarMembrosNaCelula(celula);   // arruma TODOS os membros numa grade dentro da célula
    fecharSeletorNucleoBoard();
    renderBoard();
    atualizarLinksBoard();
};

// Membros de um núcleo presentes no tabuleiro (board node + info do cache).
function membrosDaCelula(nucleoId) {
    return boardState.nodes.filter(n => {
        const info = boardNodeInfo(n.id);
        return info && String(info.nucleo_id) === String(nucleoId);
    });
}

// Nº de colunas que cabem na largura atual da célula.
function colsDaCelula(c) {
    return Math.max(1, Math.floor((c.w - CELULA_PAD * 2 + MEMBRO_GAP) / (MEMBRO_W + MEMBRO_GAP)));
}
// Posiciona os membros numa grade dentro da célula (largura atual). SÓ posiciona — não
// mexe na altura (usado no resize ao vivo). Devolve a lista de membros (na ordem da grade).
function reflowMembrosCelula(c) {
    const membros = membrosDaCelula(c.nucleo_id);
    const cols = colsDaCelula(c);
    membros.forEach((n, i) => {
        n.x = Math.round(c.x + CELULA_PAD + (i % cols) * (MEMBRO_W + MEMBRO_GAP));
        n.y = Math.round(c.y + CELULA_HEADER_H + CELULA_PAD + Math.floor(i / cols) * (MEMBRO_H + MEMBRO_GAP));
    });
    return membros;
}
// Altura exata p/ caber as linhas atuais de membros (cabeçalho + paddings + grade).
function alturaConteudoCelula(c) {
    const linhas = Math.max(1, Math.ceil(membrosDaCelula(c.nucleo_id).length / colsDaCelula(c)));
    return CELULA_HEADER_H + CELULA_PAD * 2 + linhas * MEMBRO_H + (linhas - 1) * MEMBRO_GAP;
}
// Importação / "Reorganizar": reflow + cresce a altura p/ caber todas as linhas
// (nunca encolhe abaixo do tamanho pedido).
function organizarMembrosNaCelula(c) {
    const membros = reflowMembrosCelula(c);
    if (!membros.length) return;
    c.h = Math.max(c.h, alturaConteudoCelula(c));
}

function celulaHTML(c) {
    const cor = CORES_BOARD.includes(c.cor) ? c.cor : 'roxo';   // SEMPRE board-cor-* (evita prender o --board-accent)
    const nucleo = nucleosCache.entidade.find(n => String(n.id) === String(c.nucleo_id));
    const nome = nucleo ? nucleo.nome : 'Núcleo';
    const cid = escapeHTML(String(c.id));
    // height inline só quando expandida; minimizada → a CSS (.is-minimizada) assume a altura.
    const dims = `left: ${Math.round(c.x)}px; top: ${Math.round(c.y)}px; width: ${Math.round(c.w)}px;`
               + (c.minimizada ? '' : ` height: ${Math.round(c.h)}px;`);
    return `<div class="board-celula board-cor-${cor}${c.minimizada ? ' is-minimizada' : ''}" data-celula="${cid}" data-nucleo="${escapeHTML(String(c.nucleo_id))}" style="${dims}">
        <div class="board-celula-header">
            <span class="board-celula-thumb">
                <i data-lucide="users" class="board-celula-icone"></i>
                ${nucleo?.avatar_url ? `<img class="board-celula-avatar" src="${escapeHTML(nucleo.avatar_url)}" alt="" draggable="false" onerror="this.remove()">` : ''}
            </span>
            <span class="board-celula-nome" title="${escapeHTML(nome)}">${escapeHTML(nome)}</span>
            <button type="button" class="board-celula-btn" title="${c.minimizada ? 'Expandir' : 'Minimizar'}" onclick="toggleMinimizarCelula('${cid}')"><i data-lucide="${c.minimizada ? 'plus' : 'minus'}"></i></button>
            <button type="button" class="board-celula-btn" title="Opções do núcleo" onclick="abrirEditorCelula('${cid}', event)"><i data-lucide="settings"></i></button>
        </div>
        ${c.minimizada ? '' : '<span class="board-celula-resize" title="Redimensionar"></span>'}
    </div>`;
}

window.toggleMinimizarCelula = function(id) {
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id));
    if (!c) return;
    c.minimizada = !c.minimizada;
    renderBoard();
};

// Popover de opções da célula: cor da facção (token), reorganizar em grade,
// desimportar (remove só a moldura, mantém os cards) e remover (moldura + cards).
window.abrirEditorCelula = function(id, e) {
    fecharPopover();
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id)); if (!c) return;
    const cid = escapeHTML(String(id));
    const nucleo = nucleosCache.entidade.find(n => String(n.id) === String(c.nucleo_id));
    const nome = nucleo ? nucleo.nome : 'Núcleo';
    const total = membrosDaCelula(c.nucleo_id).length;
    const swatch = k => `<button type="button" class="board-cor-swatch board-cor-${k}${c.cor === k ? ' sel' : ''}" data-c="${k}" title="${k}" onclick="setCelulaCor('${cid}', this)"></button>`;
    const pop = montarPopover(`
        <div class="board-popover-info"><i data-lucide="users"></i> ${escapeHTML(nome)} <span class="badge">${total}</span></div>
        <label>Cor da facção</label>
        <div class="board-cor-grid">${CORES_BOARD.map(swatch).join('')}</div>
        <label>Largura (<span id="board-celula-larg">${Math.round(c.w)}</span>px)</label>
        <input type="range" class="board-popover-range" min="${CELULA_MIN_W}" max="1200" step="20" value="${Math.round(c.w)}" oninput="setCelulaLargura('${cid}', this.value)">
        <label>Altura (<span id="board-celula-alt">${Math.round(c.h)}</span>px)</label>
        <input type="range" class="board-popover-range" min="${CELULA_MIN_H}" max="900" step="20" value="${Math.round(c.h)}" oninput="setCelulaAltura('${cid}', this.value)">
        <div class="board-popover-acoes board-popover-acoes--coluna">
            <button class="btn btn-outline btn-sm" onclick="ressincronizarCelula('${cid}')"><i data-lucide="refresh-cw"></i> Sincronizar membros</button>
            <button class="btn btn-outline btn-sm" onclick="reorganizarCelula('${cid}')"><i data-lucide="layout-grid"></i> Reorganizar em grade</button>
            <button class="btn btn-outline btn-sm" onclick="desimportarCelula('${cid}')"><i data-lucide="package-open"></i> Remover célula</button>
            <button class="btn btn-danger btn-sm" onclick="removerCelulaBoard('${cid}')"><i data-lucide="trash-2"></i> Remover célula e cards</button>
        </div>`);
    elBoardCanvas().appendChild(pop);
    lucide.createIcons();
    posicionarPopover(pop, e, document.querySelector(`.board-celula[data-celula="${cssEscape(id)}"]`));
};
window.setCelulaCor = function(id, btn) {
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id)); if (!c) return;
    if (!CORES_BOARD.includes(btn.dataset.c)) return;
    c.cor = btn.dataset.c;
    btn.parentElement.querySelectorAll('.board-cor-swatch').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    const el = document.querySelector(`.board-celula[data-celula="${cssEscape(id)}"]`);
    if (el) { CORES_BOARD.forEach(k => el.classList.remove('board-cor-' + k)); el.classList.add('board-cor-' + c.cor); }
};
// Largura via slider do popover: re-flui a grade e ajusta a altura ao conteúdo, ao vivo.
window.setCelulaLargura = function(id, v) {
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id)); if (!c) return;
    c.w = Math.max(CELULA_MIN_W, Math.min(1200, parseInt(v, 10) || CELULA_MIN_W));
    const membros = reflowMembrosCelula(c);
    c.h = Math.max(c.h, alturaConteudoCelula(c)); // respeita a altura manual; só cresce p/ caber
    const el = document.querySelector(`.board-celula[data-celula="${cssEscape(id)}"]`);
    if (el) { el.style.width = c.w + 'px'; if (!c.minimizada) el.style.height = c.h + 'px'; }
    membros.forEach(n => {
        const cd = document.querySelector(`.board-card[data-node="${cssEscape(n.id)}"]`);
        if (cd) { cd.style.left = n.x + 'px'; cd.style.top = n.y + 'px'; }
    });
    const lblW = document.getElementById('board-celula-larg'); if (lblW) lblW.textContent = c.w;
    const lblH = document.getElementById('board-celula-alt'); if (lblH) lblH.textContent = c.h;
    desenharLinhasBoard();
};
// Altura via slider (manual). A grade é ancorada no topo, então não re-flui; a linha de
// diplomacia/entidade ancora no centro da célula → segue a nova altura (desenharLinhasBoard).
window.setCelulaAltura = function(id, v) {
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id)); if (!c) return;
    c.h = Math.max(CELULA_MIN_H, Math.min(900, parseInt(v, 10) || CELULA_MIN_H));
    const el = document.querySelector(`.board-celula[data-celula="${cssEscape(id)}"]`);
    if (el && !c.minimizada) el.style.height = c.h + 'px';
    const lbl = document.getElementById('board-celula-alt'); if (lbl) lbl.textContent = c.h;
    desenharLinhasBoard();
};
window.reorganizarCelula = function(id) {
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id)); if (!c) return;
    organizarMembrosNaCelula(c);
    fecharPopover();
    renderBoard();
};
// Re-sincroniza com o estado ATUAL do núcleo: re-busca os nós (o nucleo_id pode ter mudado
// na aba Mundo), importa membros novos que ainda não estão no tabuleiro e re-arruma a grade.
// Não remove cards — quem saiu do núcleo apenas deixa de ser agrupado (membership dinâmica).
window.ressincronizarCelula = async function(id) {
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id)); if (!c) return;
    fecharPopover();
    try { boardNodesCache = await MundoApi.getNodes(cronicaId); }
    catch (e) { return mostrarToast('Erro ao sincronizar entidades.', 'erro'); }
    const noBoard = new Set(boardState.nodes.map(n => String(n.id)));
    let novos = 0;
    boardNodesCache.filter(n => String(n.nucleo_id) === String(c.nucleo_id)).forEach(m => {
        if (!noBoard.has(String(m.id))) { boardState.nodes.push({ id: m.id, x: c.x, y: c.y }); novos++; }
    });
    organizarMembrosNaCelula(c); // re-arruma (puxa os novos + quem migrou para este núcleo)
    renderBoard();
    atualizarLinksBoard();
    mostrarToast(novos ? `${novos} novo(s) membro(s) importado(s).` : 'Núcleo já sincronizado.', novos ? 'sucesso' : 'aviso');
};
// Desimporta: tira a moldura, mas os cards-membros permanecem onde estão.
window.desimportarCelula = function(id) {
    fecharPopover();
    boardState.celulas = (boardState.celulas || []).filter(c => String(c.id) !== String(id));
    renderBoard();
};
// Remove a célula E os cards dos seus membros do tabuleiro (reversível por re-importar;
// nada persiste até Salvar — Regra 2.7).
window.removerCelulaBoard = function(id) {
    fecharPopover();
    const c = (boardState.celulas || []).find(x => String(x.id) === String(id)); if (!c) return;
    const nucleoId = String(c.nucleo_id);
    boardState.nodes = boardState.nodes.filter(n => {
        const info = boardNodeInfo(n.id);
        return !(info && String(info.nucleo_id) === nucleoId);
    });
    boardState.celulas = boardState.celulas.filter(x => String(x.id) !== String(id));
    renderBoard();
    atualizarLinksBoard(); // recalcula linhas (cards removidos)
};

// ============================================
// MODO CONSTELAÇÃO (FASE 14) — lente force-directed dos núcleos (Regra 7: só apresentação,
// TRANSITÓRIA; o layout salvo é preservado via snapshot). Física hand-rolled (Regra 1 — sem
// libs). Read-only: nada persiste; sair restaura o snapshot.
// ============================================
const FIS_DIST_IDEAL  = 350;   // distância-alvo das molas de diplomacia
const FIS_REP_DIST    = 600;   // raio de repulsão (magnético, longo alcance)
const FIS_REP_FORCA   = 4000;  // intensidade da repulsão (inverse-linear: forca/max(dist,10))
const FIS_MOLA        = 0.015; // rigidez da mola (neutro/inimigo)
const FIS_MOLA_ALIADO = 0.03;  // aliados puxam mais (distância menor)
const FIS_GRAV        = 0.01;  // gravidade ao centro (anti-fuga)
const FIS_ATRITO      = 0.55;  // amortecimento pesado → assenta em <2s (perde 45%/frame)
const FIS_VMAX        = 12;    // teto de velocidade por frame (estabilidade)
const FIS_PARADA      = 2.5;   // sleep threshold (energia média/célula): "dorme" cedo (<2s)

window.toggleConstelacao = function() {
    if (!boardAtualId) return mostrarToast('Abra um tabuleiro primeiro.', 'aviso');
    modoConstelacao = !modoConstelacao;
    elBoardWorld()?.classList.toggle('modo-constelacao', modoConstelacao); // orbes via CSS
    const btn = document.getElementById('btn-constelacao');
    if (modoConstelacao) {
        // Lentes não se sobrepõem na v1: sai da Lente de Destaque e do Mapa de Calor.
        const bf = document.getElementById('board-busca-foco'); if (bf) bf.value = '';
        focoTermo = ''; focoSet = null; elBoardWorld()?.classList.remove('modo-foco');
        desligarMapaCalor();
        eventosInvocados = {}; // a Constelação esconde os cards: dispensa os painéis de evento (anti-órfão)
        // Snapshot do layout original (read-only): células E nodes (membros) p/ restaurar 100%.
        constelacaoSnapshot = (boardState.celulas || []).map(c => ({ id: c.id, x: c.x, y: c.y, w: c.w, h: c.h, minimizada: !!c.minimizada }));
        constelacaoSnapshotNodes = JSON.parse(JSON.stringify(boardState.nodes)); // clone profundo
        (boardState.celulas || []).forEach(c => { c.minimizada = true; });
        btn && btn.classList.add('ativo');
        renderBoard();                // re-render minimizado (membros somem)
        iniciarFisicaConstelacao();
    } else {
        pararFisicaConstelacao();
        const snap = {}; constelacaoSnapshot.forEach(s => { snap[String(s.id)] = s; });
        (boardState.celulas || []).forEach(c => {
            const s = snap[String(c.id)]; if (!s) return;
            c.x = s.x; c.y = s.y; c.w = s.w; c.h = s.h; c.minimizada = s.minimizada; // restaura célula
        });
        if (constelacaoSnapshotNodes) boardState.nodes = constelacaoSnapshotNodes; // restaura membros
        constelacaoSnapshot = []; constelacaoSnapshotNodes = null;
        btn && btn.classList.remove('ativo');
        renderBoard();
    }
};

function iniciarFisicaConstelacao() {
    constelacaoFisica = {}; // velocidades por id — vivem SÓ aqui (não poluem boardState)
    if (constelacaoRAF) cancelAnimationFrame(constelacaoRAF);
    constelacaoRAF = requestAnimationFrame(tickFisica);
}
function pararFisicaConstelacao() {
    if (constelacaoRAF) cancelAnimationFrame(constelacaoRAF);
    constelacaoRAF = null;
    constelacaoFisica = null;
}

// Um frame: molas (diplomacia) + repulsão (Coulomb) + gravidade → integra velocidade →
// escreve DIRETO no DOM (sem renderBoard) + redesenha linhas. Para quando assenta.
function tickFisica() {
    constelacaoRAF = null; // este frame já disparou; rearma no fim se ainda houver energia
    if (!modoConstelacao) return;
    const cels = boardState.celulas || [];
    if (!cels.length) return;
    const centro = centroMundo();
    const F = {};
    cels.forEach(c => { F[c.id] = { x: 0, y: 0 }; });

    // Atração — molas de diplomacia (só pares com célula no tabuleiro).
    (diplomaciaCache || []).forEach(rel => {
        const a = cels.find(c => String(c.nucleo_id) === String(rel.nucleoA));
        const b = cels.find(c => String(c.nucleo_id) === String(rel.nucleoB));
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const k = rel.status === 'aliado' ? FIS_MOLA_ALIADO : FIS_MOLA;
        const f = (dist - FIS_DIST_IDEAL) * k;       // >0 aproxima, <0 afasta
        const ux = dx / dist, uy = dy / dist;
        F[a.id].x += ux * f; F[a.id].y += uy * f;
        F[b.id].x -= ux * f; F[b.id].y -= uy * f;
    });

    // Repulsão (Coulomb) entre todos os pares dentro do raio.
    for (let i = 0; i < cels.length; i++) {
        for (let j = i + 1; j < cels.length; j++) {
            const a = cels[i], b = cels[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            if (dist >= FIS_REP_DIST) continue;
            const f = FIS_REP_FORCA / Math.max(dist, 40); // soft-clamp: piso 40 evita pico de força (jitter) a curta distância
            const ux = dx / dist, uy = dy / dist;
            F[a.id].x -= ux * f; F[a.id].y -= uy * f;
            F[b.id].x += ux * f; F[b.id].y += uy * f;
        }
    }

    // Gravidade ao centro da viewport (anti-fuga ao infinito).
    cels.forEach(c => { F[c.id].x += (centro.x - c.x) * FIS_GRAV; F[c.id].y += (centro.y - c.y) * FIS_GRAV; });

    // Integração (Euler + atrito) + escrita direta no DOM. Célula arrastada = massa infinita.
    const world = elBoardWorld();
    let energia = 0;
    cels.forEach(c => {
        const v = constelacaoFisica[c.id] || (constelacaoFisica[c.id] = { vx: 0, vy: 0 });
        if (String(c.id) === String(celulaArrastandoId)) { v.vx = 0; v.vy = 0; return; }
        v.vx = Math.max(-FIS_VMAX, Math.min(FIS_VMAX, (v.vx + F[c.id].x) * FIS_ATRITO));
        v.vy = Math.max(-FIS_VMAX, Math.min(FIS_VMAX, (v.vy + F[c.id].y) * FIS_ATRITO));
        c.x = Math.round(c.x + v.vx);
        c.y = Math.round(c.y + v.vy);
        energia += Math.abs(v.vx) + Math.abs(v.vy);
        const el = world && world.querySelector(`.board-celula[data-celula="${cssEscape(c.id)}"]`);
        if (el) { el.style.left = c.x + 'px'; el.style.top = c.y + 'px'; }
    });
    desenharLinhasBoard(); // linhas de diplomacia seguem organicamente a 60fps

    // Assenta: para o loop quando a energia média é baixa e ninguém está arrastando.
    if (energia / cels.length < FIS_PARADA && !celulaArrastandoId) return;
    constelacaoRAF = requestAnimationFrame(tickFisica);
}

// Arrasto em bando: arrastar a célula move a célula + todos os cards do seu núcleo.
function ativarArrastoCelulas() {
    const world = elBoardWorld();
    if (!world) return;
    // Mapa data-node → elemento (sem querySelector por id especial; barato — só no render).
    const cardEls = {};
    world.querySelectorAll('.board-card').forEach(cd => { cardEls[cd.dataset.node] = cd; });

    world.querySelectorAll('.board-celula').forEach(el => {
        const c = (boardState.celulas || []).find(x => String(x.id) === String(el.dataset.celula));
        if (!c) return;
        el.onpointerdown = (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.board-celula-btn, .board-celula-resize')) return; // botões/handle não arrastam
            e.stopPropagation();                                  // não inicia o Pan do canvas
            const z = boardState.camera.zoom || 1;
            const sx = e.clientX, sy = e.clientY, ox = c.x, oy = c.y;
            // Snapshot dos membros 1x no pointerdown (move só faz aritmética + writes → leve).
            const membros = membrosDaCelula(c.nucleo_id).map(n => ({ node: n, el: cardEls[String(n.id)], ox: n.x, oy: n.y }));
            el.setPointerCapture(e.pointerId);
            el.classList.add('arrastando-grupo');
            celulaArrastandoId = c.id; // massa infinita no modo Constelação (a física não a move)
            if (modoConstelacao && !constelacaoRAF) constelacaoRAF = requestAnimationFrame(tickFisica); // reanima ao arrastar
            membros.forEach(m => m.el && m.el.classList.add('arrastando-grupo'));
            const mv = (ev) => {
                const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
                c.x = Math.round(ox + dx); c.y = Math.round(oy + dy);
                el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
                if (!modoConstelacao) { // na Constelação arrasta SÓ a célula (membros ficam no lugar p/ o snapshot)
                    for (const m of membros) {
                        m.node.x = Math.round(m.ox + dx); m.node.y = Math.round(m.oy + dy);
                        if (m.el) { m.el.style.left = m.node.x + 'px'; m.el.style.top = m.node.y + 'px'; }
                    }
                }
                desenharLinhasBoard();   // linhas seguem (paridade c/ o arrasto de card)
            };
            const up = () => {
                celulaArrastandoId = null; // solta a "massa infinita"
                el.classList.remove('arrastando-grupo');
                membros.forEach(m => m.el && m.el.classList.remove('arrastando-grupo'));
                el.removeEventListener('pointermove', mv);
                el.removeEventListener('pointerup', up);
                el.removeEventListener('pointercancel', up);
            };
            el.addEventListener('pointermove', mv);
            el.addEventListener('pointerup', up);
            el.addEventListener('pointercancel', up); // navegador cancela o ponteiro → solta mesmo assim
        };
        // Resize pelo canto: muda w/h e RE-FLUI a grade dos membros ao vivo conforme a
        // nova largura (só posiciona; a altura é manual aqui). Leve: aritmética + writes.
        const handle = el.querySelector('.board-celula-resize');
        if (handle) handle.onpointerdown = (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const z = boardState.camera.zoom || 1;
            const sx = e.clientX, sy = e.clientY, ow = c.w, oh = c.h;
            handle.setPointerCapture(e.pointerId);
            const mv = (ev) => {
                c.w = Math.max(CELULA_MIN_W, Math.round(ow + (ev.clientX - sx) / z));
                c.h = Math.max(CELULA_MIN_H, Math.round(oh + (ev.clientY - sy) / z));
                el.style.width = c.w + 'px'; el.style.height = c.h + 'px';
                reflowMembrosCelula(c).forEach(n => {
                    const cd = cardEls[String(n.id)];
                    if (cd) { cd.style.left = n.x + 'px'; cd.style.top = n.y + 'px'; }
                });
                desenharLinhasBoard();
            };
            const up = () => { handle.removeEventListener('pointermove', mv); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
            handle.addEventListener('pointermove', mv);
            handle.addEventListener('pointerup', up);
            handle.addEventListener('pointercancel', up);
        };
    });
}

// ── ZONAS / SHAPES (FASE 13 — fatia 3) ──────────────────────
// Retângulos de agrupamento com rótulo na borda (legend). id é local do board
// (não-UUID), arrastáveis e redimensionáveis; persistem em boardState.shapes.
function novoIdShape() { return 'z' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function shapeHTML(s) {
    // Sempre emite um token de cor (default 'roxo' p/ shapes legados sem cor — Regra 4.2);
    // isso garante que o .board-cor-* aplique o acento (o .board-shape não redeclara mais).
    const cor = CORES_BOARD.includes(s.cor) ? s.cor : 'roxo';
    const formaClasse = s.forma === 'circulo' ? ' board-shape-circulo'
                      : s.forma === 'triangulo' ? ' board-shape-triangulo' : '';
    const strokeClasse = s.stroke === 'dashed' ? ' board-shape-dashed' : '';
    // Triângulo: SVG interno (preserveAspectRatio none → escala com o resize; stroke não-
    // escalável evita distorção). pointer-events:none p/ não roubar o arrasto do container.
    const triSvg = s.forma === 'triangulo'
        ? '<svg class="board-shape-tri" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,2 98,98 2,98"></polygon></svg>'
        : '';
    // Fixa (travada): cadeado no canto e SEM handle de resize (move/resize bloqueados no JS/CSS).
    const cadeado = s.travada ? '<i data-lucide="lock" class="board-shape-cadeado" title="Destravar zona"></i>' : '';
    const resize = s.travada ? '' : '<span class="board-shape-resize" title="Redimensionar"></span>';
    return `<div class="board-shape board-cor-${cor}${formaClasse}${strokeClasse}${s.travada ? ' is-travada' : ''}" data-shape="${escapeHTML(String(s.id))}" style="left: ${Math.round(s.x)}px; top: ${Math.round(s.y)}px; width: ${Math.round(s.w)}px; height: ${Math.round(s.h)}px;">
        ${triSvg}
        <span class="board-shape-label" title="Duplo-clique edita; corpo abre opções">${escapeHTML(s.label || 'Zona')}</span>
        ${cadeado}
        ${resize}
    </div>`;
}

// Texto flutuante (sem card): exibição PASSIVA (a edição é só no Popover — duplo-clique).
// Sem contenteditable (engolia os eventos de mouse). Render escapa o texto (Regra 6.1) e
// converte \n em <br> → defesa de XSS no desenho, igual aos demais campos do board, mesmo
// para dado cru/corrompido no JSONB (Regra 4.2). Cor/fundo/tamanho data-driven.
function textHTML(t) {
    const cor = CORES_BOARD.includes(t.cor) ? t.cor : 'cinza'; // sempre um token (Regra 4.2)
    const fundoClasse = t.fundo === 'semi' ? ' board-text-semi' : t.fundo === 'denso' ? ' board-text-denso' : '';
    const alignClasse = t.align === 'center' ? ' board-text-center' : t.align === 'right' ? ' board-text-right' : '';
    const tam = Math.min(96, Math.max(8, t.tamanho || 16));
    const tid = escapeHTML(String(t.id));
    const conteudo = escapeHTML(t.texto || 'Texto').replace(/\n/g, '<br>');
    // O <span> COLA no <div> e no </div> (sem espaço/quebra entre as tags): como .board-text usa
    // white-space: pre-wrap, qualquer whitespace de indentação do template viraria texto renderizado
    // — uma falsa "indentação"/linha em branco no início. NÃO reintroduzir espaços entre as tags.
    return `<div class="board-text board-cor-${cor}${fundoClasse}${alignClasse}" data-text="${tid}" style="left: ${Math.round(t.x)}px; top: ${Math.round(t.y)}px; font-size: ${tam}px;"><span class="board-text-conteudo">${conteudo}</span></div>`;
}

// Prop (ícone RPG): SVG recolorido via CSS mask + cor por token (--board-accent).
// scale/rotacao aplicados por transform (layout dinâmico permitido pela Regra 2.5).
// Lado base do símbolo (px) no zoom 1, escala 1. A escala multiplica este lado (ver propHTML).
const PROP_LADO_BASE = 48;
function propHTML(p) {
    const corClasse = CORES_BOARD.includes(p.cor) ? ` board-cor-${p.cor}` : '';
    const nome = ICONES_RPG.includes(p.icone) ? p.icone : 'shield'; // defensivo (Regra 4.2)
    const url = `/icons/rpg/${encodeURIComponent(nome)}.svg`;
    const scale = Math.min(5, Math.max(0.2, p.scale || 1));
    const rot = Math.min(360, Math.max(0, p.rotacao || 0));
    // Escala pelo TAMANHO do box (não transform:scale): a caixa de layout passa a coincidir com
    // o ícone, então o clique cai sempre sobre o símbolo (fim do "pular para o lado") e a linha
    // (que lê offsetWidth, alheio a transforms) ancora no centro real. Transform carrega só a rotação.
    const lado = Math.round(PROP_LADO_BASE * scale);
    return `<div class="board-prop${corClasse}" data-prop="${escapeHTML(String(p.id))}" style="left: ${Math.round(p.x)}px; top: ${Math.round(p.y)}px; width: ${lado}px; height: ${lado}px; transform: rotate(${rot}deg);">
        <span class="board-prop-icone" style="-webkit-mask-image: url('${url}'); mask-image: url('${url}');"></span>
    </div>`;
}

window.adicionarZona = function() {
    if (!boardAtualId) return mostrarToast('Abra ou crie um tabuleiro primeiro.', 'aviso');
    const canvas = elBoardCanvas();
    const cam = boardState.camera;
    const cw = canvas ? canvas.clientWidth : 800, ch = canvas ? canvas.clientHeight : 600;
    const w = 280, h = 200;
    const x = Math.round((cw / 2 - cam.x) / cam.zoom - w / 2);
    const y = Math.round((ch / 2 - cam.y) / cam.zoom - h / 2);
    boardState.shapes.push({ id: novoIdShape(), x, y, w, h, label: 'Nova Zona', cor: 'roxo' });
    renderBoard();
};

window.removerShapeBoard = function(shapeId) {
    fecharPopover(); // evita popover órfão quando a exclusão vem do editor
    boardState.shapes = boardState.shapes.filter(s => String(s.id) !== String(shapeId));
    removerLocalLinksDe(shapeId); // limpa ligações órfãs
    renderBoard();
};
// Remove qualquer ligação local que toque um id (evita refs pendentes no JSONB).
function removerLocalLinksDe(id) {
    boardState.localLinks = boardState.localLinks.filter(l =>
        String(l.sourceId) !== String(id) && String(l.targetId) !== String(id));
}

window.renomearZona = function(shapeId) {
    const s = boardState.shapes.find(z => String(z.id) === String(shapeId));
    if (!s) return;
    const raw = prompt('Nome da zona:', s.label || '');
    if (raw === null) return; // cancelou
    s.label = raw.trim().slice(0, 120);
    renderBoard();
};

// Editor da zona (duplo-clique no corpo): cor (tokens) + forma + estilo de borda +
// Conectar + renomear. Cor/forma/stroke persistem em boardState.shapes (Regra 2.7).
window.abrirEditorShape = function(shapeId, e) {
    fecharPopover();
    const s = boardState.shapes.find(z => String(z.id) === String(shapeId));
    if (!s) return;
    const sid = escapeHTML(String(shapeId));
    const swatch = c => `<button type="button" class="board-cor-swatch board-cor-${c}${s.cor === c ? ' sel' : ''}" data-c="${c}" title="${c}" onclick="setShapeCor('${sid}', this)"></button>`;
    const opt = (v, r, atual) => `<option value="${v}"${atual === v ? ' selected' : ''}>${r}</option>`;
    const pop = montarPopover(`
        <label>Cor da zona</label>
        <div class="board-cor-grid">${CORES_BOARD.map(swatch).join('')}</div>
        <label>Forma</label>
        <select class="board-popover-select" onchange="setShapeForma('${sid}', this.value)">
            ${opt('retangulo', 'Retângulo', s.forma || 'retangulo')}${opt('circulo', 'Círculo / Elipse', s.forma || 'retangulo')}${opt('triangulo', 'Triângulo', s.forma || 'retangulo')}
        </select>
        <label>Borda</label>
        <select class="board-popover-select" onchange="setShapeStroke('${sid}', this.value)">
            ${opt('solid', 'Sólida', s.stroke || 'solid')}${opt('dashed', 'Tracejada', s.stroke || 'solid')}
        </select>
        <div class="board-popover-acoes">
            <button class="btn btn-ghost btn-sm" onclick="toggleTravarZona('${sid}')"><i data-lucide="${s.travada ? 'lock' : 'lock-open'}"></i> ${s.travada ? 'Desafixar' : 'Fixar'}</button>
            <button class="btn btn-ghost btn-sm" onclick="renomearZona('${sid}')"><i data-lucide="pencil"></i> Renomear</button>
            <button class="btn btn-secondary btn-sm" onclick="iniciarConexaoLocal('${sid}')"><i data-lucide="spline"></i> Conectar</button>
            <button class="btn btn-ghost btn-sm" onclick="removerShapeBoard('${sid}')"><i data-lucide="trash-2"></i> Excluir</button>
        </div>`);
    elBoardCanvas().appendChild(pop);
    lucide.createIcons();
    posicionarPopover(pop, e, document.querySelector(`.board-shape[data-shape="${cssEscape(shapeId)}"]`));
};
window.setShapeCor = function(shapeId, btn) {
    const s = boardState.shapes.find(z => String(z.id) === String(shapeId));
    if (!s) return;
    s.cor = btn.dataset.c;
    btn.parentElement.querySelectorAll('.board-cor-swatch').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    renderBoard();
};
// Fixa/solta a zona (cadeado). Fixa = não move nem redimensiona; cor/forma/renomear/conectar
// seguem permitidos. Persiste em boardState.shapes[].travada (salvar manual — Regra 2.7).
window.toggleTravarZona = function(shapeId) {
    const s = boardState.shapes.find(z => String(z.id) === String(shapeId));
    if (!s) return;
    s.travada = !s.travada;
    fecharPopover();
    renderBoard();
};
window.setShapeForma = function(shapeId, v) {
    const s = boardState.shapes.find(z => String(z.id) === String(shapeId));
    if (s) { s.forma = ['circulo', 'triangulo'].includes(v) ? v : 'retangulo'; renderBoard(); }
};
window.setShapeStroke = function(shapeId, v) {
    const s = boardState.shapes.find(z => String(z.id) === String(shapeId));
    if (s) { s.stroke = v === 'dashed' ? 'dashed' : 'solid'; renderBoard(); }
};

// Mover (corpo) + redimensionar (canto) com Pointer Events; coords de mundo = delta/zoom.
// stopPropagation em tudo dentro da zona evita disparar o Pan do canvas.
function ativarInteracoesShapes() {
    const world = elBoardWorld();
    if (!world) return;
    world.querySelectorAll('.board-shape').forEach(shape => {
        const s = boardState.shapes.find(z => String(z.id) === String(shape.dataset.shape));
        if (!s) return;
        shape.onpointerdown = (e) => {
            if (e.button !== 0) return;
            // Cadeado é o toggle da trava: clicá-lo DESTRAVA a zona (e impede o pan do canvas).
            // Sem isto, a zona travada vira "fundo" e o clique panja, deixando-a presa.
            if (e.target.closest('.board-shape-cadeado')) { e.stopPropagation(); toggleTravarZona(s.id); return; }
            if (conectandoDe) { e.stopPropagation(); finalizarConexaoLocal(s.id); return; } // fecha ligação
            if (e.target.closest('.board-shape-resize, .board-shape-label')) { e.stopPropagation(); return; }
            if (s.travada) return; // zona fixa: não arrasta; o evento SOBE p/ o canvas panjar (a zona fixa conta como fundo). Destravar é pelo cadeado acima.
            e.stopPropagation();
            const z = boardState.camera.zoom || 1;
            const sx = e.clientX, sy = e.clientY, ox = s.x, oy = s.y;
            shape.setPointerCapture(e.pointerId);
            const onMove = (ev) => {
                s.x = Math.round(ox + (ev.clientX - sx) / z);
                s.y = Math.round(oy + (ev.clientY - sy) / z);
                shape.style.left = s.x + 'px'; shape.style.top = s.y + 'px';
                desenharLinhasBoard(); // ligações locais seguem a zona
            };
            const onUp = () => { shape.removeEventListener('pointermove', onMove); shape.removeEventListener('pointerup', onUp); shape.removeEventListener('pointercancel', onUp); };
            shape.addEventListener('pointermove', onMove);
            shape.addEventListener('pointerup', onUp);
            shape.addEventListener('pointercancel', onUp);
        };
        const handle = shape.querySelector('.board-shape-resize');
        if (handle) handle.onpointerdown = (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            const z = boardState.camera.zoom || 1;
            const sx = e.clientX, sy = e.clientY, ow = s.w, oh = s.h;
            handle.setPointerCapture(e.pointerId);
            const onMove = (ev) => {
                s.w = Math.max(80, Math.round(ow + (ev.clientX - sx) / z));
                s.h = Math.max(60, Math.round(oh + (ev.clientY - sy) / z));
                shape.style.width = s.w + 'px'; shape.style.height = s.h + 'px';
            };
            const onUp = () => { handle.removeEventListener('pointermove', onMove); handle.removeEventListener('pointerup', onUp); handle.removeEventListener('pointercancel', onUp); };
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);
        };
        const label = shape.querySelector('.board-shape-label');
        if (label) label.ondblclick = (e) => { e.stopPropagation(); renomearZona(s.id); };
        // Duplo-clique no corpo da zona → editor de cor (o label trata o seu próprio dblclick).
        shape.ondblclick = (e) => {
            if (e.target.closest('.board-shape-label, .board-shape-resize')) return;
            e.stopPropagation();
            abrirEditorShape(s.id, e);
        };
    });
}

// ── TEXTOS FLUTUANTES / PROPS / CONEXÕES LOCAIS (FASE 14) ───────────────────
function novoIdLocal(pfx) { return pfx + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Centro da viewport em coords de mundo (reuso por texto/prop/zona).
function centroMundo() {
    const canvas = elBoardCanvas(); const cam = boardState.camera;
    const cw = canvas ? canvas.clientWidth : 800, ch = canvas ? canvas.clientHeight : 600;
    return { x: Math.round((cw / 2 - cam.x) / cam.zoom), y: Math.round((ch / 2 - cam.y) / cam.zoom) };
}
// Drag genérico de um elemento posicionado por {x,y} (coords de mundo = delta/zoom).
// `conectavel`: se true, em modo conexão o clique FECHA a ligação (zonas/props) em vez
// de arrastar — num único handler (mesmo padrão dos shapes; evita drag+conexão duplos).
function arrastarPorPonteiro(el, obj, onDrag, conectavel) {
    el.onpointerdown = (e) => {
        if (e.button !== 0) return;
        if (conectandoDe) { e.stopPropagation(); if (conectavel) finalizarConexaoLocal(obj.id); return; }
        e.stopPropagation();
        const z = boardState.camera.zoom || 1;
        const sx = e.clientX, sy = e.clientY, ox = obj.x, oy = obj.y;
        el.setPointerCapture(e.pointerId);
        const mv = (ev) => {
            obj.x = Math.round(ox + (ev.clientX - sx) / z);
            obj.y = Math.round(oy + (ev.clientY - sy) / z);
            el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px';
            if (onDrag) onDrag();
        };
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointermove', mv);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    };
}

// ── TEXTOS FLUTUANTES ───────────────────────────────────────
window.adicionarTexto = function() {
    if (!boardAtualId) return mostrarToast('Abra ou crie um tabuleiro primeiro.', 'aviso');
    const c = centroMundo();
    boardState.texts.push({ id: novoIdLocal('t'), x: c.x, y: c.y, texto: 'Texto', cor: 'cinza', tamanho: 18, align: 'center' });
    renderBoard();
};
window.removerTextBoard = function(id) {
    boardState.texts = boardState.texts.filter(t => String(t.id) !== String(id));
    fecharPopover(); // evita popover órfão quando a exclusão vem do editor
    renderBoard();
};
function ativarInteracoesTexts() {
    const world = elBoardWorld(); if (!world) return;
    world.querySelectorAll('.board-text').forEach(el => {
        const t = boardState.texts.find(x => String(x.id) === String(el.dataset.text));
        if (!t) return;
        arrastarPorPonteiro(el, t);
        el.ondblclick = (e) => { e.stopPropagation(); abrirEditorText(t.id, e); };
    });
}
// Micro-editor do texto: conteúdo + cor (token) + tamanho da fonte (slider).
window.abrirEditorText = function(id, e) {
    fecharPopover();
    const t = boardState.texts.find(x => String(x.id) === String(id)); if (!t) return;
    const tid = escapeHTML(String(id));
    const swatch = c => `<button type="button" class="board-cor-swatch board-cor-${c}${t.cor === c ? ' sel' : ''}" data-c="${c}" title="${c}" onclick="setTextCor('${tid}', this)"></button>`;
    const opt = (v, r, atual) => `<option value="${v}"${(atual || 'transparente') === v ? ' selected' : ''}>${r}</option>`;
    const pop = montarPopover(`
        <label>Texto</label>
        <textarea class="board-popover-input" rows="3" oninput="setTextConteudo('${tid}', this.value)">${escapeHTML((t.texto || '').replace(/<br>/g, '\n'))}</textarea>
        <label>Cor</label>
        <div class="board-cor-grid">${CORES_BOARD.map(swatch).join('')}</div>
        <label>Fundo</label>
        <select class="board-popover-select" onchange="setTextFundo('${tid}', this.value)">
            ${opt('transparente', 'Transparente', t.fundo)}${opt('semi', 'Semi (translúcido)', t.fundo)}${opt('denso', 'Denso (sólido)', t.fundo)}
        </select>
        <label>Alinhamento</label>
        <div class="board-icone-grid">
            ${[['left', 'align-left'], ['center', 'align-center'], ['right', 'align-right']].map(([v, ic]) =>
                `<button type="button" class="board-icone-opt${(t.align || 'left') === v ? ' sel' : ''}" data-al="${v}" title="${v}" onclick="setTextAlign('${tid}', this)"><i data-lucide="${ic}"></i></button>`).join('')}
        </div>
        <label>Tamanho (<span id="board-text-tam">${Math.round(t.tamanho || 18)}</span>px)</label>
        <input type="range" class="board-popover-range" min="8" max="96" value="${Math.round(t.tamanho || 18)}" oninput="setTextTamanho('${tid}', this.value)">
        <div class="board-popover-acoes">
            <button class="btn btn-ghost btn-sm" onclick="removerTextBoard('${tid}')"><i data-lucide="trash-2"></i> Excluir</button>
            <button class="btn btn-primary btn-sm" onclick="fecharPopover()"><i data-lucide="check"></i> Pronto</button>
        </div>`);
    elBoardCanvas().appendChild(pop);
    lucide.createIcons();
    posicionarPopover(pop, e, document.querySelector(`.board-text[data-text="${cssEscape(id)}"]`));
};
window.setTextConteudo = function(id, v) {
    const t = boardState.texts.find(x => String(x.id) === String(id)); if (!t) return;
    t.texto = String(v).slice(0, 2000); // guarda CRU; a higienização acontece no render
    const span = document.querySelector(`.board-text[data-text="${cssEscape(id)}"] .board-text-conteudo`);
    if (span) span.innerHTML = escapeHTML(t.texto).replace(/\n/g, '<br>'); // escapa + nl2br (Regra 6.1)
};
window.setTextFundo = function(id, v) {
    const t = boardState.texts.find(x => String(x.id) === String(id)); if (!t) return;
    t.fundo = ['semi', 'denso'].includes(v) ? v : 'transparente';
    const el = document.querySelector(`.board-text[data-text="${cssEscape(id)}"]`);
    if (el) { el.classList.remove('board-text-semi', 'board-text-denso'); if (t.fundo !== 'transparente') el.classList.add('board-text-' + t.fundo); }
};
window.setTextAlign = function(id, btn) {
    const t = boardState.texts.find(x => String(x.id) === String(id)); if (!t) return;
    t.align = ['center', 'right'].includes(btn.dataset.al) ? btn.dataset.al : 'left';
    btn.parentElement.querySelectorAll('.board-icone-opt').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    const el = document.querySelector(`.board-text[data-text="${cssEscape(id)}"]`);
    if (el) { el.classList.remove('board-text-center', 'board-text-right'); if (t.align !== 'left') el.classList.add('board-text-' + t.align); }
};
window.setTextTamanho = function(id, v) {
    const t = boardState.texts.find(x => String(x.id) === String(id)); if (!t) return;
    t.tamanho = Math.min(96, Math.max(8, parseInt(v, 10) || 18));
    const el = document.querySelector(`.board-text[data-text="${cssEscape(id)}"]`);
    if (el) el.style.fontSize = t.tamanho + 'px';
    const lbl = document.getElementById('board-text-tam'); if (lbl) lbl.textContent = t.tamanho;
};
window.setTextCor = function(id, btn) {
    const t = boardState.texts.find(x => String(x.id) === String(id)); if (!t) return;
    t.cor = btn.dataset.c;
    btn.parentElement.querySelectorAll('.board-cor-swatch').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    const el = document.querySelector(`.board-text[data-text="${cssEscape(id)}"]`);
    if (el) { CORES_BOARD.forEach(c => el.classList.remove('board-cor-' + c)); el.classList.add('board-cor-' + t.cor); }
};

// ── PROPS (ícones RPG) ──────────────────────────────────────
window.abrirSeletorSimbolo = function() {
    if (!boardAtualId) return mostrarToast('Abra ou crie um tabuleiro primeiro.', 'aviso');
    fecharSeletorSimbolo();
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-board-simbolo';
    modal.innerHTML = `
        <div class="modal-box board-simbolo-box">
            <div class="modal-head">
                <h3 class="texto-roxo modal-titulo"><i data-lucide="shapes"></i> Adicionar Símbolo</h3>
                <button class="btn btn-ghost btn-sm" onclick="fecharSeletorSimbolo()" title="Fechar"><i data-lucide="x"></i></button>
            </div>
            <div class="board-simbolo-grid">
                ${ICONES_RPG.map(ic => `<button type="button" class="board-simbolo-opt" title="${escapeHTML(ic)}" data-ic="${escapeHTML(ic)}" onclick="adicionarSimbolo(this.dataset.ic)">
                    <span class="board-prop-icone" style="-webkit-mask-image: url('/icons/rpg/${encodeURIComponent(ic)}.svg'); mask-image: url('/icons/rpg/${encodeURIComponent(ic)}.svg');"></span>
                </button>`).join('')}
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharSeletorSimbolo(); });
    lucide.createIcons();
};
window.fecharSeletorSimbolo = function() { const m = document.getElementById('modal-board-simbolo'); if (m) m.remove(); };
window.adicionarSimbolo = function(icone) {
    if (!ICONES_RPG.includes(icone)) return;
    const c = centroMundo();
    boardState.props.push({ id: novoIdLocal('p'), x: c.x, y: c.y, icone, scale: 1, rotacao: 0, cor: 'cinza' });
    fecharSeletorSimbolo();
    renderBoard();
};
window.removerPropBoard = function(id) {
    boardState.props = boardState.props.filter(p => String(p.id) !== String(id));
    removerLocalLinksDe(id); // limpa ligações órfãs
    fecharPopover(); // evita popover órfão quando a exclusão vem do editor
    renderBoard();
};
// Atualização ao vivo (slider de tamanho/rotação): escala via width/height, rotação via transform.
function aplicarTransformProp(el, p) {
    const lado = Math.round(PROP_LADO_BASE * Math.min(5, Math.max(0.2, p.scale || 1)));
    el.style.width = lado + 'px';
    el.style.height = lado + 'px';
    el.style.transform = `rotate(${Math.min(360, Math.max(0, p.rotacao || 0))}deg)`;
}
function ativarInteracoesProps() {
    const world = elBoardWorld(); if (!world) return;
    world.querySelectorAll('.board-prop').forEach(el => {
        const p = boardState.props.find(x => String(x.id) === String(el.dataset.prop));
        if (!p) return;
        arrastarPorPonteiro(el, p, desenharLinhasBoard, true); // arrasta; em modo conexão, conecta
        el.ondblclick = (e) => { e.stopPropagation(); abrirEditorProp(p.id, e); };
    });
}
// Editor do prop: tamanho (slider) + rotação (slider) + cor (token).
window.abrirEditorProp = function(id, e) {
    fecharPopover();
    const p = boardState.props.find(x => String(x.id) === String(id)); if (!p) return;
    const pid = escapeHTML(String(id));
    const swatch = c => `<button type="button" class="board-cor-swatch board-cor-${c}${p.cor === c ? ' sel' : ''}" data-c="${c}" title="${c}" onclick="setPropCor('${pid}', this)"></button>`;
    const pop = montarPopover(`
        <label>Tamanho (<span id="board-prop-sc">${(p.scale || 1).toFixed(1)}</span>×)</label>
        <input type="range" class="board-popover-range" min="0.2" max="5" step="0.1" value="${p.scale || 1}" oninput="setPropScale('${pid}', this.value)">
        <label>Rotação (<span id="board-prop-rot">${Math.round(p.rotacao || 0)}</span>°)</label>
        <input type="range" class="board-popover-range" min="0" max="360" value="${Math.round(p.rotacao || 0)}" oninput="setPropRot('${pid}', this.value)">
        <label>Cor</label>
        <div class="board-cor-grid">${CORES_BOARD.map(swatch).join('')}</div>
        <div class="board-popover-acoes">
            <button class="btn btn-ghost btn-sm" onclick="removerPropBoard('${pid}')"><i data-lucide="trash-2"></i> Excluir</button>
            <button class="btn btn-secondary btn-sm" onclick="iniciarConexaoLocal('${pid}')"><i data-lucide="spline"></i> Conectar</button>
        </div>`);
    elBoardCanvas().appendChild(pop);
    lucide.createIcons();
    posicionarPopover(pop, e, document.querySelector(`.board-prop[data-prop="${cssEscape(id)}"]`));
};
window.setPropScale = function(id, v) {
    const p = boardState.props.find(x => String(x.id) === String(id)); if (!p) return;
    p.scale = Math.min(5, Math.max(0.2, parseFloat(v) || 1));
    const el = document.querySelector(`.board-prop[data-prop="${cssEscape(id)}"]`); if (el) aplicarTransformProp(el, p);
    const lbl = document.getElementById('board-prop-sc'); if (lbl) lbl.textContent = p.scale.toFixed(1);
    desenharLinhasBoard();
};
window.setPropRot = function(id, v) {
    const p = boardState.props.find(x => String(x.id) === String(id)); if (!p) return;
    p.rotacao = Math.min(360, Math.max(0, parseInt(v, 10) || 0));
    const el = document.querySelector(`.board-prop[data-prop="${cssEscape(id)}"]`); if (el) aplicarTransformProp(el, p);
    const lbl = document.getElementById('board-prop-rot'); if (lbl) lbl.textContent = p.rotacao;
};
window.setPropCor = function(id, btn) {
    const p = boardState.props.find(x => String(x.id) === String(id)); if (!p) return;
    p.cor = btn.dataset.c;
    btn.parentElement.querySelectorAll('.board-cor-swatch').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    const el = document.querySelector(`.board-prop[data-prop="${cssEscape(id)}"]`);
    if (el) { CORES_BOARD.forEach(c => el.classList.remove('board-cor-' + c)); el.classList.add('board-cor-' + p.cor); }
};

// ── CONEXÕES LOCAIS (zonas/props — fora de world_links) ─────
let conectandoDe = null; // id da forma de origem enquanto no modo "Conectar"
window.iniciarConexaoLocal = function(id) {
    fecharPopover();
    conectandoDe = String(id);
    elBoardCanvas()?.classList.add('conectando');
    mostrarToast('Clique numa zona ou símbolo de destino para conectar.', 'aviso');
};
function finalizarConexaoLocal(targetId) {
    const src = conectandoDe; conectandoDe = null;
    elBoardCanvas()?.classList.remove('conectando');
    if (!src || String(src) === String(targetId)) return;
    const dup = boardState.localLinks.some(l =>
        (String(l.sourceId) === String(src) && String(l.targetId) === String(targetId)) ||
        (String(l.sourceId) === String(targetId) && String(l.targetId) === String(src)));
    if (dup) return mostrarToast('Essas formas já estão conectadas.', 'aviso');
    boardState.localLinks.push({ id: novoIdLocal('l'), sourceId: String(src), targetId: String(targetId), cor: 'cinza', stroke: 'solid', label: '' });
    desenharLinhasBoard();
    mostrarToast('Ligação criada.', 'sucesso');
}
window.removerLocalLink = function(id) {
    boardState.localLinks = boardState.localLinks.filter(l => String(l.id) !== String(id));
    fecharPopover();
    desenharLinhasBoard();
};
// Editor da ligação local: cor (token) + estilo + rótulo + excluir.
window.editarLocalLink = function(id, e) {
    if (e) e.stopPropagation();
    fecharPopover();
    const l = boardState.localLinks.find(x => String(x.id) === String(id)); if (!l) return;
    const lid = escapeHTML(String(id));
    const swatch = c => `<button type="button" class="board-cor-swatch board-cor-${c}${l.cor === c ? ' sel' : ''}" data-c="${c}" title="${c}" onclick="setLocalLinkCor('${lid}', this)"></button>`;
    const strBtn = (v, r) => `<button type="button" class="board-estilo-opt${(l.stroke || 'solid') === v ? ' sel' : ''}" onclick="setLocalLinkStroke(this, '${lid}', '${v}')">${r}</button>`;
    const pop = montarPopover(`
        <label>Cor</label>
        <div class="board-cor-grid">${CORES_BOARD.map(swatch).join('')}</div>
        <label>Estilo</label>
        <div class="board-estilo-row">${strBtn('solid', 'Sólida')}${strBtn('dashed', 'Tracejada')}</div>
        <label>Rótulo</label>
        <input type="text" class="board-popover-input" maxlength="80" value="${escapeHTML(l.label || '')}" oninput="setLocalLinkLabel('${lid}', this.value)" placeholder="(opcional)">
        <div class="board-popover-acoes">
            <button class="btn btn-ghost btn-sm" onclick="removerLocalLink('${lid}')"><i data-lucide="trash-2"></i> Excluir</button>
            <button class="btn btn-primary btn-sm" onclick="fecharPopover()"><i data-lucide="check"></i> Pronto</button>
        </div>`);
    elBoardCanvas().appendChild(pop);
    lucide.createIcons();
    posicionarPopover(pop, e);
};
window.setLocalLinkCor = function(id, btn) {
    const l = boardState.localLinks.find(x => String(x.id) === String(id)); if (!l) return;
    l.cor = btn.dataset.c;
    btn.parentElement.querySelectorAll('.board-cor-swatch').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    desenharLinhasBoard();
};
window.setLocalLinkStroke = function(btn, id, v) {
    const l = boardState.localLinks.find(x => String(x.id) === String(id)); if (!l) return;
    l.stroke = v === 'dashed' ? 'dashed' : 'solid';
    btn.parentElement.querySelectorAll('.board-estilo-opt').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    desenharLinhasBoard();
};
window.setLocalLinkLabel = function(id, v) {
    const l = boardState.localLinks.find(x => String(x.id) === String(id)); if (!l) return;
    l.label = String(v).slice(0, 80);
    desenharLinhasBoard();
};

// ── LINHAS + EDIÇÃO VISUAL (FASE 13 — fatia 4) ──────────────
const ICONES_BOARD = ['castle', 'landmark', 'map', 'mountain', 'tent', 'coins', 'swords', 'shield', 'crown', 'flag', 'gem', 'user'];
// Mapa token → variável CSS (espelha .board-cor-* no global_ui.css), p/ usar em SVG.
const VAR_CORES_BOARD = { roxo: '--roxo-mago', azul: '--azul-vida', verde: '--destaque', ambar: '--aviso', vermelho: '--erro', cinza: '--texto-mutado', rosa: '--rosa' };
function corBoardVar(cor) { return VAR_CORES_BOARD[cor] ? `var(${VAR_CORES_BOARD[cor]})` : 'var(--texto-mutado)'; }
let boardLinks = [];   // {id,a,b,tipo} entre nós no board (derivado de listarLinks)
let editorNodeId = null, editorNodeCor = null, editorNodeIcone = null;

const chaveLinha = (a, b) => [String(a), String(b)].sort().join('_'); // canônica (par bidirecional)
function corLinhaVar(ovCor, tipo) {
    const t = String(ovCor || tipo || '').toLowerCase();
    if (t === 'aliado') return 'var(--link-aliado)';
    if (t === 'inimigo') return 'var(--link-inimigo)';
    return 'var(--texto-mutado)'; // neutro / associado / progressao / outros
}

// Busca os world_links REAIS entre os nós do board (reuso de listarLinks: 1 chamada
// por nó + dedupe por id; filtra os com AMBOS extremos no tabuleiro). Depois desenha.
async function atualizarLinksBoard() {
    // 1 requisição (links da crônica) em vez de N (1 por nó) — fim do N+1. Filtra para os
    // vínculos cujas DUAS pontas estão no board; cada link vem uma única vez (dedupe por id defensivo).
    const ids = new Set(boardState.nodes.map(n => String(n.id)));
    let links = [];
    try { links = await MundoApi.listarLinksCronica(cronicaId); } catch (e) { links = []; }
    const vistos = new Map();
    links.forEach(l => {
        const a = String(l.origem_node_id), b = String(l.destino_node_id);
        if (!ids.has(a) || !ids.has(b)) return; // só liga nós presentes no board
        const id = String(l.id);
        if (!vistos.has(id)) vistos.set(id, { id, a, b, tipo: l.tipo_vinculo });
    });
    boardLinks = [...vistos.values()];
    desenharLinhasBoard();
}

// Caminho Bézier com âncoras cardeais deslizantes: o eixo dominante (maior delta) decide se
// a linha sai pelas laterais (Esq/Dir) ou pelo topo/baixo, e a alça puxa no mesmo eixo p/ a
// curva nascer perpendicular à borda. Compartilhado por world_links e localLinks (DRY, Fatia 4).
function caminhoCardeal(elA, elB) {
    const a = { x: elA.offsetLeft + elA.offsetWidth / 2, y: elA.offsetTop + elA.offsetHeight / 2 };
    const b = { x: elB.offsetLeft + elB.offsetWidth / 2, y: elB.offsetTop + elB.offsetHeight / 2 };
    const dx = b.x - a.x, dy = b.y - a.y;
    // Tema Investigação: barbante ESTICADO ligando os PINOS (topo das fotos). Cards âncoram no
    // pino (topo-centro, ~offsetTop); células/zonas (sem pino) seguem pelo centro. O SVG fica
    // atrás dos cards (z2<3) → o fio chega ao pino e some atrás da foto. Afeta todas as linhas.
    if (boardState.tema === 'investigacao') {
        const pino = (el, c) => el.classList.contains('board-card') ? { x: c.x, y: el.offsetTop } : c;
        const pa = pino(elA, a), pb = pino(elB, b);
        return { d: `M ${pa.x} ${pa.y} L ${pb.x} ${pb.y}`, mx: (pa.x + pb.x) / 2, my: (pa.y + pb.y) / 2 };
    }
    let p1, p2, c1, c2;
    if (Math.abs(dx) > Math.abs(dy)) {
        const s = dx >= 0 ? 1 : -1;
        p1 = { x: a.x + s * elA.offsetWidth / 2, y: a.y };
        p2 = { x: b.x - s * elB.offsetWidth / 2, y: b.y };
        const pull = Math.max(40, Math.abs(p2.x - p1.x) * 0.4);
        c1 = { x: p1.x + s * pull, y: p1.y };
        c2 = { x: p2.x - s * pull, y: p2.y };
    } else {
        const s = dy >= 0 ? 1 : -1;
        p1 = { x: a.x, y: a.y + s * elA.offsetHeight / 2 };
        p2 = { x: b.x, y: b.y - s * elB.offsetHeight / 2 };
        const pull = Math.max(40, Math.abs(p2.y - p1.y) * 0.4);
        c1 = { x: p1.x, y: p1.y + s * pull };
        c2 = { x: p2.x, y: p2.y - s * pull };
    }
    return { d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
             mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
}

// Rótulo da linha de diplomacia como ÍCONE de alto desempenho. SVGs de /public/icons/rpg/
// (aliado usa handshake.svg, extraído do Lucide). Renderizado como <foreignObject> + máscara
// CSS (técnica do propHTML); cor "natural" (clara) e tamanho vêm da classe — não tinge por
// status (a LINHA já carrega a cor). NÃO usa lucide.createIcons(): é só string no SVG, então
// redesenha a 60fps no arrasto sem varrer o DOM.
const ICONE_DIPLOMACIA = { aliado: 'handshake', inimigo: 'crossed-swords', neutro: 'all-seeing-eye' };
function rotuloIconeDiplomacia(mx, my, status) {
    const nome = ICONE_DIPLOMACIA[status] || ICONE_DIPLOMACIA.neutro;
    const url = `/icons/rpg/${encodeURIComponent(nome)}.svg`;
    const L = 32, h = L / 2; // maior (32px), centrado no ponto médio
    return `<foreignObject x="${Math.round(mx) - h}" y="${Math.round(my) - h}" width="${L}" height="${L}">
        <div xmlns="http://www.w3.org/1999/xhtml" class="board-line-diplo-icone" style="-webkit-mask-image: url('${url}'); mask-image: url('${url}');"></div>
    </foreignObject>`;
}

// Desenha world_links (entre cards) E localLinks (entre zonas/props) — ambos em Bézier
// cardeal (Fatia 4). Caminho duplo: hit transparente largo (clicável) + linha visível.
// Cor/dash/rótulo data-driven; rótulo (<text>) no ponto médio do caminho.
// Coalesce o redesenho das linhas no arrasto: vários pointermove por frame → 1 redesenho por
// frame (rAF). O card move sincronamente (sem lag próprio); as linhas acompanham em ≤1 frame.
let _rafLinhas = 0;
function agendarRedesenhoLinhas() {
    if (_rafLinhas) return;
    _rafLinhas = requestAnimationFrame(() => { _rafLinhas = 0; desenharLinhasBoard(); });
}
function desenharLinhasBoard() {
    const world = elBoardWorld();
    const svg = world?.querySelector('.board-svg');
    if (!svg) return;
    const rotulo = (mx, my, txt) => txt ? `<text class="board-line-label" x="${Math.round(mx)}" y="${Math.round(my) - 6}">${escapeHTML(txt)}</text>` : '';
    let paths = '';

    // world_links (entre cards de entidades)
    const cardEl = {};
    world.querySelectorAll('.board-card').forEach(c => { cardEl[String(c.dataset.node)] = c; });
    boardLinks.forEach(lk => {
        const ca = cardEl[lk.a], cb = cardEl[lk.b];
        // offsetParent === null ⇒ card oculto (membro de núcleo minimizado, is-membro-oculto):
        // offsets zeram e a linha voaria para (0,0). Não desenha linha para card invisível.
        if (!ca || !cb || ca.offsetParent === null || cb.offsetParent === null) return;
        const { d, mx, my } = caminhoCardeal(ca, cb);
        const key = chaveLinha(lk.a, lk.b);
        const ov = boardState.overrides_linhas[key] || {};
        const dash = ov.stroke === 'dashed' ? '7 6' : '';
        const ea = escapeHTML(String(lk.a)), eb = escapeHTML(String(lk.b)); // data p/ hover-destaque
        paths += `<path class="board-line-hit" onclick="editarLinha('${escapeHTML(key)}', event)" d="${d}"></path>`;
        paths += `<path class="board-line" data-a="${ea}" data-b="${eb}" d="${d}" style="stroke: ${corLinhaVar(ov.cor, lk.tipo)}; stroke-dasharray: ${dash};"></path>`;
        paths += rotulo(mx, my, ov.label);
    });

    // localLinks (entre zonas/props) — agora também Bézier cardeal (Fatia 4)
    const localEl = {};
    world.querySelectorAll('.board-shape, .board-prop').forEach(el => {
        localEl[String(el.dataset.shape || el.dataset.prop)] = el;
    });
    boardState.localLinks.forEach(l => {
        const ea = localEl[String(l.sourceId)], eb = localEl[String(l.targetId)];
        if (!ea || !eb) return; // endpoint removido → não desenha (limpeza no próximo save)
        const { d, mx, my } = caminhoCardeal(ea, eb);
        const dash = l.stroke === 'dashed' ? '7 6' : '';
        const lid = escapeHTML(String(l.id));
        paths += `<path class="board-line-hit" onclick="editarLocalLink('${lid}', event)" d="${d}"></path>`;
        paths += `<path class="board-line" d="${d}" style="stroke: ${corBoardVar(l.cor)}; stroke-dasharray: ${dash};"></path>`;
        paths += rotulo(mx, my, l.label);
    });

    // Macro-links de Diplomacia (Fase 14): linhas "fantasma" entre Células de núcleo,
    // derivadas SÓ do diplomaciaCache (Mundo é a fonte da verdade — read-only, não toca
    // boardState, sem hit clicável). `color` espelha o stroke p/ o halo (drop-shadow).
    const corDip = { aliado: 'var(--link-aliado)', inimigo: 'var(--link-inimigo)', neutro: 'var(--texto-mutado)' };
    (diplomaciaCache || []).forEach(rel => {
        const ea = world.querySelector(`.board-celula[data-nucleo="${cssEscape(rel.nucleoA)}"]`);
        const eb = world.querySelector(`.board-celula[data-nucleo="${cssEscape(rel.nucleoB)}"]`);
        if (!ea || !eb) return;
        const { d, mx, my } = caminhoCardeal(ea, eb);
        const cor = corDip[rel.status] || 'var(--texto-mutado)';
        paths += `<path class="board-line board-line-diplomacia" d="${d}" style="stroke: ${cor}; color: ${cor};"></path>`;
        paths += rotuloIconeDiplomacia(mx, my, rel.status); // ícone neutro (alto desempenho); a linha carrega a cor
    });

    // Fios de Investigação (Fase 15): evento INVOCADO (via crachá) → seus nós-gatilho.
    // Efêmero/read-only (lê eventosInvocados, fora do boardState). Reusa cardEl (nós já mapeados).
    Object.keys(eventosInvocados).forEach(evId => {
        const elEv = world.querySelector(`.board-evento-node[data-evento="${cssEscape(evId)}"]`);
        if (!elEv) return;
        const ev = boardEventosCache.find(e => String(e.id) === String(evId));
        if (!ev) return;
        (ev.gatilhos || []).forEach(g => {
            const elNode = cardEl[String(g.node_id)];
            if (!elNode || elNode.offsetParent === null) return; // nó ausente/oculto → sem fio
            const { d } = caminhoCardeal(elEv, elNode);
            paths += `<path class="board-line board-line-evento" d="${d}"></path>`;
        });
    });

    svg.innerHTML = paths;
    // Persiste o destaque do card sob o cursor após qualquer redraw (Ressalva 2 da Fatia 2).
    if (hoveredNodeId) destacarLinhasDe(hoveredNodeId, true);
    if (focoSet) pintarFocoBoard(); // re-aplica a Lente de Destaque após o redraw das linhas
}

// Cria o popover já com botão de fechar no canto (R5 + UX). Conteúdo via template.
function montarPopover(inner) {
    const pop = document.createElement('div');
    pop.className = 'board-popover';
    pop.id = 'board-popover';
    pop.innerHTML = `<button type="button" class="board-popover-fechar" title="Fechar" onclick="fecharPopover()"><i data-lucide="x"></i></button>${inner}`;
    return pop;
}
// Escapa um id para uso seguro em querySelector (CSS.escape com fallback).
function cssEscape(v) {
    const s = String(v);
    return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\\]]/g, '\\$&');
}
// Posiciona o popover DENTRO do viewport (overflow:hidden). Se houver elemento-âncora,
// abre na lateral DIREITA dele (esquerda se faltar espaço), nunca por cima. Mede o
// tamanho real já injetado — sem constante fixa — para nunca ser recortado pela borda.
function posicionarPopover(pop, e, anchorEl) {
    const canvas = elBoardCanvas();
    if (!canvas) return;
    // :root { zoom: 1.33 } → getBoundingClientRect()/clientX devolvem px VISUAIS (já × zoom), mas
    // style.left/top de um filho do canvas (que está no doc com zoom) é RE-escalado pelo navegador.
    // Dividir os deltas visuais pelo zoom casa com o espaço de layout (offsetWidth/clientWidth já
    // vêm sem zoom). Sem isto o popover "foge" proporcional à distância da origem. Ver tooltip hover.
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const cr = canvas.getBoundingClientRect();                 // px visuais
    const cw = canvas.clientWidth, ch = canvas.clientHeight;   // px de layout (sem zoom)
    const pw = pop.offsetWidth || 224, ph = pop.offsetHeight || 220; // px de layout
    let x, y;
    if (anchorEl) {
        const ar = anchorEl.getBoundingClientRect();
        const right = (ar.right - cr.left) / zoom, left = (ar.left - cr.left) / zoom;
        x = right + 8;                            // lateral direita do elemento
        if (x + pw + 8 > cw) x = left - pw - 8;   // sem espaço à direita → à esquerda
        y = (ar.top - cr.top) / zoom;
    } else {
        x = e ? (e.clientX - cr.left) / zoom : (cw - pw) / 2;
        y = e ? (e.clientY - cr.top) / zoom : (ch - ph) / 2;
    }
    x = Math.max(8, Math.min(x, cw - pw - 8));
    y = Math.max(8, Math.min(y, ch - ph - 8));
    pop.style.left = Math.round(x) + 'px';
    pop.style.top = Math.round(y) + 'px';
}
window.fecharPopover = function() {
    const p = document.getElementById('board-popover');
    if (p) p.remove();
};

// Mini-popover de estilo da linha (world_link) → grava em boardState.overrides_linhas[chave].
window.editarLinha = function(key, e) {
    if (e) e.stopPropagation();
    fecharPopover();
    const ov = boardState.overrides_linhas[key] || {};
    const k = escapeHTML(key);
    const corBtn = (v, r) => `<button type="button" class="board-estilo-opt${ov.cor === v ? ' sel' : ''}" data-v="${v}" onclick="setLinhaCor(this, '${k}', '${v}')">${r}</button>`;
    const strBtn = (v, r) => `<button type="button" class="board-estilo-opt${(ov.stroke || 'solid') === v ? ' sel' : ''}" data-v="${v}" onclick="setLinhaStroke(this, '${k}', '${v}')">${r}</button>`;
    const pop = montarPopover(`
        <label>Relação</label>
        <div class="board-estilo-row">${corBtn('aliado', 'Aliado')}${corBtn('inimigo', 'Inimigo')}${corBtn('neutro', 'Neutro')}</div>
        <label>Estilo</label>
        <div class="board-estilo-row">${strBtn('solid', 'Sólida')}${strBtn('dashed', 'Pontilhada')}</div>
        <label>Rótulo</label>
        <input type="text" class="board-popover-input" maxlength="80" value="${escapeHTML(ov.label || '')}" oninput="setLinhaLabel('${k}', this.value)" placeholder="(opcional)">
        <div class="board-popover-acoes">
            <button class="btn btn-ghost btn-sm" onclick="limparLinha('${k}')">Limpar</button>
            <button class="btn btn-primary btn-sm" onclick="fecharPopover()">Fechar</button>
        </div>`);
    elBoardCanvas().appendChild(pop);
    lucide.createIcons();
    posicionarPopover(pop, e);
};
window.setLinhaLabel = function(key, v) {
    const ov = boardState.overrides_linhas[key] || {};
    ov.label = String(v).slice(0, 80);
    boardState.overrides_linhas[key] = ov;
    desenharLinhasBoard();
};
window.setLinhaCor = function(btn, key, cor) {
    const ov = boardState.overrides_linhas[key] || {};
    ov.cor = cor; boardState.overrides_linhas[key] = ov;
    btn.parentElement.querySelectorAll('.board-estilo-opt').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    desenharLinhasBoard();
};
window.setLinhaStroke = function(btn, key, stroke) {
    const ov = boardState.overrides_linhas[key] || {};
    ov.stroke = stroke; boardState.overrides_linhas[key] = ov;
    btn.parentElement.querySelectorAll('.board-estilo-opt').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    desenharLinhasBoard();
};
window.limparLinha = function(key) {
    delete boardState.overrides_linhas[key];
    desenharLinhasBoard();
    fecharPopover();
};

// Popover de duplo-clique no nó: paleta de cores (tokens) + ícones de worldbuilding.
function abrirEditorNode(card, e) {
    fecharPopover();
    const node = boardState.nodes.find(n => String(n.id) === String(card.dataset.node));
    if (!node) return;
    editorNodeId = node.id;
    editorNodeCor = node.cor || null;
    editorNodeIcone = node.icone || null;
    const pop = montarPopover(`
        <label>Cor do card</label>
        <div class="board-cor-grid">
            ${CORES_BOARD.map(c => `<button type="button" class="board-cor-swatch board-cor-${c}${editorNodeCor === c ? ' sel' : ''}" data-c="${c}" title="${c}" onclick="selNodeCor(this)"></button>`).join('')}
        </div>
        <label>Ícone</label>
        <div class="board-icone-grid">
            ${ICONES_BOARD.map(ic => `<button type="button" class="board-icone-opt${editorNodeIcone === ic ? ' sel' : ''}" data-ic="${ic}" onclick="selNodeIcone(this)"><i data-lucide="${ic}"></i></button>`).join('')}
        </div>
        <div class="board-popover-acoes">
            <button class="btn btn-secondary btn-sm" onclick="puxarConectadosBoard('${escapeHTML(String(editorNodeId))}')"><i data-lucide="network"></i> Puxar Conectados</button>
        </div>
        <div class="board-popover-acoes">
            <button class="btn btn-ghost btn-sm" onclick="removerNodeBoard('${escapeHTML(String(editorNodeId))}')"><i data-lucide="trash-2"></i> Excluir</button>
            <button class="btn btn-ghost btn-sm" onclick="resetNodeVisual()">Padrão</button>
            <button class="btn btn-primary btn-sm" onclick="salvarEditorNode()"><i data-lucide="check"></i> Salvar</button>
        </div>`);
    elBoardCanvas().appendChild(pop);
    lucide.createIcons();
    posicionarPopover(pop, e, card); // abre na lateral do card (mede após render dos ícones)
}

// "Puxar Conectados" (Fase 13.5 — funde a auto-expansão da Mesa da Fase 12 com o
// canvas livre da Fase 13). A partir de um nó-raiz já no tabuleiro, busca os
// world_links REAIS (MundoApi.listarLinks já resolve os dois sentidos, Regra 4.4) e
// traz para a mesa as entidades ligadas ainda ausentes, dispondo-as em círculo à
// volta da origem. Posições ficam em memória; só persistem no "Salvar" (Regra 2.7).
window.puxarConectadosBoard = async function(nodeId) {
    fecharPopover();
    const origem = boardState.nodes.find(n => String(n.id) === String(nodeId));
    if (!origem) return;
    let links = [];
    try { links = await MundoApi.listarLinks(cronicaId, nodeId); }
    catch (e) { return mostrarToast('Não foi possível buscar as conexões.', 'erro'); }

    const noBoard = new Set(boardState.nodes.map(n => String(n.id)));
    // ids conectados ainda fora da mesa (dedupe + só nós reais da crônica, defensivo)
    const novos = [...new Set(links.map(l => String(l.node_conectado_id)))]
        .filter(id => !noBoard.has(id) && boardNodeInfo(id));

    if (!novos.length) return mostrarToast('Todas as conexões já estão na mesa.', 'aviso');

    // distribui em círculo à volta da origem (raio ~175px; ângulo por índice no loop)
    const raio = 175;
    const passo = (2 * Math.PI) / novos.length;
    novos.forEach((id, i) => {
        const ang = i * passo;
        boardState.nodes.push({
            id,
            x: Math.round(origem.x + Math.cos(ang) * raio),
            y: Math.round(origem.y + Math.sin(ang) * raio),
        });
    });

    renderBoard();          // injeta os novos cards
    atualizarLinksBoard();  // redesenha as sinapses (as linhas surgem automaticamente)
    mostrarToast(`${novos.length} entidade(s) conectada(s) trazida(s) para a mesa!`, 'sucesso');
};
window.selNodeCor = function(btn) {
    editorNodeCor = btn.dataset.c;
    btn.parentElement.querySelectorAll('.board-cor-swatch').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
};
window.selNodeIcone = function(btn) {
    editorNodeIcone = btn.dataset.ic;
    btn.parentElement.querySelectorAll('.board-icone-opt').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
};
window.resetNodeVisual = function() { editorNodeCor = null; editorNodeIcone = null; salvarEditorNode(); };
window.salvarEditorNode = function() {
    const node = boardState.nodes.find(n => String(n.id) === String(editorNodeId));
    if (node) {
        if (editorNodeCor) node.cor = editorNodeCor; else delete node.cor;
        if (editorNodeIcone) node.icone = editorNodeIcone; else delete node.icone;
    }
    fecharPopover();
    renderBoard(); // re-render aplica cor/ícone e redesenha as linhas (cache)
};