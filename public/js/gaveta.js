// public/js/gaveta.js
// Camada de UI para a Gaveta de Fichas Nativas (JSONB).
// Depende de: api.js, gavetaApi.js, toast.js, modalConfirmacao.js

const SISTEMAS = {
    mago_m20: 'Mago: A Ascensão (M20)',
    dnd5e: 'D&D 5ª Edição'
};

// Cache em memória das fichas carregadas — usado pelo editor para evitar re-fetch.
let fichasCache = [];

async function carregarFichas() {
    const container = document.getElementById('lista-minhas-fichas');
    try {
        const fichas = await GavetaApi.listar();
        fichasCache = fichas;

        if (fichas.length === 0) {
            container.innerHTML = `
                <div class="info-block-vazio">
                    <i data-lucide="file-question"></i>
                    <p>Nenhuma ficha salva ainda.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        container.innerHTML = fichas.map(f => {
            const versao = f.dados_ficha?.versao;
            const badge = versao ? `<span class="badge">${escapeHTML(String(versao))}</span>` : '';
            return `
            <div class="ficha-item" data-id="${escapeHTML(String(f.id))}">
                <div class="ficha-item-info">
                    <i data-lucide="scroll-text"></i>
                    <span>${escapeHTML(f.nome)}</span>
                    ${badge}
                    <span class="ficha-item-sistema">${escapeHTML(SISTEMAS[f.dados_ficha?.sistema] || f.dados_ficha?.sistema || '')}</span>
                </div>
                <div class="ficha-item-acoes">
                    <button class="btn btn-sm btn-outline" data-action="abrir-ficha" data-id="${escapeHTML(String(f.id))}">
                        <i data-lucide="edit"></i> Abrir / Editar
                    </button>
                    <button class="btn btn-sm btn-delete" data-action="deletar-ficha" data-id="${escapeHTML(String(f.id))}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>`;
        }).join('');

        lucide.createIcons();
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
}

