const { z } = require('zod');

// ---- Schema auxiliar para nucleos_ids (opcional, array de UUIDs) ----
const nucleosIdsSchema = z.array(z.string().uuid()).optional();

// ---- Avatar/Brasão (Fase 15 — Atualização Imersiva, Fatia 2) ----
// Pastas DEDICADAS (não a 'avatares' de perfil, que é compartilhada) → a higiene de órfãos
// pode apagar com segurança. nullable = remover. Bloqueia externo/../javascript:/data:/.svg.
const avatarEntidadeSchema = z.string().regex(/^\/uploads\/entidades\/[\w-]+\.(webp|png|jpe?g)$/i, 'avatar inválido').nullable();
const avatarNucleoSchema   = z.string().regex(/^\/uploads\/nucleos\/[\w-]+\.(webp|png|jpe?g)$/i, 'brasão inválido').nullable();

// ---- AUTOMAÇÕES ----
const criarAutomacaoSchema = z.object({
    body: z.object({
        evento_id: z.string().uuid('evento_id deve ser um UUID válido'),
        tipo_nome: z.enum(['criar_flag', 'alterar_flag', 'postar_em_aba', 'criar_evento', 'criar_entidade'], { errorMap: () => ({ message: 'Tipo de ação inválido.' }) }),
        parametros: z.record(z.any()).optional().default({})
    })
});

const toggleStatusSchema = z.object({
    body: z.object({ ativo: z.boolean() })
});

// ---- ENTIDADES (NODES) ----
const criarNodeSchema = z.object({
    body: z.object({
        nome: z.string().min(1, 'Nome da entidade é obrigatório.'),
        tipo: z.enum(['npc', 'protagonista', 'faccao', 'local', 'cenario']).optional().default('npc'),
        nucleo_id: z.string().uuid().nullable().optional()
    })
});

const editarNodeSchema = z.object({
    body: z.object({
        nome: z.string().min(1, 'Nome da entidade é obrigatório.'),
        avatar_url: avatarEntidadeSchema.optional() // Fatia 2: foto da entidade (em world_nodes.dados)
    })
});

// ---- FLAGS ----
const criarFlagSchema = z.object({
    body: z.object({
        flag_key: z.string().min(1, 'Nome da flag não pode ser vazio.')
    })
});

const atualizarFlagSchema = z.object({
    body: z.object({
        flag_key: z.string().min(1),
        flag_value: z.boolean()
    })
});

const renomearFlagSchema = z.object({
    body: z.object({
        novo_nome: z.string().min(1, 'Novo nome da flag não pode ser vazio.')
    })
});

// ---- NÚCLEOS ----
const criarNucleoSchema = z.object({
    body: z.object({
        nome: z.string().min(1, 'Nome do núcleo é obrigatório.'),
        descricao: z.string().trim().max(2000).optional() // Constelação F3.1: breve descrição p/ a IA (em dados)
    })
});

const renomearNucleoSchema = z.object({ // nome + brasão opcional (Fatia 2) + descrição (Constelação F3.2)
    body: z.object({
        nome: z.string().min(1, 'Nome do núcleo é obrigatório.'),
        avatar_url: avatarNucleoSchema.optional(),
        descricao: z.string().trim().max(2000).optional()
    })
});

// ---- EVENTOS ----
const criarEventoSchema = z.object({
    body: z.object({
        nome: z.string().min(1, 'Nome do evento é obrigatório.'),
        descricao: z.string().optional().default(''),
        pool_maxima: z.number().int().min(1).optional().default(10),
        nucleos_ids: nucleosIdsSchema
    })
});

// ---- VÍNCULOS ----
const criarVinculoSchema = z.object({
    body: z.object({
        node_id: z.string().uuid('node_id deve ser um UUID válido'),
        flag_key: z.string().min(1, 'flag_key é obrigatória'),
        peso: z.number().int().min(1).optional().default(1)
    })
});

// ---- SESSÕES ----
const criarSessaoSchema = z.object({
    body: z.object({
        titulo: z.string().min(1, 'Título obrigatório.'),
        data_sessao: z.string().optional(),
        resumo: z.string().optional().default(''),
        status: z.enum(['planejada', 'em_andamento', 'concluida']).optional().default('planejada'),
        nucleo_id: z.string().uuid().nullable().optional(),
        nucleo_nome: z.string().optional(),
        entidades: z.array(z.string().uuid()).optional().default([]),
        eventos: z.array(z.string().uuid()).optional().default([]),
        automacoes: z.array(z.string().uuid()).optional().default([]),
        desfechos: z.array(z.string()).optional().default([])
    })
});

