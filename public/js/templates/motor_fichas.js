// public/js/templates/motor_fichas.js
// MOTOR UNIVERSAL DE FICHAS (Schema-Driven UI).
// Expõe window.RenderizadorFichas.gerarHTML(schema, dados) — converte um schema
// declarativo em HTML, eliminando o "HTML esparguete" das fichas específicas.
//
// Contrato de saída (consumido por gaveta.js → coletarDadosFicha):
//   - todo campo editável carrega data-path="caminho.aninhado"
//   - checkbox usa <input type="checkbox" data-path> (lido via .checked)
//
// Modelo do schema:
//   schema  : [ secção, ... ]
//   secção  : { titulo, icone, blocos: [bloco, ...] }
//   bloco   : { grid, titulo?, campos?: [campo...], colunas?: [{titulo, campos:[campo...]}, ...] }
//   campo   : { label, path, tipo: 'numero'|'texto'|'textarea'|'checkbox', min?, max?, padrao? }
//
// Blocos de uma mesma secção são separados por <hr class="divisor-ficha">.

(function () {
    // Higienização obrigatória antes de qualquer innerHTML (Regra 6.1).
    const esc = (v) => (window.escapeHTML ? window.escapeHTML(String(v)) : String(v));

    // Leitura segura de caminho aninhado (ex: 'atributos.fisicos.forca.valor').
    function ler(dados, caminho, padrao) {
        const v = String(caminho).split('.').reduce(
            (o, k) => (o && o[k] !== undefined ? o[k] : undefined),
            dados
        );
        return v !== undefined && v !== null ? v : (padrao !== undefined ? padrao : '');
    }

    function renderCampo(campo, dados) {
        const path = esc(campo.path);
        const label = esc(campo.label);

        switch (campo.tipo) {
            case 'numero': {
                const min = campo.min !== undefined ? ` min="${Number(campo.min)}"` : '';
                const max = campo.max !== undefined ? ` max="${Number(campo.max)}"` : '';
                const valor = esc(ler(dados, campo.path, campo.padrao));
                return `
            <div class="campo">
                <label>${label}</label>
                <input type="number" class="input-sm valor-numerico" data-path="${path}"${min}${max} value="${valor}">
            </div>`;
            }

            case 'textarea':
                return `
            <div class="campo">
                <label>${label}</label>
                <textarea data-path="${path}">${esc(ler(dados, campo.path, campo.padrao))}</textarea>
            </div>`;

            case 'checkbox': {
                const marcado = ler(dados, campo.path, false) ? 'checked' : '';
                // Reutiliza .check-item (sem wrapper .campo), espelhando a ficha de papel.
                return `
            <label class="check-item">
                <input type="checkbox" data-path="${path}" ${marcado}> ${label}
            </label>`;
            }

            case 'texto':
            default: {
                if (campo.tipo !== 'texto') {
                    console.warn(`[RenderizadorFichas] tipo desconhecido "${campo.tipo}" em "${campo.path}" — tratado como texto.`);
                }
                return `
            <div class="campo">
                <label>${label}</label>
                <input type="text" class="input-sm" data-path="${path}" value="${esc(ler(dados, campo.path, campo.padrao))}">
            </div>`;
            }
        }
    }

    function renderBloco(bloco, dados) {
        const subtitulo = bloco.titulo
            ? `<h4 class="ficha-coluna-titulo">${esc(bloco.titulo)}</h4>`
            : '';

        let interior;
        if (Array.isArray(bloco.colunas)) {
            // Colunas com sub-título (ex: Físicos / Sociais / Mentais).
            interior = bloco.colunas.map((col) => `
                <div>
                    ${col.titulo ? `<h4 class="ficha-coluna-titulo">${esc(col.titulo)}</h4>` : ''}
                    ${(col.campos || []).map((c) => renderCampo(c, dados)).join('')}
                </div>`).join('');
        } else {
            interior = (bloco.campos || []).map((c) => renderCampo(c, dados)).join('');
        }

        return `${subtitulo}<div class="${esc(bloco.grid || 'grid-2col')}">${interior}</div>`;
    }

    function renderSecao(secao, dados) {
        const icone = secao.icone ? `<i data-lucide="${esc(secao.icone)}"></i> ` : '';
        const blocos = (secao.blocos || [])
            .map((b) => renderBloco(b, dados))
            .join('<hr class="divisor-ficha">');

        return `
        <div class="card campo-grupo">
            <h3 class="ficha-secao-titulo">${icone}${esc(secao.titulo || '')}</h3>
            ${blocos}
        </div>`;
    }

    window.RenderizadorFichas = {
        // schema: array de secções; dados: objeto dados_ficha (JSONB).
        // Devolve a ficha completa embrulhada no container .ficha-a4.
        gerarHTML: function (schema, dados) {
            dados = dados || {};
            const secoes = (schema || []).map((s) => renderSecao(s, dados)).join('');
            return `<div class="ficha-a4">${secoes}</div>`;
        }
    };
})();
