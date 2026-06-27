// public/js/api/oraculoApi.js
// Camada de rede exclusiva do Oráculo (RAG) — Regra 2.4. Sem lógica de DOM. Depende do objeto global API (api.js).

const OraculoApi = {
    // Consulta RAG (F4): o Narrador pergunta; o backend decifra a chave BYOK e fala com o Python.
    // historico: memória multi-turn (trocas anteriores) — o backend valida/limita (Zod, teto 8).
    async consultar(cronicaId, pergunta, historico = []) {
        const res = await API.fetch(`/cronicas/${cronicaId}/oraculo/consultar`, {
            method: 'POST',
            body: JSON.stringify({ pergunta, historico })
        });
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(dados.erro || 'O Oráculo não respondeu.');
        return dados; // { status, resposta_oraculo, trechos_usados? }
    },

    // Liga/desliga o Oráculo nesta crônica (F5a — toggle opt-in).
    async toggle(cronicaId, ativo) {
        const res = await API.fetch(`/cronicas/${cronicaId}/oraculo`, {
            method: 'PUT',
            body: JSON.stringify({ ativo })
        });
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(dados.erro || 'Falha ao alternar o Oráculo.');
        return dados;
    },

    // Grava a chave BYOK do Narrador (write-only). gen_key é opcional (permite trocar só URL/modelo).
    async salvarChave({ gen_key, gen_url, gen_model }) {
        const res = await API.fetch(`/perfil/oraculo`, {
            method: 'PUT',
            body: JSON.stringify({ gen_key, gen_url, gen_model })
        });
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(dados.erro || 'Falha ao salvar a configuração do Oráculo.');
        return dados;
    }
};
