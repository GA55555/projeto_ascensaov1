const { z } = require('zod');

const registroSchema = z.object({
    body: z.object({
        nome: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres.'),
        email: z.string().email('E-mail inválido.'),
        senha: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.')
    })
});

const loginSchema = z.object({
    body: z.object({
        email: z.string().email('E-mail inválido.'),
        senha: z.string().min(1, 'A senha é obrigatória.')
    })
});

module.exports = { registroSchema, loginSchema };
