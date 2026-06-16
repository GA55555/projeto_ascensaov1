const { z } = require('zod');

const uploadFichaSchema = z.object({
    body: z.object({
        nome: z.string().min(1).max(255).optional(),
        tipo: z.enum(['modelo_oficial', 'ficha_pessoal']).optional()
    })
});

const deletarFichaSchema = z.object({
    params: z.object({
        fichaId: z.string().uuid('ID de ficha inválido.')
    })
});

module.exports = { uploadFichaSchema, deletarFichaSchema };
