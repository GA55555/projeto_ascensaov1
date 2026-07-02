// public/js/api/oraculoApi.js
// Camada de rede exclusiva do Oráculo (RAG) — Regra 2.4. Sem lógica de DOM. Depende do objeto global API (api.js).

async function tratarResposta(res, fallbackMsg) {
    let dados = {};
    let textoRaw = '';
    try {
        textoRaw = await res.text();
        dados = JSON.parse(textoRaw);
    } catch {
        dados = { erro: textoRaw || `Erro HTTP ${res.status}` };
    }
    if (!res.ok) {
        let msg = fallbackMsg;
        if (typeof dados.erro === 'string' && dados.erro.trim()) msg = dados.erro;
        else if (Array.isArray(dados.erro)) msg = dados.erro.map(e => e.message || e.msg || JSON.stringify(e)).join(' | ');
        else if (dados.erro && typeof dados.erro === 'object') msg = JSON.stringify(dados.erro);
        else if (dados.detail) msg = typeof dados.detail === 'string' ? dados.detail : (Array.isArray(dados.detail) ? dados.detail.map(e => `${e.loc ? e.loc.join('.') : 'campo'}: ${e.msg}`).join(' | ') : JSON.stringify(dados.detail));
        else if (textoRaw && textoRaw.trim() && !textoRaw.trim().startsWith('<')) msg = `${fallbackMsg} (${textoRaw.trim().slice(0, 150)})`;
        throw new Error(msg);
    }
    return dados;
}

const OraculoApi = {
    // Consulta RAG (F4): o Narrador pergunta; o backend decifra a chave BYOK e fala com o Python.
    // historico: memória multi-turn (trocas anteriores) — o backend valida/limita (Zod, teto 8).
    async consultar(cronicaId, pergunta, historico = []) {
        const res = await API.fetch(`/cronicas/${cronicaId}/oraculo/consultar`, {
            method: 'POST',
            body: JSON.stringify({ pergunta, historico })
        });
        return tratarResposta(res, 'O Oráculo não respondeu.');
    },

    // Liga/desliga o Oráculo nesta crônica (F5a — toggle opt-in).
    async toggle(cronicaId, ativo) {
        const res = await API.fetch(`/cronicas/${cronicaId}/oraculo`, {
            method: 'PUT',
            body: JSON.stringify({ ativo })
        });
        return tratarResposta(res, 'Falha ao alternar o Oráculo.');
    },

    // Grava a chave BYOK do Narrador (write-only). gen_key é opcional (permite trocar só URL/modelo).
    async salvarChave({ gen_key, gen_url, gen_model }) {
        const res = await API.fetch(`/perfil/oraculo`, {
            method: 'PUT',
            body: JSON.stringify({ gen_key, gen_url, gen_model })
        });
        return tratarResposta(res, 'Falha ao salvar a configuração do Oráculo.');
    },

    // Gerador de Enredo: Sugerir Marcos / Pílulas (Fatia B/C)
    async sugerirMarcos(cronicaId, payload) {
        const res = await API.fetch(`/cronicas/${cronicaId}/oraculo/gerador/pilulas`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return tratarResposta(res, 'Falha ao gerar sugestões de marcos.');
    },

    // Gerador de Enredo: Tecer Profecia IA (Fatia B/C)
    async tecerProfecia(cronicaId, payload) {
        const res = await API.fetch(`/cronicas/${cronicaId}/oraculo/gerador/profecia`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return tratarResposta(res, 'Falha ao tecer profecia com a IA.');
    },

    // Gerador de Enredo: Confirmar Tecelagem na Mesa (Fatia B/E)
    async confirmarTecelagem(cronicaId, payload) {
        const res = await API.fetch(`/cronicas/${cronicaId}/oraculo/tecer-mesa`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return tratarResposta(res, 'Falha ao confirmar tecelagem de destinos na mesa.');
    }
};

