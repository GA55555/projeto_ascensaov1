// public/js/api/gavetaApi.js
// Camada de rede exclusiva para o módulo Gaveta de Fichas.
// Não contém lógica de DOM. Depende do objeto global API (api.js).

const GavetaApi = {
    async listar() {
        const res = await API.fetch('/gaveta/fichas');
        if (!res.ok) throw new Error('Falha ao carregar fichas.');
        return res.json();
    },

    async upload(formData) {
        const res = await API.fetch('/gaveta/fichas', { method: 'POST', body: formData });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.erro || 'Erro no upload do PDF.');
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
