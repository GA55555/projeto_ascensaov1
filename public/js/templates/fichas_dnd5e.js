// public/js/templates/fichas_dnd5e.js
// Ficha COMPLETA de D&D 5e — apenas o SCHEMA declarativo. Renderização delegada
// ao Motor Universal (window.RenderizadorFichas). Expõe window.renderizarFichaDnD(dados).
//
// Observação de contrato: HP usa os paths de topo `hp_atual` / `hp_maximo`, os mesmos
// que o modal de criação (gaveta.js) grava — garante o round-trip criação → editor.

(function () {
    // Perícia/Save: tipo composto (proficiência + valor) — gera <path>.proficiente e <path>.valor.
    const SKILL = (label, chave) => ({ tipo: 'pericia', label, path: `pericias.${chave}`, min: -10, max: 30 });
    const SAVE  = (label, chave) => ({ tipo: 'pericia', label, path: `testes_resistencia.${chave}`, min: -10, max: 30 });

    const ATRIBUTOS = [
        { label: 'Força',        path: 'atributos.forca',        tipo: 'numero', min: 1, max: 30, padrao: 10 },
        { label: 'Destreza',     path: 'atributos.destreza',     tipo: 'numero', min: 1, max: 30, padrao: 10 },
        { label: 'Constituição', path: 'atributos.constituicao', tipo: 'numero', min: 1, max: 30, padrao: 10 },
        { label: 'Inteligência', path: 'atributos.inteligencia', tipo: 'numero', min: 1, max: 30, padrao: 10 },
        { label: 'Sabedoria',    path: 'atributos.sabedoria',    tipo: 'numero', min: 1, max: 30, padrao: 10 },
        { label: 'Carisma',      path: 'atributos.carisma',      tipo: 'numero', min: 1, max: 30, padrao: 10 }
    ];

    const PERICIAS = [
        SKILL('Acrobacia (Des)', 'acrobacia'),
        SKILL('Adestrar Animais (Sab)', 'adestrar_animais'),
        SKILL('Arcanismo (Int)', 'arcanismo'),
        SKILL('Atletismo (For)', 'atletismo'),
        SKILL('Atuação (Car)', 'atuacao'),
        SKILL('Enganação (Car)', 'enganacao'),
        SKILL('Furtividade (Des)', 'furtividade'),
        SKILL('História (Int)', 'historia'),
        SKILL('Intimidação (Car)', 'intimidacao'),
        SKILL('Intuição (Sab)', 'intuicao'),
        SKILL('Investigação (Int)', 'investigacao'),
        SKILL('Medicina (Sab)', 'medicina'),
        SKILL('Natureza (Int)', 'natureza'),
        SKILL('Percepção (Sab)', 'percepcao'),
        SKILL('Persuasão (Car)', 'persuasao'),
        SKILL('Prestidigitação (Des)', 'prestidigitacao'),
        SKILL('Religião (Int)', 'religiao'),
        SKILL('Sobrevivência (Sab)', 'sobrevivencia')
    ];

    const SAVES = [
        SAVE('Força', 'forca'),
        SAVE('Destreza', 'destreza'),
        SAVE('Constituição', 'constituicao'),
        SAVE('Inteligência', 'inteligencia'),
        SAVE('Sabedoria', 'sabedoria'),
        SAVE('Carisma', 'carisma')
    ];

    const morte = (rotulo, chave) => ({ label: rotulo, path: `salvaguardas_morte.${chave}`, tipo: 'checkbox' });

    // Espaços de magia e listas por nível (1–9), gerados dinamicamente.
    const ESPACOS = [];
    const LISTAS_MAGIA = [];
    for (let n = 1; n <= 9; n++) {
        ESPACOS.push({ label: `Nível ${n}`, path: `magias.espacos.nivel_${n}`, tipo: 'numero', min: 0, max: 9, padrao: 0 });
        LISTAS_MAGIA.push({ label: `Magias de Nível ${n}`, path: `magias.lista.nivel_${n}`, tipo: 'textarea' });
    }

    const schemaDnD = [
        {
            titulo: 'Identidade',
            icone: 'user-round',
            blocos: [{
                grid: 'grid-3col',
                campos: [
                    { label: 'Classe',       path: 'identidade.classe',      tipo: 'texto' },
                    { label: 'Nível',        path: 'identidade.nivel',       tipo: 'numero', min: 1, max: 20, padrao: 1 },
                    { label: 'Raça',         path: 'identidade.raca',        tipo: 'texto' },
                    { label: 'Antecedente',  path: 'identidade.antecedente', tipo: 'texto' },
                    { label: 'Alinhamento',  path: 'identidade.alinhamento', tipo: 'texto' },
                    { label: 'Experiência',  path: 'identidade.experiencia', tipo: 'numero', min: 0, padrao: 0 }
                ]
            }]
        },
        {
            titulo: 'Atributos',
            icone: 'dices',
            blocos: [{ grid: 'grid-3col', campos: ATRIBUTOS }]
        },
        {
            titulo: 'Combate',
            icone: 'swords',
            blocos: [{
                grid: 'grid-4col',
                campos: [
                    { label: 'Classe de Armadura', path: 'combate.ca',                  tipo: 'numero', min: 0, max: 40, padrao: 10 },
                    { label: 'Iniciativa',         path: 'combate.iniciativa',          tipo: 'numero', min: -10, max: 30, padrao: 0 },
                    { label: 'Deslocamento',       path: 'combate.deslocamento',        tipo: 'numero', min: 0, max: 200, padrao: 9 },
                    { label: 'Bônus de Proficiência', path: 'combate.bonus_proficiencia', tipo: 'numero', min: 0, max: 10, padrao: 2 },
                    { label: 'Inspiração',         path: 'combate.inspiracao',          tipo: 'checkbox' }
                ]
            }]
        },
        {
            titulo: 'Pontos de Vida',
            icone: 'heart',
            blocos: [
                {
                    grid: 'grid-4col',
                    campos: [
                        { label: 'HP Máximo',    path: 'hp_maximo',     tipo: 'numero', min: 0, padrao: 0 },
                        { label: 'HP Atual',     path: 'hp_atual',      tipo: 'numero', min: 0, padrao: 0 },
                        { label: 'HP Temporário', path: 'hp_temporario', tipo: 'numero', min: 0, padrao: 0 },
                        { label: 'Dado de Vida', path: 'dado_de_vida',  tipo: 'texto' }
                    ]
                },
                {
                    titulo: 'Salvaguardas contra a Morte',
                    grid: 'grid-2col',
                    colunas: [
                        { titulo: 'Sucessos', campos: [morte('Sucesso 1', 'sucesso_1'), morte('Sucesso 2', 'sucesso_2'), morte('Sucesso 3', 'sucesso_3')] },
                        { titulo: 'Falhas',   campos: [morte('Falha 1', 'falha_1'), morte('Falha 2', 'falha_2'), morte('Falha 3', 'falha_3')] }
                    ]
                }
            ]
        },
        {
            titulo: 'Testes de Resistência',
            icone: 'shield-check',
            blocos: [{ grid: 'grid-3col', campos: SAVES }]
        },
        {
            titulo: 'Perícias',
            icone: 'list-checks',
            blocos: [{ grid: 'grid-2col', campos: PERICIAS }]
        },
        {
            titulo: 'Ataques',
            icone: 'sword',
            blocos: [{
                grid: 'grid-1col',
                campos: [
                    { label: 'Ataques (nome · bônus de ataque · dano/tipo)', path: 'ataques.lista', tipo: 'textarea' }
                ]
            }]
        },
        {
            titulo: 'Equipamento',
            icone: 'backpack',
            blocos: [
                {
                    titulo: 'Moedas',
                    grid: 'grid-3col',
                    campos: [
                        { label: 'PC (Cobre)',   path: 'moedas.pc', tipo: 'numero', min: 0, padrao: 0 },
                        { label: 'PP (Prata)',   path: 'moedas.pp', tipo: 'numero', min: 0, padrao: 0 },
                        { label: 'PE (Electro)', path: 'moedas.pe', tipo: 'numero', min: 0, padrao: 0 },
                        { label: 'PO (Ouro)',    path: 'moedas.po', tipo: 'numero', min: 0, padrao: 0 },
                        { label: 'PL (Platina)', path: 'moedas.pl', tipo: 'numero', min: 0, padrao: 0 }
                    ]
                },
                {
                    grid: 'grid-1col',
                    campos: [{ label: 'Equipamento e Posses', path: 'equipamento.lista', tipo: 'textarea' }]
                }
            ]
        },
        {
            titulo: 'Características & Traços',
            icone: 'scroll-text',
            blocos: [
                {
                    grid: 'grid-2col',
                    campos: [
                        { label: 'Traços de Personalidade', path: 'tracos.personalidade', tipo: 'textarea' },
                        { label: 'Ideais',                  path: 'tracos.ideais',        tipo: 'textarea' },
                        { label: 'Vínculos',                path: 'tracos.vinculos',      tipo: 'textarea' },
                        { label: 'Defeitos',                path: 'tracos.defeitos',      tipo: 'textarea' }
                    ]
                },
                {
                    grid: 'grid-1col',
                    campos: [
                        { label: 'Características e Habilidades de Classe', path: 'tracos.habilidades_classe', tipo: 'textarea' },
                        { label: 'Outras Proficiências e Idiomas',         path: 'tracos.proficiencias_idiomas', tipo: 'textarea' }
                    ]
                }
            ]
        },
        {
            titulo: 'Magias',
            icone: 'sparkles',
            blocos: [
                {
                    titulo: 'Conjuração',
                    grid: 'grid-3col',
                    campos: [
                        { label: 'Habilidade de Conjuração',   path: 'magias.habilidade',     tipo: 'texto' },
                        { label: 'CD da Magia',                path: 'magias.cd',             tipo: 'numero', min: 0, max: 30, padrao: 8 },
                        { label: 'Bônus de Ataque de Magia',   path: 'magias.bonus_ataque',   tipo: 'numero', min: -5, max: 30, padrao: 0 }
                    ]
                },
                {
                    titulo: 'Espaços de Magia (por nível)',
                    grid: 'grid-3col',
                    campos: ESPACOS
                },
                {
                    grid: 'grid-1col',
                    campos: [{ label: 'Truques (Cantrips)', path: 'magias.truques', tipo: 'textarea' }]
                },
                {
                    grid: 'grid-2col',
                    campos: LISTAS_MAGIA
                }
            ]
        }
    ];

    window.renderizarFichaDnD = function (dados) {
        return window.RenderizadorFichas.gerarHTML(schemaDnD, dados);
    };
})();
