let regrasCache = [];

window.inicializarMotorDeRegras = async function(sistemaNome = 'mago_m20') {
    const divResultados = document.getElementById('resultados-regras');
    if (!divResultados) return;

    try {
        const res = await fetch(`/regras/${sistemaNome}.json`);
        if (res.ok) {
            regrasCache = await res.json();
            divResultados.innerHTML = '<p style="color: var(--sucesso); font-size: 12px;"><i data-lucide="check-circle" style="width:14px; height:14px;"></i> Compêndio carregado e pronto para busca.</p>';
            lucide.createIcons();
        } else {
            divResultados.innerHTML = '<p style="color: var(--erro); font-size: 12px;">Falha ao localizar o compêndio de regras no servidor.</p>';
        }
    } catch (err) {
        console.error("Erro no Motor de Regras:", err);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const inputBusca = document.getElementById('busca-regras');
    if (!inputBusca) return;

    inputBusca.addEventListener('input', (e) => {
        const termo = e.target.value.trim().toLowerCase();
        const divResultados = document.getElementById('resultados-regras');

        if (termo.length < 2) {
            divResultados.innerHTML = '<p style="color: var(--texto-mutado); font-size: 12px;">Digite pelo menos 2 letras para buscar.</p>';
            return;
        }

        const filtradas = regrasCache.filter(r =>
            (r.titulo && r.titulo.toLowerCase().includes(termo)) ||
            (r.texto && r.texto.toLowerCase().includes(termo)) ||
            (r.categoria && r.categoria.toLowerCase().includes(termo))
        );

        if (filtradas.length === 0) {
            divResultados.innerHTML = '<p style="color: var(--texto-mutado); font-size: 12px;">Nenhuma regra encontrada para este termo.</p>';
            return;
        }

        divResultados.innerHTML = filtradas.map(r => `
            <div class="item-interativo" style="margin-bottom: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px;">
                <strong style="color: var(--roxo-mago); font-size: 14px;">${escapeHTML(r.titulo)}</strong>
                <div>
                    <span style="font-size: 10px; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; color: var(--texto-mutado);">${escapeHTML(r.categoria)}</span>
                </div>
                <p style="margin: 0; line-height: 1.5; color: var(--texto-claro); font-size: 12px;">${escapeHTML(r.texto)}</p>
                ${r.pagina ? `<div style="font-size: 11px; color: var(--destaque); margin-top: 4px;"><i data-lucide="book-open" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle;"></i> Pág: ${r.pagina}</div>` : ''}
            </div>
        `).join('');

        lucide.createIcons();
    });
});
