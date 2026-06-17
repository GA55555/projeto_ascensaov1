// public/js/api/gavetaApi.js
// Camada de rede exclusiva para o módulo Gaveta de Fichas.
// Não contém lógica de DOM. Depende do objeto global API (api.js).

const GavetaApi = {
    async listar() {
        const res = await API.fetch('/gaveta/fichas');
        if (!res.ok) throw new Error('Falha ao carregar fichas.');
        return res.json();
    },

    async criar(dados) {
        // Envia JSON puro (não FormData) — fichas nativas não têm ficheiros físicos.
        const res = await API.fetch('/gaveta/fichas', {
            method: 'POST',
            body: JSON.stringify(dados)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.erro || 'Erro ao criar ficha.');
        }
        return res.json();
    },

    async atualizar(id, dados) {
        // PUT com JSON puro — atualização in-place da ficha nativa (JSONB).
        const res = await API.fetch(`/gaveta/fichas/${id}`, {
            method: 'PUT',
            body: JSON.stringify(dados)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.erro || 'Erro ao atualizar ficha.');
        }
        return res.json();
    },

    async deletar(id) {
        const res = await API.fetch(`/gaveta/fichas/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.erro || 'Erro ao remover ficha.');
        }
        return res.json();
    }
};
