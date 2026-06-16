const { z } = require('zod');

const criarCardMonstroSchema = z.object({
    body: z.object({
        nome: z.string().min(1, 'O nome do monstro é obrigatório.').max(100),
        hp_max: z.number().int().positive('O HP máximo deve ser um número positivo.'),
        imagem_url: z.string().min(1, 'A imagem é obrigatória.')
    })
});

const atualizarCardMonstroSchema = z.object({
    body: z.object({
        nome: z.string().max(100).optional(),
        hp_max: z.number().int().positive().optional(),
        hp_atual: z.number().int().nonnegative().optional(),
        iniciativa: z.number().int().optional()
    })
});

// Define a forma de uma peça de Lego (GridStack)
const layoutItemSchema = z.object({
    id: z.string().min(1, "O ID do bloco é obrigatório.").max(50),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().positive().max(12),
    h: z.number().int().positive().max(50)
}).strict();

// Schema seguro para salvar o Layout ativo
const salvarLayoutSchema = z.object({
    body: z.object({
        layout: z.array(layoutItemSchema).max(30).optional(),
        resumo_html: z.string().max(50000).optional(),
        cena_html: z.string().max(50000).optional()
    }).strict()
});

// Schema flexível e seguro para o Snapshot (/escudo-saves)
const salvarSnapshotSchema = z.object({
    body: z.object({
        nome: z.string().min(1, "O nome do Save é obrigatório.").max(100),
        layout: z.array(layoutItemSchema).optional(),
        resumo_html: z.string().max(50000).optional(),
        cena_html: z.string().max(50000).optional(),
        
        monstros: z.array(
            z.object({
                id: z.union([z.string(), z.number()]).optional(),
                nome: z.string().max(100),
                hp_max: z.number().int().positive(),
                hp_atual: z.number().int().nonnegative(),
                iniciativa: z.number().int().nullable().optional(), // CORREÇÃO AQUI
                imagem_url: z.string()
            }).passthrough() 
        ).optional()
    }).passthrough()
});


module.exports = {
    criarCardMonstroSchema,
    atualizarCardMonstroSchema,
    salvarLayoutSchema,
    salvarSnapshotSchema
};