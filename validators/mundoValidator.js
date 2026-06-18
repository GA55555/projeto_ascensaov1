const { z } = require('zod');

// ---- Schema auxiliar para nucleos_ids (opcional, array de UUIDs) ----
const nucleosIdsSchema = z.array(z.string().uuid()).optional();

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
        nome: z.string().min(1, 'Nome da entidade é obrigatório.')
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
        nome: z.string().min(1, 'Nome do núcleo é obrigatório.')
    })
});

const renomearNucleoSchema = criarNucleoSchema; // mesma estrutura

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
// Arestas Ricas (Fase 11): payload de intriga gravado no JSONB world_links.dados.
// Opcional e opt-in (Progressive Disclosure). Chaves desconhecidas são descartadas
// (comportamento strip padrão do Zod), mantendo o JSONB extensível sem 400.
const dadosLinkSchema = z.object({
    segredo: z.string().max(2000).optional(),
    tensao: z.coerce.number().int().min(0).max(5).optional()
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

module.exports = {
    criarAutomacaoSchema, toggleStatusSchema,
    criarNodeSchema, editarNodeSchema,
    criarFlagSchema, atualizarFlagSchema, renomearFlagSchema,
    criarNucleoSchema, renomearNucleoSchema,
    criarEventoSchema, criarVinculoSchema,
    criarSessaoSchema, editarSessaoSchema,
    atualizarNucleoNodeSchema,
    listarLinksSchema, criarLinkSchema, deletarLinkSchema, atualizarLinkSchema
};