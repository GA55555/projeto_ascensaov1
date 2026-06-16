// public/js/api/automacoesApi.js
// Camada de rede exclusiva para o módulo de Automações.
// Depende do objeto global API (api.js).

const AutomacoesApi = {

    async getAutomacoes(cronicaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/automacoes`);
        if (!res.ok) throw new Error('Falha ao carregar automações.');
        return res.json();
    },

    async criarAutomacao(cronicaId, eventoId, tipoNome, parametros = {}) {
        const res = await API.fetch(`/cronicas/${cronicaId}/automacoes`, {
            method: 'POST',
            body: JSON.stringify({ evento_id: eventoId, tipo_nome: tipoNome, parametros })
        });
        if (!res.ok) throw new Error('Falha ao criar automação.');
        return res.json();
    },

    async deletarAutomacao(cronicaId, id) {
        const res = await API.fetch(`/cronicas/${cronicaId}/automacoes/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao deletar automação.');
    },

    async toggleStatus(cronicaId, id, ativo) {
        const res = await API.fetch(`/cronicas/${cronicaId}/automacoes/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ ativo })
        });
        if (!res.ok) throw new Error('Falha ao alterar status da automação.');
    }
};