const editarSessaoSchema = criarSessaoSchema; // mesma estrutura

// ---- ATUALIZAR NÚCLEO DO NODE ----
const atualizarNucleoNodeSchema = z.object({
    body: z.object({
        nucleo_id: z.string().uuid().nullable().optional()
    })
});


// ---- SINAPSES (LINKS BIDIRECIONAIS) ----
// Regra 4.3: os params de rota também espelham UUID estrito (poliu a lacuna da autoavaliação).
const sinapseParamsBase = {
    cronicaId: z.string().uuid('cronicaId inválido.'),
    nodeId: z.string().uuid('nodeId inválido.')
};
const listarLinksSchema = z.object({
    params: z.object({ ...sinapseParamsBase })
});
// JSONB world_links.dados — "Reta de Relação" (reta_relacao.md): tags assinadas que somam uma posição
// bipolar -10..+10 (cada tag = 1 passo; gancho PESO_TAG p/ passos variáveis no futuro — decisão 4).
// CONTRATO TOLERANTE (expand-contract, Regra 4.2): a `tag` pode vir como STRING legada OU como objeto
// {texto, sinal, peso?} (UI nova). A leitura (relacaoEscala) normaliza os dois. O campo `limite` do antigo
// termômetro foi APOSENTADO (reta fixa ±10); um eventual `limite` residual de gravações legadas é
// descartado pelo strip do Zod (objeto strict). Chaves desconhecidas: strip do Zod.
const tagRelacaoSchema = z.union([
    z.string().trim().min(1).max(120), // legado (string sem sinal — polaridade inferida do tipo_vinculo)
    z.object({
        texto: z.string().trim().min(1).max(120),
        sinal: z.union([z.literal(1), z.literal(-1), z.literal(0)]).default(0),
        peso: z.number().int().min(1).max(10).optional() // PESO_TAG: gancho futuro (decisão 4); ausente ⇒ 1 passo
    })
]);
const dadosLinkSchema = z.object({
    tags: z.array(tagRelacaoSchema).max(50).default([])
}).optional();

const criarLinkSchema = z.object({
    params: z.object({ ...sinapseParamsBase }),
    body: z.object({
        destino_node_id: z.string().uuid('destino_node_id deve ser um UUID válido.'),
        tipo_vinculo: z.string().max(50).optional().default('associado'),
        dados: dadosLinkSchema
    })
});
const deletarLinkSchema = z.object({
    params: z.object({ ...sinapseParamsBase, linkId: z.string().uuid('linkId inválido.') })
});
const atualizarLinkSchema = z.object({
    params: z.object({ ...sinapseParamsBase, linkId: z.string().uuid('linkId inválido.') }),
    body: z.object({ dados: dadosLinkSchema })
});

// ---- TAROT (arquétipo da Jornada do Herói — Motor de Constelação) ----
// Guardado no JSONB `dados.tarot` da entidade/núcleo = {carta_num, orientacao}. Nome/significado vêm do
// catálogo (constante), não do payload. orientacao: 1 = em pé (+), -1 = invertida (−).
const tarotBodySchema = z.object({
    carta_num: z.number().int().min(0, 'Arcano deve ser 0–21.').max(21, 'Arcano deve ser 0–21.'),
    orientacao: z.union([z.literal(1), z.literal(-1)], { errorMap: () => ({ message: 'Orientação deve ser 1 (em pé) ou -1 (invertida).' }) })
});
const salvarTarotNodeSchema = z.object({
    params: z.object({ ...sinapseParamsBase }), // cronicaId + nodeId
    body: tarotBodySchema
});
const salvarTarotNucleoSchema = z.object({
    params: z.object({ cronicaId: z.string().uuid('cronicaId inválido.'), nucleoId: z.string().uuid('nucleoId inválido.') }),
    body: tarotBodySchema
});
// Constelação F3.4a: salvar em lote as posições de repouso dos núcleos (dados.pos) — salvamento MANUAL (Regra 2.7).
const salvarPosicoesSchema = z.object({
    params: z.object({ cronicaId: z.string().uuid('cronicaId inválido.') }),
    body: z.object({
        posicoes: z.array(z.object({
            id: z.string().uuid(),
            x: z.number(),
            y: z.number()
        })).max(2000)
    })
});

