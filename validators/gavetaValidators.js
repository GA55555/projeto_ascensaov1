const { z } = require('zod');

const criarFichaSchema = z.object({
    body: z.object({
        nome: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres.').max(100, 'O nome deve ter no máximo 100 caracteres.'),
        sistema: z.string().min(1, 'O sistema é obrigatório.'),
        versao: z.string().max(50, 'A versão deve ter no máximo 50 caracteres.').nullish(),
        dados_ficha: z.record(z.any())
    })
});

const atualizarFichaSchema = z.object({
    params: z.object({
        fichaId: z.string().min(1, 'ID de ficha inválido.')
    }),
    body: z.object({
        nome: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres.').max(100, 'O nome deve ter no máximo 100 caracteres.').optional(),
        versao: z.string().max(50, 'A versão deve ter no máximo 50 caracteres.').nullish(),
        dados_ficha: z.record(z.any())
    })
});

const deletarFichaSchema = z.object({
    params: z.object({
        fichaId: z.string().min(1, 'ID de ficha inválido.')
    })
});

module.exports = { criarFichaSchema, atualizarFichaSchema, deletarFichaSchema };
