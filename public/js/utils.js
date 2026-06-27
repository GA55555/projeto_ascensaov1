// public/js/utils.js
// Utilidades partilhadas de segurança e sessão. Deve ser carregado ANTES dos scripts principais.

// Sanitização de HTML centralizada (prevenção de XSS — Regra 6.1).
window.escapeHTML = (s) => { if (s === null || s === undefined) return ''; return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); };

// Renderiza um SUBCONJUNTO seguro de Markdown vindo de texto NÃO-confiável (ex.: resposta da IA do
// Oráculo). XSS (Regra 6.1): escapa TODO o HTML PRIMEIRO e só então injeta a nossa tag-set fixa
// (strong/em/code/p/br/ul/ol/li). Como o texto já vem escapado, os únicos '<'/'>' do resultado são os
// nossos — sem vetor de injeção. Zero libs (Regra 1): parser vanilla, linha-a-linha p/ blocos + regex
// p/ inline. Suporta: títulos (#..######), negrito (**), itálico (* ou _), código (`), listas (- + 1.).
window.renderMarkdownSeguro = (texto) => {
    const esc = window.escapeHTML(texto);
    const inline = (t) => t
        .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+?)`/g, '<code>$1</code>')
        .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
        .replace(/(^|[^_\w])_([^_\s][^_]*?)_/g, '$1<em>$2</em>');

    const out = [];
    let lista = null;     // 'ul' | 'ol' | null — lista de bloco aberta
    let paragrafo = [];   // linhas de texto a juntar num <p> (newline simples → <br>)
    const flushPar = () => { if (paragrafo.length) { out.push(`<p>${paragrafo.join('<br>')}</p>`); paragrafo = []; } };
    const flushLista = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };

    for (const bruta of esc.split('\n')) {
        const l = bruta.trim();
        let m;
        if (!l) { flushPar(); flushLista(); continue; }          // linha em branco fecha bloco
        if ((m = l.match(/^#{1,6}\s+(.*)$/))) {                  // título
            flushPar(); flushLista();
            out.push(`<strong class="oraculo-md-h">${inline(m[1])}</strong>`);
        } else if ((m = l.match(/^[-*+]\s+(.*)$/))) {            // item de lista não-ordenada
            flushPar();
            if (lista !== 'ul') { flushLista(); out.push('<ul>'); lista = 'ul'; }
            out.push(`<li>${inline(m[1])}</li>`);
        } else if ((m = l.match(/^\d+[.)]\s+(.*)$/))) {          // item de lista ordenada
            flushPar();
            if (lista !== 'ol') { flushLista(); out.push('<ol>'); lista = 'ol'; }
            out.push(`<li>${inline(m[1])}</li>`);
        } else {                                                 // texto normal → parágrafo
            flushLista();
            paragrafo.push(inline(l));
        }
    }
    flushPar(); flushLista();
    return out.join('');
};

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
