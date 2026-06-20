const { z } = require('zod');

// ── DIREÇÃO DE CENA (FASE 17): world_cenas ──
// `dados` JSONB isolado do world_boards. Assinatura:
//   { colunas: [{id, nome}], atores: { "<world_nodes.id>": "<colunaId>" } }
// `atores` mapeia um NPC (uuid) → a coluna do palco onde ele está em cena. Nós ausentes
// do mapa estão no Elenco (sidebar). Cores/labels são texto — nunca hex (Regra 2.5 no front).
const dadosCenaSchema = z.object({
    colunas: z.array(z.object({
        id: z.string().min(1).max(64),
        nome: z.string().trim().max(120)
    })).max(50).default([]),
    // chave = nodeId (uuid estrito, Regra 4.3); valor = id da coluna do palco.
    atores: z.record(z.string().uuid(), z.string().min(1).max(64)).default({})
}).default({ colunas: [], atores: {} });

const cronicaParam = { cronicaId: z.string().uuid('cronicaId inválido.') };
const cenaIdParams = { ...cronicaParam, cenaId: z.string().uuid('cenaId inválido.') };

const criarCenaSchema = z.object({
    params: z.object({ ...cronicaParam }),
    body: z.object({
        nome: z.string().trim().min(1, 'Nome da cena obrigatório.').max(255),
        dados: dadosCenaSchema.optional()
    })
});

const atualizarCenaSchema = z.object({
    params: z.object({ ...cenaIdParams }),
    body: z.object({
        nome: z.string().trim().min(1).max(255).optional(),
        dados: dadosCenaSchema.optional()
    })
});

const cenaIdParamsSchema = z.object({ params: z.object({ ...cenaIdParams }) });

module.exports = { criarCenaSchema, atualizarCenaSchema, cenaIdParamsSchema };
