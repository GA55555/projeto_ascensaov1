// public/js/templates/fichas_mago.js
// Motor de renderização da ficha completa de Mago: A Ascensão 20º Aniversário (M20).
// Layout: PÁGINA CONTÍNUA (scroll vertical) — replicando a anatomia da ficha de papel. SEM ABAS.
// Cada controlo carrega o data-path exato para mapeamento ao JSONB (ex: atributos.fisicos.forca.valor).
// Expõe window.renderizarFichaMago(dados).

(function () {
    const esc = (v) => (window.escapeHTML ? window.escapeHTML(String(v)) : String(v));

    // Leitura segura de caminho aninhado (ex: 'atributos.fisicos.forca.valor').
    function ler(dados, caminho, padrao) {
        const v = caminho.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dados);
        return v !== undefined && v !== null ? v : padrao;
    }

    function inputTexto(rotulo, caminho, dados) {
        return `
            <div class="campo">
                <label>${esc(rotulo)}</label>
                <input type="text" data-path="${caminho}" value="${esc(ler(dados, caminho, ''))}">
            </div>`;
    }

    function inputNumero(rotulo, caminho, dados, min, max, padrao) {
        return `
            <div class="campo">
                <label>${esc(rotulo)}</label>
                <input type="number" class="valor-numerico" data-path="${caminho}" min="${min}" max="${max}" value="${esc(ler(dados, caminho, padrao))}">
            </div>`;
    }

    function inputTextarea(rotulo, caminho, dados) {
        return `
            <div class="campo">
                <label>${esc(rotulo)}</label>
                <textarea data-path="${caminho}">${esc(ler(dados, caminho, ''))}</textarea>
            </div>`;
    }

    function inputCheckbox(rotulo, caminho, dados) {
        const marcado = ler(dados, caminho, false) ? 'checked' : '';
        return `
            <label class="check-item">
                <input type="checkbox" data-path="${caminho}" ${marcado}> ${esc(rotulo)}
            </label>`;
    }

    // Constrói uma coluna de traços (atributos/habilidades/esferas), cada um com sufixo .valor.
    function colunaTracos(titulo, basePath, mapa, dados, min, max, padrao) {
        const linhas = Object.entries(mapa)
            .map(([chave, rotulo]) => inputNumero(rotulo, `${basePath}.${chave}.valor`, dados, min, max, padrao))
            .join('');
        return `
            <div>
                <h4 class="ficha-coluna-titulo">${esc(titulo)}</h4>
                ${linhas}
            </div>`;
    }

    // Esferas: traços diretos (sem agrupamento em colunas temáticas).
    function tracoSimples(rotulo, caminho, dados, min, max, padrao) {
        return inputNumero(rotulo, `${caminho}.valor`, dados, min, max, padrao);
    }

    const TALENTOS = { prontidao: 'Prontidão', arte: 'Arte', esportes: 'Esportes', consciencia: 'Consciência', briga: 'Briga', empatia: 'Empatia', expressao: 'Expressão', intimidacao: 'Intimidação', lideranca: 'Liderança', manha: 'Manha', labia: 'Lábia' };
    const PERICIAS = { oficios: 'Ofícios', conducao: 'Condução', etiqueta: 'Etiqueta', armas_de_fogo: 'Armas de Fogo', artes_marciais: 'Artes Marciais', meditacao: 'Meditação', armas_brancas: 'Armas Brancas', pesquisa: 'Pesquisa', furtividade: 'Furtividade', sobrevivencia: 'Sobrevivência', tecnologia: 'Tecnologia' };
    const CONHECIMENTOS = { academicos: 'Acadêmicos', computador: 'Computador', cosmologia: 'Cosmologia', enigmas: 'Enigmas', esoterismo: 'Esoterismo', investigacao: 'Investigação', lei: 'Lei', medicina: 'Medicina', ocultismo: 'Ocultismo', politica: 'Política', ciencia: 'Ciência' };
    const ESFERAS = { correspondencia: 'Correspondência', entropia: 'Entropia', espirito: 'Espírito', forcas: 'Forças', materia: 'Matéria', mente: 'Mente', primordio: 'Primórdio', tempo: 'Tempo', vida: 'Vida' };
    const VITALIDADE = { escoriado: 'Escoriado', machucado: 'Machucado', ferido: 'Ferido', ferido_gravemente: 'Ferido Gravemente', espancado: 'Espancado', aleijado: 'Aleijado', incapacitado: 'Incapacitado' };

    window.renderizarFichaMago = function (dados) {
        dados = dados || {};

        const esferasHTML = Object.entries(ESFERAS)
            .map(([chave, rotulo]) => tracoSimples(rotulo, `esferas.${chave}`, dados, 0, 5, 0))
            .join('');

        const vitalidadeHTML = Object.entries(VITALIDADE)
            .map(([chave, rotulo]) => inputCheckbox(rotulo, `combate_e_saude.vitalidade.${chave}`, dados))
            .join('');

        return `
            <!-- CABEÇALHO ──────────────────────────────────── -->
            <div class="card campo-grupo">
                <h3 class="ficha-secao-titulo"><i data-lucide="user-round"></i> Identidade</h3>
                <div class="grid-4col">
                    ${inputTexto('Nome Civil', 'cabecalho.nome_civil', dados)}
                    ${inputTexto('Nome de Sombra', 'cabecalho.nome_sombra', dados)}
                    ${inputTexto('Jogador', 'cabecalho.jogador', dados)}
                    ${inputTexto('Crônica', 'cabecalho.cronica', dados)}
                    ${inputTexto('Natureza', 'cabecalho.natureza', dados)}
                    ${inputTexto('Comportamento', 'cabecalho.comportamento', dados)}
                    ${inputTexto('Essência', 'cabecalho.essencia', dados)}
                    ${inputTexto('Afiliação', 'cabecalho.afiliacao', dados)}
                    ${inputTexto('Seita', 'cabecalho.seita', dados)}
                    ${inputTexto('Conceito', 'cabecalho.conceito', dados)}
                </div>
            </div>

            <!-- ATRIBUTOS ──────────────────────────────────── -->
            <div class="card campo-grupo">
                <h3 class="ficha-secao-titulo"><i data-lucide="hexagon"></i> Atributos</h3>
                <div class="grid-3col">
                    ${colunaTracos('Físicos', 'atributos.fisicos', { forca: 'Força', destreza: 'Destreza', vigor: 'Vigor' }, dados, 1, 5, 1)}
                    ${colunaTracos('Sociais', 'atributos.sociais', { carisma: 'Carisma', manipulacao: 'Manipulação', aparencia: 'Aparência' }, dados, 1, 5, 1)}
                    ${colunaTracos('Mentais', 'atributos.mentais', { percepcao: 'Percepção', inteligencia: 'Inteligência', raciocinio: 'Raciocínio' }, dados, 1, 5, 1)}
                </div>
            </div>

            <!-- HABILIDADES ────────────────────────────────── -->
            <div class="card campo-grupo">
                <h3 class="ficha-secao-titulo"><i data-lucide="list-checks"></i> Habilidades</h3>
                <div class="grid-3col">
                    ${colunaTracos('Talentos', 'habilidades.talentos', TALENTOS, dados, 0, 5, 0)}
                    ${colunaTracos('Perícias', 'habilidades.pericias', PERICIAS, dados, 0, 5, 0)}
                    ${colunaTracos('Conhecimentos', 'habilidades.conhecimentos', CONHECIMENTOS, dados, 0, 5, 0)}
                </div>
            </div>

            <!-- ESFERAS ────────────────────────────────────── -->
            <div class="card campo-grupo">
                <h3 class="ficha-secao-titulo"><i data-lucide="orbit"></i> Esferas</h3>
                <div class="grid-3col">
                    ${esferasHTML}
                </div>
            </div>

            <!-- VANTAGENS & FOCO ───────────────────────────── -->
            <div class="card campo-grupo">
                <h3 class="ficha-secao-titulo"><i data-lucide="sparkles"></i> Vantagens</h3>
                <div class="grid-4col">
                    ${inputNumero('Arete', 'vantagens.arete', dados, 1, 10, 1)}
                    ${inputNumero('Força de Vontade', 'vantagens.forca_de_vontade', dados, 1, 10, 5)}
                    ${inputNumero('Quintessência', 'vantagens.quintessencia', dados, 0, 20, 0)}
                    ${inputNumero('Paradoxo', 'vantagens.paradoxo', dados, 0, 20, 0)}
                </div>
                <hr class="divisor-ficha">
                <div class="grid-2col">
                    ${inputTextarea('Antecedentes', 'vantagens.antecedentes', dados)}
                    ${inputTextarea('Qualidades & Defeitos', 'vantagens.qualidades_e_defeitos', dados)}
                </div>
            </div>

            <div class="card campo-grupo">
                <h3 class="ficha-secao-titulo"><i data-lucide="wand-sparkles"></i> Foco Mágico</h3>
                <div class="grid-3col">
                    ${inputTextarea('Paradigma', 'foco_magico.paradigma', dados)}
                    ${inputTextarea('Prática', 'foco_magico.pratica', dados)}
                    ${inputTextarea('Instrumentos', 'foco_magico.instrumentos', dados)}
                </div>
            </div>

            <!-- COMBATE & SAÚDE ────────────────────────────── -->
            <div class="card campo-grupo">
                <h3 class="ficha-secao-titulo"><i data-lucide="heart-pulse"></i> Combate & Saúde</h3>
                <h4 class="ficha-coluna-titulo">Vitalidade</h4>
                <div class="grid-4col">
                    ${vitalidadeHTML}
                </div>
                <hr class="divisor-ficha">
                <div class="grid-2col">
                    ${inputNumero('Experiência Atual', 'combate_e_saude.experiencia_atual', dados, 0, 9999, 0)}
                    ${inputNumero('Experiência Total', 'combate_e_saude.experiencia_total', dados, 0, 9999, 0)}
                </div>
            </div>`;
    };
})();
