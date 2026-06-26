const { z } = require('zod');

// ── ORÁCULO (RAG): toggle opt-in por crônica ──
// PUT /cronicas/:cronicaId/oraculo — liga/desliga o `oraculo_ativo`. Salda o desvio da Regra 3.1
// (a rota validava `ativo` inline). Espelha o escopo UUID (Regra 4.3) e exige booleano estrito.
const toggleOraculoSchema = z.object({
    params: z.object({ cronicaId: z.string().uuid('cronicaId inválido.') }),
    body: z.object({
        // Zod v4: `error` unificado (substitui required_error/invalid_type_error do v3) cobre
        // ausência e tipo errado com a mesma mensagem clara (Regra 3.2).
        ativo: z.boolean({ error: 'O campo "ativo" deve ser booleano (true ou false).' })
    })
});

module.exports = { toggleOraculoSchema };
