// public/js/templates/fichas_mago.js
// Motor de renderização da ficha de Mago: A Ascensão (M20). Expõe window.renderizarFichaMago(dados).
// Inputs marcados com data-path para mapeamento direto ao objeto dados_ficha (JSONB).

(function () {
    const esc = (v) => (window.escapeHTML ? window.escapeHTML(String(v)) : String(v));

    function ler(dados, caminho, padrao = '') {
        const valor = caminho.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dados);
        return valor !== undefined && valor !== null ? valor : padrao;
    }

    function campoNumero(rotulo, caminho, dados, padrao = 1) {
        return `
            <div class="campo">
                <label>${esc(rotulo)}</label>
                <input type="number" class="valor-numerico" data-path="${esc(caminho)}" value="${esc(ler(dados, caminho, padrao))}" min="0" max="5">
            </div>`;
    }

    // Largura dinâmica da barra (0–20 -> 0–100%). Estilo inline permitido pela Regra 2.5 (mecânica de layout dinâmico).
    function larguraBarra(valor) {
        const pct = Math.max(0, Math.min(100, Number(valor || 0) * 5));
        return pct;
    }

    window.renderizarFichaMago = function (dados) {
        dados = dados || {};
        const quint = ler(dados, 'quintessencia', 0);
        const parad = ler(dados, 'paradoxo', 0);

        return `
            <div class="card">
                <h3 class="ficha-secao-titulo"><i data-lucide="dumbbell"></i> Atributos Físicos</h3>
                <div class="grid-2col">
                    ${campoNumero('Força', 'atributos.fisicos.forca', dados)}
                    ${campoNumero('Destreza', 'atributos.fisicos.destreza', dados)}
                    ${campoNumero('Vigor', 'atributos.fisicos.vigor', dados)}
                </div>
            </div>
            <div class="card">
                <h3 class="ficha-secao-titulo"><i data-lucide="users"></i> Atributos Sociais</h3>
                <div class="grid-2col">
                    ${campoNumero('Carisma', 'atributos.sociais.carisma', dados)}
                    ${campoNumero('Manipulação', 'atributos.sociais.manipulacao', dados)}
                    ${campoNumero('Aparência', 'atributos.sociais.aparencia', dados)}
                </div>
            </div>
            <div class="card">
                <h3 class="ficha-secao-titulo"><i data-lucide="brain"></i> Atributos Mentais</h3>
                <div class="grid-2col">
                    ${campoNumero('Percepção', 'atributos.mentais.percepcao', dados)}
                    ${campoNumero('Inteligência', 'atributos.mentais.inteligencia', dados)}
                    ${campoNumero('Raciocínio', 'atributos.mentais.raciocinio', dados)}
                </div>
            </div>
            <div class="card">
                <h3 class="ficha-secao-titulo"><i data-lucide="sparkles"></i> Roda do Avatar</h3>
                <div class="campo">
                    <label>Quintessência</label>
                    <div class="barra-bg"><div class="barra-fill" style="width: ${larguraBarra(quint)}%"></div></div>
                    <input type="number" class="valor-numerico" data-path="quintessencia" value="${esc(quint)}" min="0" max="20">
                </div>
                <div class="campo">
                    <label>Paradoxo</label>
                    <div class="barra-bg"><div class="barra-fill barra-alerta" style="width: ${larguraBarra(parad)}%"></div></div>
                    <input type="number" class="valor-numerico" data-path="paradoxo" value="${esc(parad)}" min="0" max="20">
                </div>
            </div>`;
    };
})();
