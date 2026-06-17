// public/js/templates/fichas_dnd5e.js
// Motor de renderização da ficha de D&D 5e. Expõe window.renderizarFichaDnD(dados).
// Inputs marcados com data-path para mapeamento direto ao objeto dados_ficha (JSONB).

(function () {
    const esc = (v) => (window.escapeHTML ? window.escapeHTML(String(v)) : String(v));

    // Leitura segura de caminho aninhado (ex: 'atributos.forca')
    function ler(dados, caminho, padrao = '') {
        const valor = caminho.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dados);
        return valor !== undefined && valor !== null ? valor : padrao;
    }

    function campoNumero(rotulo, caminho, dados, padrao = 10) {
        return `
            <div class="campo">
                <label>${esc(rotulo)}</label>
                <input type="number" class="valor-numerico" data-path="${esc(caminho)}" value="${esc(ler(dados, caminho, padrao))}">
            </div>`;
    }

    window.renderizarFichaDnD = function (dados) {
        dados = dados || {};
        return `
            <div class="card">
                <h3 class="ficha-secao-titulo"><i data-lucide="dices"></i> Atributos</h3>
                <div class="grid-2col">
                    ${campoNumero('Força', 'atributos.forca', dados)}
                    ${campoNumero('Destreza', 'atributos.destreza', dados)}
                    ${campoNumero('Constituição', 'atributos.constituicao', dados)}
                    ${campoNumero('Inteligência', 'atributos.inteligencia', dados)}
                    ${campoNumero('Sabedoria', 'atributos.sabedoria', dados)}
                    ${campoNumero('Carisma', 'atributos.carisma', dados)}
                </div>
            </div>
            <div class="card">
                <h3 class="ficha-secao-titulo"><i data-lucide="heart"></i> Pontos de Vida</h3>
                <div class="grid-2col">
                    ${campoNumero('HP Atual', 'hp_atual', dados, 0)}
                    ${campoNumero('HP Máximo', 'hp_maximo', dados, 0)}
                </div>
            </div>`;
    };
})();
