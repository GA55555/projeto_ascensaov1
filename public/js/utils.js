// public/js/utils.js
// Utilidades partilhadas de segurança e sessão. Deve ser carregado ANTES dos scripts principais.

// Sanitização de HTML centralizada (prevenção de XSS — Regra 6.1).
window.escapeHTML = (s) => { if (s === null || s === undefined) return ''; return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); };

// Valida a sessão consultando o backend, que lê o Cookie HttpOnly automaticamente.
// Retorna true se a sessão é válida; redireciona para login.html e retorna false caso contrário.
async function verificarSessao() {
    try {
        const res = await API.fetch('/auth/verificar');
        if (res.status === 401 || res.status === 403) {
            window.location.href = '/login.html';
            return false;
        }
        return res.ok;
    } catch (err) {
        // API.fetch já redireciona em 401/403; este catch garante o redirect em qualquer falha.
        window.location.href = '/login.html';
        return false;
    }
}
window.verificarSessao = verificarSessao;
