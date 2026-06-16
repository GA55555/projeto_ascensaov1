// public/js/gaveta.js
// Camada de UI para a Gaveta de Fichas. Depende de: api.js, gavetaApi.js, toast.js, modalConfirmacao.js

async function carregarFichas() {
    const container = document.getElementById('lista-minhas-fichas');
    try {
        const fichas = await GavetaApi.listar();

        if (fichas.length === 0) {
            container.innerHTML = `
                <div class="info-block-vazio">
                    <i data-lucide="file-question"></i>
                    <p>Nenhuma ficha salva ainda.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        container.innerHTML = fichas.map(f => `
            <div class="ficha-item" data-id="${escapeHTML(String(f.id))}">
                <div class="ficha-item-info">
                    <i data-lucide="file-text"></i>
                    <span>${escapeHTML(f.nome)}</span>
                </div>
                <div class="ficha-item-acoes">
                    <a href="${escapeHTML(f.url_arquivo)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline">
                        <i data-lucide="download"></i>
                    </a>
                    <button class="btn btn-sm btn-delete" data-action="deletar-ficha" data-id="${escapeHTML(String(f.id))}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `).join('');

        lucide.createIcons();
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
}

async function deletarFicha(id) {
    const confirmado = await abrirModalConfirmacao('Tem a certeza que quer apagar esta ficha permanentemente?');
    if (!confirmado) return;

    try {
        await GavetaApi.deletar(id);
        mostrarToast('Ficha removida com sucesso.', 'sucesso');
        carregarFichas();
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
}

// ── Inicialização ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const btnNovaFicha = document.getElementById('btn-nova-ficha');
    const inputUpload  = document.getElementById('input-upload-pdf');

    btnNovaFicha.addEventListener('click', () => inputUpload.click());

    inputUpload.addEventListener('change', async () => {
        const arquivo = inputUpload.files[0];
        if (!arquivo) return;

        const formData = new FormData();
        formData.append('ficha', arquivo);
        formData.append('nome', arquivo.name.replace(/\.pdf$/i, ''));

        setLoading('btn-nova-ficha', true, 'A enviar...');
        try {
            await GavetaApi.upload(formData);
            mostrarToast('Ficha enviada com sucesso!', 'sucesso');
            carregarFichas();
        } catch (err) {
            mostrarToast(err.message, 'erro');
        } finally {
            setLoading('btn-nova-ficha', false);
            inputUpload.value = '';
        }
    });

    // Delegação de eventos para o botão de apagar
    document.getElementById('lista-minhas-fichas').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="deletar-ficha"]');
        if (btn) deletarFicha(btn.dataset.id);
    });

    carregarFichas();
});
