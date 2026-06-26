const { z } = require('zod');

// PUT /perfil/oraculo — BYOK do Narrador (geração). A chave é write-only e cifrada antes do INSERT
// (Regra 6 / oraculo.md §4.4). Todos os campos são opcionais: permite atualizar só o modelo/URL sem
// reenviar a chave (o controller faz COALESCE e só troca a chave quando ela é enviada). gen_url é
// restrita a https — o segredo nunca deve viajar para um endpoint em texto claro.
const salvarOraculoConfigSchema = z.object({
    body: z.object({
        gen_key: z.string().trim().min(1, 'A chave não pode ser vazia.').max(500).optional(),
        gen_url: z.string().trim().url('URL do provedor inválida.')
            .refine((u) => u.startsWith('https://'), 'A URL do provedor deve usar https.').optional(),
        gen_model: z.string().trim().min(1, 'Modelo inválido.').max(100).optional()
    })
});

module.exports = { salvarOraculoConfigSchema };