async function deletarFicha(id, elemento) {
    const confirmado = await abrirModalConfirmacao('Tem certeza que deseja apagar esta ficha permanentemente? Esta ação não pode ser desfeita.');
    if (!confirmado) return;

    try {
        await GavetaApi.deletar(id);
        mostrarToast('Ficha removida com sucesso.', 'sucesso');
        elemento.remove();

        const container = document.getElementById('lista-minhas-fichas');
        if (container.querySelectorAll('.ficha-item').length === 0) {
            container.innerHTML = `
                <div class="info-block-vazio">
                    <i data-lucide="file-question"></i>
                    <p>Nenhuma ficha salva ainda.</p>
                </div>`;
            lucide.createIcons();
        }
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
}

// ── Modal de Criação de Ficha Nativa ─────────────────────────
function fecharModalCriarFicha() {
    const modal = document.getElementById('modal-criar-ficha');
    if (modal) modal.remove();
}

function abrirModalCriarFicha() {
    fecharModalCriarFicha(); // garante instância única

    const opcoesSistema = Object.entries(SISTEMAS)
        .map(([valor, rotulo]) => `<option value="${valor}">${rotulo}</option>`)
        .join('');

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-criar-ficha';
    modal.innerHTML = `
        <div class="modal-box modal-criar-box">
            <h2 class="modal-criar-titulo texto-roxo"><i data-lucide="swords"></i> Criar Nova Ficha</h2>
            <form id="form-criar-ficha">
                <div class="campo">
                    <label for="ficha-nome">Nome do Personagem</label>
                    <input type="text" id="ficha-nome" maxlength="100" placeholder="Ex: Aelwynn, a Vidente" required>
                </div>
                <div class="campo">
                    <label for="ficha-sistema">Sistema</label>
                    <select id="ficha-sistema">${opcoesSistema}</select>
                </div>
                <div class="grid-2col">
                    <div class="campo">
                        <label for="ficha-hp-atual"><i data-lucide="heart"></i> HP Atual</label>
                        <input type="number" id="ficha-hp-atual" value="10" min="0">
                    </div>
                    <div class="campo">
                        <label for="ficha-hp-maximo">HP Máximo</label>
                        <input type="number" id="ficha-hp-maximo" value="10" min="0">
                    </div>
                </div>
                <div class="acoes">
                    <button type="submit" id="btn-salvar-ficha" class="btn btn-primary">
                        <i data-lucide="save"></i> Salvar Ficha
                    </button>
                    <button type="button" id="btn-cancelar-ficha" class="btn btn-outline">Cancelar</button>
                </div>
            </form>
        </div>`;

    document.body.appendChild(modal);
    lucide.createIcons();

    document.getElementById('ficha-nome').focus();
    document.getElementById('btn-cancelar-ficha').addEventListener('click', fecharModalCriarFicha);
    modal.addEventListener('click', (e) => { if (e.target === modal) fecharModalCriarFicha(); });
    document.getElementById('form-criar-ficha').addEventListener('submit', salvarFicha);
}

async function salvarFicha(e) {
    e.preventDefault();

    const nome = document.getElementById('ficha-nome').value.trim();
    const sistema = document.getElementById('ficha-sistema').value;
    const hpAtual = Number(document.getElementById('ficha-hp-atual').value);
    const hpMaximo = Number(document.getElementById('ficha-hp-maximo').value);

    const payload = {
        nome,
        sistema,
        dados_ficha: {
            sistema,
            hp_atual: hpAtual,
            hp_maximo: hpMaximo
        }
    };

    setLoading('btn-salvar-ficha', true, 'A guardar...');
    try {
        await GavetaApi.criar(payload);
        fecharModalCriarFicha();
        mostrarToast('Ficha criada com sucesso!', 'sucesso');
        carregarFichas();
    } catch (err) {
        setLoading('btn-salvar-ficha', false);
        mostrarToast(err.message, 'erro');
    }
}

// ── Editor de Ficha (Modal Fullscreen) ───────────────────────
function fecharEditorFicha() {
    const modal = document.getElementById('modal-editor-ficha');
    if (modal) modal.remove();
}

function abrirEditorFicha(idFicha) {
    const ficha = fichasCache.find(f => String(f.id) === String(idFicha));
    if (!ficha) {
        mostrarToast('Ficha não encontrada na memória. Recarregue a lista.', 'erro');
        return;
    }

    const dados = ficha.dados_ficha || {};
    const sistema = dados.sistema;

    // Seleciona o motor de template correto pelo sistema da ficha.
    let corpo;
    if (sistema === 'dnd5e') {
        corpo = renderizarFichaDnD(dados);
    } else if (sistema === 'mago_m20') {
        corpo = renderizarFichaMago(dados);
    } else {
        corpo = `<div class="info-block-vazio"><i data-lucide="alert-triangle"></i><p>Sistema desconhecido: ${escapeHTML(String(sistema || '—'))}</p></div>`;
    }

    fecharEditorFicha(); // instância única

    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.id = 'modal-editor-ficha';
    modal.dataset.id = String(ficha.id);
    modal.innerHTML = `
        <div class="modal-box modal-editor-box">
            <div class="editor-topo">
                <h2 class="texto-roxo"><i data-lucide="scroll-text"></i> Editar Ficha</h2>
                <button type="button" id="btn-fechar-editor" class="btn btn-sm btn-ghost"><i data-lucide="x"></i></button>
            </div>

            <div class="editor-corpo">
                <div class="grid-2col">
                    <div class="campo">
                        <label for="editor-nome">Nome do Personagem</label>
                        <input type="text" id="editor-nome" maxlength="100" value="${escapeHTML(ficha.nome || '')}">
                    </div>
                    <div class="campo">
                        <label for="editor-versao">Versão / Nível</label>
                        <input type="text" id="editor-versao" data-path="versao" maxlength="50" value="${escapeHTML(String(dados.versao || ''))}" placeholder="Ex: Nível 5">
                    </div>
                </div>
                ${corpo}
            </div>

            <div class="editor-rodape acoes">
                <button type="button" id="btn-salvar-edicao" class="btn btn-primary">
                    <i data-lucide="save"></i> Salvar
                </button>
                <button type="button" id="btn-salvar-versao" class="btn btn-outline">
                    <i data-lucide="git-branch"></i> Salvar como Nova Versão
                </button>
                <button type="button" id="btn-cancelar-edicao" class="btn btn-secondary">Cancelar</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    lucide.createIcons();

    document.getElementById('btn-fechar-editor').addEventListener('click', fecharEditorFicha);
    document.getElementById('btn-cancelar-edicao').addEventListener('click', fecharEditorFicha);
    document.getElementById('btn-salvar-edicao').addEventListener('click', () => salvarEdicaoFicha(ficha.id));
    document.getElementById('btn-salvar-versao').addEventListener('click', () => salvarComoNovaVersao(ficha.id));
}

// Define um valor em caminho aninhado (ex: 'atributos.fisicos.forca').
function definirCaminho(obj, caminho, valor) {
    const chaves = caminho.split('.');
    let cursor = obj;
    chaves.forEach((chave, i) => {
        if (i === chaves.length - 1) {
            cursor[chave] = valor;
        } else {
            if (typeof cursor[chave] !== 'object' || cursor[chave] === null) cursor[chave] = {};
            cursor = cursor[chave];
        }
    });
}

// Varre os inputs[data-path] do modal e reconstrói o dados_ficha a partir do estado em cache.
function coletarDadosFicha(ficha) {
    const modal = document.getElementById('modal-editor-ficha');
    const dados = JSON.parse(JSON.stringify(ficha.dados_ficha || {})); // preserva sistema e campos não editáveis

    modal.querySelectorAll('input[data-path]').forEach(input => {
        const valor = input.type === 'number' ? Number(input.value) : input.value;
        definirCaminho(dados, input.dataset.path, valor);
    });

    return dados;
}

async function salvarEdicaoFicha(idFicha) {
    const ficha = fichasCache.find(f => String(f.id) === String(idFicha));
    if (!ficha) return;

    const nome = document.getElementById('editor-nome').value.trim();
    const versao = document.getElementById('editor-versao').value.trim();
    const dados_ficha = coletarDadosFicha(ficha);

    const payload = { nome, versao: versao || undefined, dados_ficha };

    setLoading('btn-salvar-edicao', true, 'A guardar...');
    try {
        await GavetaApi.atualizar(idFicha, payload);
        fecharEditorFicha();
        mostrarToast('Ficha atualizada com sucesso!', 'sucesso');
        carregarFichas();
    } catch (err) {
        setLoading('btn-salvar-edicao', false);
        mostrarToast(err.message, 'erro');
    }
}

async function salvarComoNovaVersao(idFicha) {
    const ficha = fichasCache.find(f => String(f.id) === String(idFicha));
    if (!ficha) return;

    const nome = document.getElementById('editor-nome').value.trim();
    const versao = document.getElementById('editor-versao').value.trim();
    const dados_ficha = coletarDadosFicha(ficha);
    const sistema = dados_ficha.sistema || ficha.dados_ficha?.sistema;

    // POST cria um novo registo (nova versão), preservando o original intacto.
    const payload = { nome, sistema, versao: versao || undefined, dados_ficha };

    setLoading('btn-salvar-versao', true, 'A ramificar...');
    try {
        await GavetaApi.criar(payload);
        fecharEditorFicha();
        mostrarToast('Nova versão da ficha criada!', 'sucesso');
        carregarFichas();
    } catch (err) {
        setLoading('btn-salvar-versao', false);
        mostrarToast(err.message, 'erro');
    }
}

// ── Inicialização ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const btnNovaFicha = document.getElementById('btn-nova-ficha');
    btnNovaFicha.addEventListener('click', abrirModalCriarFicha);

    // Delegação de eventos: abrir editor e apagar
    document.getElementById('lista-minhas-fichas').addEventListener('click', (e) => {
        const btnAbrir = e.target.closest('[data-action="abrir-ficha"]');
        if (btnAbrir) {
            abrirEditorFicha(btnAbrir.dataset.id);
            return;
        }
        const btnDeletar = e.target.closest('[data-action="deletar-ficha"]');
        if (btnDeletar) {
            const fichaItem = btnDeletar.closest('.ficha-item');
            deletarFicha(btnDeletar.dataset.id, fichaItem);
        }
    });

    carregarFichas();
});
