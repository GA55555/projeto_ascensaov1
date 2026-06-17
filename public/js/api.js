// public/js/api.js

// Injetor de tema — roda antes do <body> para evitar flash
(function() {
    const temaAtivo = localStorage.getItem('m20_tema');
    if (temaAtivo && temaAtivo !== 'padrao') {
        document.documentElement.classList.add(temaAtivo);
    }
})();

// escapeHTML vive exclusivamente em utils.js (fonte única — Regra 6.1).

const API = {
    async fetch(url, options = {}) {
        const headers = {
            ...options.headers,
        };

        if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const configFinal = {
            ...options,
            headers,
            credentials: 'include'
        };

        try {
            const resposta = await fetch(url, configFinal);

            if (resposta.status === 401 || resposta.status === 403) {
                console.warn("Acesso negado ou sessão expirada. Redirecionando...");
                localStorage.removeItem('m20_user');
                window.location.href = '/login.html';
                throw new Error("Sessão expirada. Faça login novamente.");
            }

            return resposta;
        } catch (erro) {
            console.error("Erro de comunicação com o servidor:", erro);
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