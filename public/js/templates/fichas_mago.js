// public/js/templates/fichas_mago.js
// Ficha de Mago: A Ascensão (M20) — apenas o SCHEMA declarativo. A renderização
// é delegada ao Motor Universal (window.RenderizadorFichas).
// Layout: página contínua (scroll vertical), replicando a anatomia da ficha de papel.
// Cada controlo carrega o data-path exato (ex: atributos.fisicos.forca.valor).
// Expõe window.renderizarFichaMago(dados).

(function () {
    const TALENTOS = { prontidao: 'Prontidão', arte: 'Arte', esportes: 'Esportes', consciencia: 'Consciência', briga: 'Briga', empatia: 'Empatia', expressao: 'Expressão', intimidacao: 'Intimidação', lideranca: 'Liderança', manha: 'Manha', labia: 'Lábia' };
    const PERICIAS = { oficios: 'Ofícios', conducao: 'Condução', etiqueta: 'Etiqueta', armas_de_fogo: 'Armas de Fogo', artes_marciais: 'Artes Marciais', meditacao: 'Meditação', armas_brancas: 'Armas Brancas', pesquisa: 'Pesquisa', furtividade: 'Furtividade', sobrevivencia: 'Sobrevivência', tecnologia: 'Tecnologia' };
    const CONHECIMENTOS = { academicos: 'Acadêmicos', computador: 'Computador', cosmologia: 'Cosmologia', enigmas: 'Enigmas', esoterismo: 'Esoterismo', investigacao: 'Investigação', lei: 'Lei', medicina: 'Medicina', ocultismo: 'Ocultismo', politica: 'Política', ciencia: 'Ciência' };
    const ESFERAS = { correspondencia: 'Correspondência', entropia: 'Entropia', espirito: 'Espírito', forcas: 'Forças', materia: 'Matéria', mente: 'Mente', primordio: 'Primórdio', tempo: 'Tempo', vida: 'Vida' };
    const VITALIDADE = { escoriado: 'Escoriado', machucado: 'Machucado', ferido: 'Ferido', ferido_gravemente: 'Ferido Gravemente', espancado: 'Espancado', aleijado: 'Aleijado', incapacitado: 'Incapacitado' };

    // Traços (atributos/habilidades/esferas): cada um com sufixo .valor no path.
    function tracos(basePath, mapa, min, max, padrao) {
        return Object.entries(mapa).map(([chave, rotulo]) => ({
            label: rotulo, path: `${basePath}.${chave}.valor`, tipo: 'numero', min, max, padrao
        }));
    }

    // Campos de texto simples a partir de um mapa { chave: rótulo }.
    function textos(basePath, mapa) {
        return Object.entries(mapa).map(([chave, rotulo]) => ({
            label: rotulo, path: `${basePath}.${chave}`, tipo: 'texto'
        }));
    }

    const CABECALHO = { nome_civil: 'Nome Civil', nome_sombra: 'Nome de Sombra', jogador: 'Jogador', cronica: 'Crônica', natureza: 'Natureza', comportamento: 'Comportamento', essencia: 'Essência', afiliacao: 'Afiliação', seita: 'Seita', conceito: 'Conceito' };

    const schemaMago = [
        {
            titulo: 'Identidade',
            icone: 'user-round',
            blocos: [{ grid: 'grid-4col', campos: textos('cabecalho', CABECALHO) }]
        },
        {
            titulo: 'Atributos',
            icone: 'hexagon',
            blocos: [{
                grid: 'grid-3col',
                colunas: [
                    { titulo: 'Físicos', campos: tracos('atributos.fisicos', { forca: 'Força', destreza: 'Destreza', vigor: 'Vigor' }, 1, 5, 1) },
                    { titulo: 'Sociais', campos: tracos('atributos.sociais', { carisma: 'Carisma', manipulacao: 'Manipulação', aparencia: 'Aparência' }, 1, 5, 1) },
                    { titulo: 'Mentais', campos: tracos('atributos.mentais', { percepcao: 'Percepção', inteligencia: 'Inteligência', raciocinio: 'Raciocínio' }, 1, 5, 1) }
                ]
            }]
        },
        {
            titulo: 'Habilidades',
            icone: 'list-checks',
            blocos: [{
                grid: 'grid-3col',
                colunas: [
                    { titulo: 'Talentos', campos: tracos('habilidades.talentos', TALENTOS, 0, 5, 0) },
                    { titulo: 'Perícias', campos: tracos('habilidades.pericias', PERICIAS, 0, 5, 0) },
                    { titulo: 'Conhecimentos', campos: tracos('habilidades.conhecimentos', CONHECIMENTOS, 0, 5, 0) }
                ]
            }]
        },
        {
            titulo: 'Esferas',
            icone: 'orbit',
            blocos: [{ grid: 'grid-3col', campos: tracos('esferas', ESFERAS, 0, 5, 0) }]
        },
        {
            titulo: 'Vantagens',
            icone: 'sparkles',
            blocos: [
                {
                    grid: 'grid-4col',
                    campos: [
                        { label: 'Arete', path: 'vantagens.arete', tipo: 'numero', min: 1, max: 10, padrao: 1 },
                        { label: 'Força de Vontade', path: 'vantagens.forca_de_vontade', tipo: 'numero', min: 1, max: 10, padrao: 5 },
                        { label: 'Quintessência', path: 'vantagens.quintessencia', tipo: 'numero', min: 0, max: 20, padrao: 0 },
                        { label: 'Paradoxo', path: 'vantagens.paradoxo', tipo: 'numero', min: 0, max: 20, padrao: 0 }
                    ]
                },
                {
                    grid: 'grid-2col',
                    campos: [
                        { label: 'Antecedentes', path: 'vantagens.antecedentes', tipo: 'textarea' },
                        { label: 'Qualidades & Defeitos', path: 'vantagens.qualidades_e_defeitos', tipo: 'textarea' }
                    ]
                }
            ]
        },
        {
            titulo: 'Foco Mágico',
            icone: 'wand-sparkles',
            blocos: [{
                grid: 'grid-3col',
                campos: [
                    { label: 'Paradigma', path: 'foco_magico.paradigma', tipo: 'textarea' },
                    { label: 'Prática', path: 'foco_magico.pratica', tipo: 'textarea' },
                    { label: 'Instrumentos', path: 'foco_magico.instrumentos', tipo: 'textarea' }
                ]
            }]
        },
        {
            titulo: 'Combate & Saúde',
            icone: 'heart-pulse',
            blocos: [
                {
                    titulo: 'Vitalidade',
                    grid: 'grid-4col',
                    campos: Object.entries(VITALIDADE).map(([chave, rotulo]) => ({
                        label: rotulo, path: `combate_e_saude.vitalidade.${chave}`, tipo: 'checkbox'
                    }))
                },
                {
                    grid: 'grid-2col',
                    campos: [
                        { label: 'Experiência Atual', path: 'combate_e_saude.experiencia_atual', tipo: 'numero', min: 0, max: 9999, padrao: 0 },
                        { label: 'Experiência Total', path: 'combate_e_saude.experiencia_total', tipo: 'numero', min: 0, max: 9999, padrao: 0 }
                    ]
                }
            ]
        }
    ];

    window.renderizarFichaMago = function (dados) {
        return window.RenderizadorFichas.gerarHTML(schemaMago, dados);
    };
})();
