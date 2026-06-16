// public/js/toast.js
// Depende de: /css/global_ui.css (classes .toast-container, .toast-msg, .toast-visivel, .toast-*)

function criarContainerToast() {
    if (document.getElementById('toast-container')) return;
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
}

window.mostrarToast = function(mensagem, tipo = 'info', duracao = 3500) {
    criarContainerToast();

    const iconeMap = {
        sucesso: '<i data-lucide="check-circle"></i>',
        erro:    '<i data-lucide="alert-circle"></i>',
        aviso:   '<i data-lucide="alert-triangle"></i>',
        info:    '<i data-lucide="info"></i>'
    };
    const icone = iconeMap[tipo] || '';

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${tipo}`;
    toast.innerHTML = `${icone}<span>${mensagem}</span>`;
    document.getElementById('toast-container').appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Força reflow antes de adicionar a classe de entrada para a transição funcionar
    requestAnimationFrame(() => toast.classList.add('toast-visivel'));

    setTimeout(() => {
        toast.classList.remove('toast-visivel');
        setTimeout(() => toast.remove(), 300);
    }, duracao);
};

window.setLoading = function(botaoId, carregando, textoOriginal = 'Salvar') {
    const botao = document.getElementById(botaoId);
    if (!botao) return;

    if (carregando) {
        botao.disabled = true;
        botao.dataset.textoOriginal = botao.textContent;
        botao.innerHTML = `${textoOriginal} <span class="spinner"></span>`;
        botao.classList.add('btn-loading');
    } else {
        botao.disabled = false;
        botao.textContent = botao.dataset.textoOriginal || textoOriginal;
        botao.classList.remove('btn-loading');
    }
};
