// public/js/modalConfirmacao.js
// Componente global de confirmação via modal. Auto-injeta no DOM se necessário.
// Depende de: /css/global_ui.css (estilos de #modal-confirmacao)

(function () {
    let _confirmResolve = null;

    function injetarModal() {
        if (document.getElementById('modal-confirmacao')) return;
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-confirmacao">
                <div class="modal-confirm-content">
                    <p class="modal-confirm-msg" id="modal-confirm-msg"></p>
                    <div class="modal-confirm-actions">
                        <button class="btn btn-danger" onclick="_cancelarConfirmacao()">Cancelar</button>
                        <button class="btn btn-success" onclick="_confirmarAcao()">Confirmar</button>
                    </div>
                </div>
            </div>
        `);
    }

    window.abrirModalConfirmacao = function (mensagem) {
        injetarModal();
        return new Promise(resolve => {
            document.getElementById('modal-confirm-msg').textContent = mensagem;
            _confirmResolve = resolve;
            document.getElementById('modal-confirmacao').classList.add('show');
        });
    };

    window._confirmarAcao = function () {
        document.getElementById('modal-confirmacao').classList.remove('show');
        if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
    };

    window._cancelarConfirmacao = function () {
        document.getElementById('modal-confirmacao').classList.remove('show');
        if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
    };

    // Injeta imediatamente se o DOM já estiver pronto, senão aguarda
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injetarModal);
    } else {
        injetarModal();
    }
}());
