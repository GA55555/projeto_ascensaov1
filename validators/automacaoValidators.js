const { z } = require('zod');

// Schema para criar uma automação
const criarAutomacaoSchema = z.object({
    body: z.object({
        evento_id: z.string().uuid('evento_id deve ser um UUID válido'),
        tipo_nome: z.enum([
            'criar_flag',
            'alterar_flag',
            'postar_em_aba',
            'criar_evento',
            'criar_entidade'
        ], { errorMap: () => ({ message: 'Tipo de ação inválido.' }) }),
        parametros: z.object({}).passthrough() // aceita qualquer objeto, podes refinar depois
    })
});

// Schema para alternar status (armar/desarmar)
const toggleStatusSchema = z.object({
    body: z.object({
        ativo: z.boolean()
    })
});

module.exports = { criarAutomacaoSchema, toggleStatusSchema };