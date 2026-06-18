// public/js/templates/fichas_dnd5e.js
// Ficha de D&D 5e — apenas o SCHEMA declarativo. A renderização é delegada ao
// Motor Universal (window.RenderizadorFichas). Expõe window.renderizarFichaDnD(dados).

(function () {
    const schemaDnD = [
        {
            titulo: 'Atributos',
            icone: 'dices',
            blocos: [{
                grid: 'grid-2col',
                campos: [
                    { label: 'Força',        path: 'atributos.forca',        tipo: 'numero', padrao: 10 },
                    { label: 'Destreza',     path: 'atributos.destreza',     tipo: 'numero', padrao: 10 },
                    { label: 'Constituição', path: 'atributos.constituicao', tipo: 'numero', padrao: 10 },
                    { label: 'Inteligência', path: 'atributos.inteligencia', tipo: 'numero', padrao: 10 },
                    { label: 'Sabedoria',    path: 'atributos.sabedoria',    tipo: 'numero', padrao: 10 },
                    { label: 'Carisma',      path: 'atributos.carisma',      tipo: 'numero', padrao: 10 }
                ]
            }]
        },
        {
            titulo: 'Pontos de Vida',
            icone: 'heart',
            blocos: [{
                grid: 'grid-2col',
                campos: [
                    { label: 'HP Atual',  path: 'hp_atual',  tipo: 'numero', min: 0, padrao: 0 },
                    { label: 'HP Máximo', path: 'hp_maximo', tipo: 'numero', min: 0, padrao: 0 }
                ]
            }]
        }
    ];

    window.renderizarFichaDnD = function (dados) {
        return window.RenderizadorFichas.gerarHTML(schemaDnD, dados);
    };
})();
