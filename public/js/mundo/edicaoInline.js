// ============================================================================
// edicaoInline.js — Edição inline de um rótulo de texto, COMPARTILHADA entre o
// Controle de Mundo e o Escudo (Caminho B). Toca o DOM (por isso separado das
// funções puras de mundoUtils.js). Carregar antes do script da página nas duas HTMLs.
// ============================================================================

// Troca o conteúdo do `alvo` por um <input>, salva no Enter/blur, cancela no Esc, com guarda
// anti-duplo-disparo. `aoSalvar(novo, atual, alvo)` faz a persistência + UI (otimista) só
// quando o valor mudou (≠ vazio e ≠ atual). Input criado via JS + addEventListener
// (funciona sob qualquer CSP). Substitui os prompt() de renomeação nas duas páginas.
function edicaoInlineTexto(alvo, { classe = 'input-inline-nome', maxLength = 120, aoSalvar }) {
    if (!alvo || alvo.querySelector('input')) return;
    const atual = alvo.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.className = classe; input.value = atual; input.maxLength = maxLength;
    alvo.textContent = ''; alvo.appendChild(input);
    input.focus(); input.select();
    let done = false;
    const fim = async (salvar) => {
        if (done) return; done = true;
        const novo = input.value.trim();
        if (!salvar || !novo || novo === atual) { alvo.textContent = atual; return; }
        await aoSalvar(novo, atual, alvo);
    };
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); fim(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); fim(false); }
    });
    input.addEventListener('blur', () => fim(true));
}
