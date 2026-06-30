const { z } = require('zod');

// validators/comunidadeValidators.js
// Defesa em profundidade da Comunidade (Regra 3.1 + 6.1). As URLs de imagem vêm SEMPRE do upload
// /midia/upload/social → caminho interno hash (Sharp→WebP, Regra 6.5). Travar o FORMATO na entrada
// bloqueia URL externa, javascript:, data:, aspas e ../ — fechando a porta do XSS armazenado no
// <img src> mesmo que o escape de saída falhe um dia. Mesmo regex dos avatares de entidade/núcleo.
const imagemSocialSchema = z.string().regex(
    /^\/uploads\/social\/[\w-]+\.(webp|png|jpe?g)$/i,
    'URL de imagem inválida (esperado um upload interno).'
);

// POST /abas/:abaId/posts — só valida FORMATO (a regra de negócio "tem conteúdo OU imagem" fica no
// controller/UI). Campos opcionais p/ não quebrar os 3 tipos (normal/álbum/votação).
const criarPostSchema = z.object({
    body: z.object({
        tipo: z.enum(['normal', 'album', 'votacao']).optional().default('normal'),
        conteudo: z.string().max(20000).optional(),
        pergunta: z.string().max(2000).optional(),
        imagem_url: imagemSocialSchema.nullable().optional(),
        imagens: z.array(imagemSocialSchema).optional(),
        album_itens: z.array(z.object({
            imagem_url: imagemSocialSchema,
            descricao: z.string().max(2000).optional().default('')
        })).optional(),
        opcoes: z.array(z.string().max(500)).optional(),
        multipla_escolha: z.boolean().optional().default(false)
    })
});

// Editar post / criar e editar comentário: payload é só { conteudo } textual.
const conteudoSchema = z.object({
    body: z.object({
        conteudo: z.string().min(1, 'O conteúdo não pode ficar vazio.').max(20000)
    })
});

// POST /posts/:postId/votar — { opcao_id } (UUID, Regra 4.3).
const votarSchema = z.object({
    body: z.object({
        opcao_id: z.string().uuid('opcao_id deve ser um UUID válido.')
    })
});

module.exports = { criarPostSchema, conteudoSchema, votarSchema };
