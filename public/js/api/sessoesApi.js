// public/js/api/sessoesApi.js
// Camada de rede exclusiva para o módulo de Sessões (Diário de Campanha).
// Depende do objeto global API (api.js).

const SessoesApi = {

    async getSessoes(cronicaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/sessoes`);
        if (!res.ok) throw new Error('Falha ao carregar sessões.');
        return res.json();
    },

    async getNucleosSessao(cronicaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/sessao-nucleos`);
        if (!res.ok) throw new Error('Falha ao carregar núcleos de sessão.');
        return res.json();
    },

    async criarSessao(cronicaId, dados) {
        const res = await API.fetch(`/cronicas/${cronicaId}/sessoes`, {
            method: 'POST',
            body: JSON.stringify(dados)
        });
        if (!res.ok) throw new Error('Falha ao criar sessão.');
        return res.json();
    },

    async editarSessao(cronicaId, id, dados) {
        const res = await API.fetch(`/cronicas/${cronicaId}/sessoes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
        if (!res.ok) throw new Error('Falha ao editar sessão.');
        return res.json();
    },

    async deletarSessao(cronicaId, id) {
        const res = await API.fetch(`/cronicas/${cronicaId}/sessoes/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao deletar sessão.');
    }
};
