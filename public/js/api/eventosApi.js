// public/js/api/eventosApi.js
// Camada de rede exclusiva para o módulo de Eventos do Mundo.
// Depende do objeto global API (api.js).

const EventosApi = {

    // ── EVENTOS ────────────────────────────────────────────────
    async getEventos(cronicaId, nucleoId = '') {
        const url = `/cronicas/${cronicaId}/eventos` + (nucleoId ? `?nucleo_id=${nucleoId}` : '');
        const res = await API.fetch(url);
        if (!res.ok) throw new Error('Falha ao carregar eventos.');
        return res.json();
    },

    async criarEvento(cronicaId, nome, descricao = '', poolMaxima = 10, nucleosIds = []) {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos`, {
            method: 'POST',
            body: JSON.stringify({ nome, descricao, pool_maxima: poolMaxima, nucleos_ids: nucleosIds })
        });
        if (!res.ok) throw new Error('Falha ao criar evento.');
        return res.json();
    },

    async deletarEvento(cronicaId, eventoId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos/${eventoId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao deletar evento.');
    },

    // ── NÚCLEOS DE EVENTOS ─────────────────────────────────────
    async getNucleosEventos(cronicaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/evento-nucleos`);
        if (!res.ok) throw new Error('Falha ao carregar núcleos de eventos.');
        return res.json();
    },

    async criarNucleoEventos(cronicaId, nome) {
        const res = await API.fetch(`/cronicas/${cronicaId}/evento-nucleos`, {
            method: 'POST',
            body: JSON.stringify({ nome })
        });
        if (!res.ok) throw new Error('Falha ao criar núcleo de eventos.');
        return res.json();
    },

    async editarNucleoEventos(cronicaId, nucleoId, nome) {
        const res = await API.fetch(`/cronicas/${cronicaId}/evento-nucleos/${nucleoId}`, {
            method: 'PUT',
            body: JSON.stringify({ nome })
        });
        if (!res.ok) throw new Error('Falha ao editar núcleo de eventos.');
        return res.json();
    },

    async excluirNucleoEventos(cronicaId, nucleoId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/evento-nucleos/${nucleoId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao excluir núcleo de eventos.');
    },

    async vincularNucleoEvento(cronicaId, eventoId, nucleoId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos/${eventoId}/nucleos`, {
            method: 'POST',
            body: JSON.stringify({ nucleo_id: nucleoId })
        });
        if (!res.ok) throw new Error('Falha ao vincular núcleo ao evento.');
    },

    async desvincularNucleoEvento(cronicaId, eventoId, nucleoId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos/${eventoId}/nucleos/${nucleoId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao desvincular núcleo do evento.');
    },

    // ── GATILHOS (PESOS) ───────────────────────────────────────
    async vincularGatilho(cronicaId, eventoId, nodeId, flagKey, peso) {
        const res = await API.fetch(`/cronicas/${cronicaId}/eventos/${eventoId}/pesos`, {
            method: 'POST',
            body: JSON.stringify({ node_id: nodeId, flag_key: flagKey, peso })
        });
        if (!res.ok) throw new Error('Falha ao vincular gatilho.');
        return res.json();
    }
};
