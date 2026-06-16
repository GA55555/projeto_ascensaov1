// public/js/api.js

// Injetor de tema — roda antes do <body> para evitar flash
(function() {
    const temaAtivo = localStorage.getItem('m20_tema');
    if (temaAtivo && temaAtivo !== 'padrao') {
        document.documentElement.classList.add(temaAtivo);
    }
})();

window.escapeHTML = function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const API = {
    /**
     * Função que substitui o fetch nativo.
     * Ela injeta o token automaticamente e lida com erros de sessão.
     */
    async fetch(url, options = {}) {
        const token = localStorage.getItem('m20_token');
        
        // Se a página exige login e não há token, expulsa imediatamente
        if (!token && !url.includes('/login') && !url.includes('/registro')) {
            window.location.href = '/login.html';
            return Promise.reject("Usuário não autenticado");
        }

        // Prepara os cabeçalhos (headers)
        const headers = {
            ...options.headers,
        };

        // Injeta o token de autorização
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Se estiver enviando JSON, garante o Content-Type
        if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        // Nota: Quando enviamos FormData (para imagens), não colocamos Content-Type.
        // O navegador faz isso sozinho.

        const configFinal = {
            ...options,
            headers
        };

        try {
            const resposta = await fetch(url, configFinal);

            // Se o servidor avisar que o token é inválido ou expirou (401 ou 403)
            if (resposta.status === 401 || resposta.status === 403) {
                console.warn("Acesso negado ou sessão expirada. Redirecionando...");
                localStorage.removeItem('m20_token'); // Limpa o token morto
                window.location.href = '/login.html';
                throw new Error("Sessão expirada. Faça login novamente.");
            }

            return resposta;
        } catch (erro) {
            console.error("Erro de comunicação com o servidor:", erro);
            // Avisa o utilizador instantaneamente se a internet cair ou o servidor desligar
            if (window.mostrarToast) {
                window.mostrarToast("Erro de comunicação com o servidor.", "erro");
            }
            throw erro;
        }
    }
};

const RPGIcons = {
    cache: new Map(),
    async carregar(nome) {
        if (this.cache.has(nome)) return this.cache.get(nome);
        try {
            const response = await fetch(`/icons/rpg/${nome}.svg`);
            if (!response.ok) return '';
            const svgText = await response.text();
            this.cache.set(nome, svgText);
            return svgText;
        } catch (err) {
            console.error(`Erro ao carregar SVG: ${nome}`, err);
            return '';
        }
    },
    async renderizar() {
        const elementos = document.querySelectorAll('[data-icon-rpg]:not(.svg-renderizado)');
        for (const el of elementos) {
            const nome = el.getAttribute('data-icon-rpg');
            const svg = await this.carregar(nome);
            if (svg) {
                el.innerHTML = svg;
                el.classList.add('svg-renderizado');
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    RPGIcons.renderizar();
});