// ── TABULEIROS DE CAMPANHA (FASE 13): world_boards ──
// `dados` JSONB do Infinite Canvas. Cores são TOKENS de paleta (mapeados p/ vars
// CSS no front), nunca hex — coerência com a Regra 2.5. Chaves desconhecidas são
// descartadas pelo strip do Zod; arrays têm teto p/ não inflar o JSONB.
const CORES_BOARD = ['roxo', 'azul', 'verde', 'ambar', 'vermelho', 'cinza', 'rosa'];
const dadosBoardSchema = z.object({
    camera: z.object({
        x: z.number().finite().default(0),
        y: z.number().finite().default(0),
        zoom: z.number().finite().min(0.05).max(4).default(1) // min espelha o clamp do wheel (controle_mundo.js); só amplia o range → saves antigos seguem válidos
    }).default({ x: 0, y: 0, zoom: 1 }),
    // Plano de fundo da mesa (anti-Moiré aplicado no cliente). Opcional p/ migração
    // graciosa de boards antigos sem a chave (o cliente assume 'dots' por defeito).
    fundo: z.enum(['dots', 'grid', 'none']).optional(),
    // Tema do tabuleiro (Fase 15 — Atualização Imersiva, Fatia 3). Pura apresentação (classe
    // escopada no #board-canvas, Paradigma 5). Opcional p/ migração graciosa (cliente assume 'esquema').
    tema: z.enum(['esquema', 'investigacao']).optional(),
    // Imagem de fundo (Fase 15 — Atualização Imersiva, Fatia 1). url SÓ aceita caminho de
    // upload local (sem externo/javascript:/data:/traversal — R2/R3); nullable p/ remoção,
    // optional p/ boards antigos. rect em coords de mundo (posicionar na Fatia 1b).
    fundoImagem: z.object({
        // SÓ a pasta 'fundos' (não permite apontar p/ avatares/capas de outrem → o unlink de
        // higiene nunca apaga ficheiro alheio). Bloqueia externo/../javascript:/data:/.svg.
        url: z.string().regex(/^\/uploads\/fundos\/[\w-]+\.(webp|png|jpe?g)$/i, 'url de upload inválida'),
        x: z.number().finite(),
        y: z.number().finite(),
        w: z.number().finite().min(1),
        h: z.number().finite().min(1),
        opacidade: z.number().min(0).max(1).optional() // Fatia 1c (default 1 no cliente)
    }).nullable().optional(),
    nodes: z.array(z.object({
        id: z.string().uuid(),
        x: z.number().finite(),
        y: z.number().finite(),
        cor: z.enum(CORES_BOARD).optional(),
        icone: z.string().trim().max(40).optional()
    })).max(500).default([]),
    shapes: z.array(z.object({
        id: z.string().min(1).max(64),
        x: z.number().finite(),
        y: z.number().finite(),
        w: z.number().finite().min(0),
        h: z.number().finite().min(0),
        label: z.string().trim().max(120).optional(),
        cor: z.enum(CORES_BOARD).optional(),
        forma: z.enum(['retangulo', 'circulo', 'triangulo']).optional(),
        stroke: z.enum(['solid', 'dashed']).optional(),
        travada: z.boolean().optional() // zona fixa: não move nem redimensiona (cadeado no menu, controle_mundo)
    })).max(200).default([]),
    // Células de Núcleo (Fase 14 — Smart Containers): contêiner que importa e arrasta
    // em bando os membros de um núcleo. `id` é local do board (não-UUID, como shapes);
    // `nucleo_id` referencia entidade_nucleos.
    celulas: z.array(z.object({
        id: z.string().min(1).max(64),
        nucleo_id: z.string().uuid(),
        x: z.number().finite(),
        y: z.number().finite(),
        w: z.number().finite().min(0),
        h: z.number().finite().min(0),
        minimizada: z.boolean().optional(),
        cor: z.enum(CORES_BOARD).optional()
    })).max(100).default([]),
    // Textos flutuantes (sem card): texto puro arrastável. tamanho em px.
    texts: z.array(z.object({
        id: z.string().min(1).max(64),
        x: z.number().finite(),
        y: z.number().finite(),
        // Permite <b>/<i>/<br> do contenteditable (sanitizados no cliente); max maior p/ as tags.
        texto: z.string().trim().max(2000).optional(),
        cor: z.enum(CORES_BOARD).optional(),
        fundo: z.enum(['transparente', 'semi', 'denso']).optional(),
        align: z.enum(['left', 'center', 'right']).optional(),
        tamanho: z.number().finite().min(8).max(96).optional()
    })).max(200).default([]),
    // Props (ícones SVG de /public/icons/rpg/). `icone` = nome do ficheiro sem extensão;
    // regex anti path-traversal (Regra 4.2/6.x) — nunca aceitar barras/pontos.
    props: z.array(z.object({
        id: z.string().min(1).max(64),
        x: z.number().finite(),
        y: z.number().finite(),
        icone: z.string().trim().regex(/^[a-z0-9-]+$/, 'ícone inválido').max(60),
        scale: z.number().finite().min(0.2).max(5).optional(),
        rotacao: z.number().finite().min(0).max(360).optional(),
        cor: z.enum(CORES_BOARD).optional()
    })).max(200).default([]),
    // Ligações LOCAIS (entre zonas/props — fora de world_links, pois não são world_nodes).
    localLinks: z.array(z.object({
        id: z.string().min(1).max(64),
        sourceId: z.string().min(1).max(64),
        targetId: z.string().min(1).max(64),
        cor: z.enum(CORES_BOARD).optional(),
        stroke: z.enum(['solid', 'dashed']).optional(),
        label: z.string().trim().max(80).optional()
    })).max(300).default([]),
    overrides_linhas: z.record(
        z.string().max(120),
        z.object({
            cor: z.enum(['aliado', 'inimigo', 'neutro']).optional(),
            stroke: z.enum(['solid', 'dashed']).optional(),
            label: z.string().trim().max(80).optional()
        })
    ).default({})
}).default({});

const cronicaParamOnly = { cronicaId: z.string().uuid('cronicaId inválido.') };
const boardIdParams = { ...cronicaParamOnly, boardId: z.string().uuid('boardId inválido.') };

const criarBoardSchema = z.object({
    params: z.object({ ...cronicaParamOnly }),
    body: z.object({
        nome: z.string().trim().min(1, 'Nome do tabuleiro obrigatório.').max(255),
        dados: dadosBoardSchema.optional()
    })
});
const atualizarBoardSchema = z.object({
    params: z.object({ ...boardIdParams }),
    body: z.object({
        nome: z.string().trim().min(1).max(255).optional(),
        dados: dadosBoardSchema.optional()
    })
});
const boardIdParamsSchema = z.object({ params: z.object({ ...boardIdParams }) });

// ── DIPLOMACIA (FASE 14): relações núcleo↔núcleo (nucleo_diplomacia) ──
// PUT substitui o conjunto inteiro. status fechado em enum; A≠B garantido aqui.
const STATUS_DIPLOMACIA = ['aliado', 'inimigo', 'neutro'];
const salvarDiplomaciaSchema = z.object({
    params: z.object({ ...cronicaParamOnly }),
    body: z.object({
        relacoes: z.array(
            z.object({
                nucleoA: z.string().uuid('Núcleo A inválido.'),
                nucleoB: z.string().uuid('Núcleo B inválido.'),
                status: z.enum(STATUS_DIPLOMACIA)
            }).refine(r => r.nucleoA !== r.nucleoB, { message: 'Um núcleo não pode ter relação consigo mesmo.' })
        ).max(200).default([])
    })
});

// ── ORÁCULO (RAG): Big Bang (sincronização inicial) ──
// POST sem body; valida só o escopo (cronicaId UUID — Regras 3.1/4.3).
const sincronizarOraculoSchema = z.object({
    params: z.object({ ...cronicaParamOnly })
});

// ── ORÁCULO (RAG): Consulta (F4) ──
// Pergunta do Narrador em linguagem natural. Limite de tamanho contém custo de tokens (oraculo.md §8).
const consultarOraculoSchema = z.object({
    params: z.object({ ...cronicaParamOnly }),
    body: z.object({
        pergunta: z.string().trim().min(1, 'A pergunta não pode ser vazia.').max(1000, 'Pergunta longa demais.'),
        // Memória multi-turn: trocas anteriores (front guarda ~4). Teto de 8 mensagens + tamanho por
        // mensagem contém custo de tokens (oraculo.md §8); o Python ainda corta de novo (defesa em profundidade).
        historico: z.array(z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string().trim().min(1).max(2000)
        })).max(8).optional().default([])
    })
});

module.exports = {
    criarAutomacaoSchema, toggleStatusSchema,
    sincronizarOraculoSchema, consultarOraculoSchema,
    criarNodeSchema, editarNodeSchema,
    criarFlagSchema, atualizarFlagSchema, renomearFlagSchema,
    criarNucleoSchema, renomearNucleoSchema,
    criarEventoSchema, criarVinculoSchema,
    criarSessaoSchema, editarSessaoSchema,
    atualizarNucleoNodeSchema,
    listarLinksSchema, criarLinkSchema, deletarLinkSchema, atualizarLinkSchema,
    criarBoardSchema, atualizarBoardSchema, boardIdParamsSchema,
    salvarDiplomaciaSchema,
    salvarTarotNodeSchema, salvarTarotNucleoSchema,
    salvarPosicoesSchema
};