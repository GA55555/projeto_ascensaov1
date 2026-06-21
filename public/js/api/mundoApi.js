// public/js/api/mundoApi.js
// Camada de rede exclusiva para o módulo de Engenharia de Mundo.
// Não contém lógica de DOM. Depende do objeto global API (api.js).

const MundoApi = {

    // ── NÚCLEOS ────────────────────────────────────────────────
    async getNucleos(cronicaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/entidade-nucleos`);
        if (!res.ok) throw new Error('Falha ao carregar núcleos.');
        return res.json();
    },

    async criarNucleo(cronicaId, nome) {
        const res = await API.fetch(`/cronicas/${cronicaId}/entidade-nucleos`, {
            method: 'POST',
            body: JSON.stringify({ nome })
        });
        if (!res.ok) throw new Error('Falha ao criar núcleo.');
        return res.json();
    },

    async editarNucleo(cronicaId, id, nome) {
        const res = await API.fetch(`/cronicas/${cronicaId}/entidade-nucleos/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ nome })
        });
        if (!res.ok) throw new Error('Falha ao editar núcleo.');
        return res.json();
    },

    async excluirNucleo(cronicaId, id) {
        const res = await API.fetch(`/cronicas/${cronicaId}/entidade-nucleos/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao excluir núcleo.');
    },

    // ── ENTIDADES (NODES) ──────────────────────────────────────
    async getNodes(cronicaId, nucleoId = '') {
        const url = `/cronicas/${cronicaId}/nodes` + (nucleoId ? `?nucleo_id=${nucleoId}` : '');
        const res = await API.fetch(url);
        if (!res.ok) throw new Error('Falha ao carregar entidades.');
        return res.json();
    },

    async criarNode(cronicaId, nome, tipo, nucleoId = null) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes`, {
            method: 'POST',
            body: JSON.stringify({ nome, tipo, nucleo_id: nucleoId || null })
        });
        if (!res.ok) throw new Error('Falha ao forjar entidade.');
        return res.json();
    },

    async editarNode(cronicaId, nodeId, nome) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, {
            method: 'PUT',
            body: JSON.stringify({ nome })
        });
        if (!res.ok) throw new Error('Falha ao editar entidade.');
        return res.json();
    },

    async deletarNode(cronicaId, nodeId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao deletar entidade.');
    },

    async moverNode(cronicaId, nodeId, nucleoId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/nucleo`, {
            method: 'PUT',
            body: JSON.stringify({ nucleo_id: nucleoId })
        });
        if (!res.ok) throw new Error('Falha ao mover entidade.');
    },


    // ── FLAGS ──────────────────────────────────────────────────
    async adicionarFlag(cronicaId, nodeId, flagKey) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags`, {
            method: 'POST',
            body: JSON.stringify({ flag_key: flagKey })
        });
        if (!res.ok) throw new Error('Falha ao adicionar flag.');
    },

    async editarFlag(cronicaId, nodeId, flagKey, novoNome) {
        const nomeNormalizado = novoNome.trim().toLowerCase().replace(/\s+/g, '_');
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags/${flagKey}`, {
            method: 'PUT',
            body: JSON.stringify({ novo_nome: nomeNormalizado })
        });
        if (!res.ok) throw new Error('Falha ao editar flag.');
    },

    async deletarFlag(cronicaId, nodeId, flagKey) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags/${flagKey}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao deletar flag.');
    },

    async toggleFlag(cronicaId, nodeId, flagKey, value) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/flags`, {
            method: 'PUT',
            body: JSON.stringify({ flag_key: flagKey, flag_value: value })
        });
        if (!res.ok) throw new Error('Falha ao atualizar flag.');
    },

    // ── SINAPSES (LINKS BIDIRECIONAIS) ─────────────────────────
    // API.fetch já injeta credentials:'include' e Content-Type JSON.
    async listarLinks(cronicaId, nodeId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/links`);
        if (!res.ok) throw new Error('Falha ao carregar conexões.');
        return res.json();
    },

    // Arestas Ricas (Fase 11): `dados` é o JSONB opcional de intriga (opt-in).
    async criarLink(cronicaId, nodeId, destinoNodeId, tipoLink = 'associado', dados = null) {
        // 'tipo_vinculo' é a coluna real de world_links (contrato da DDL); o parâmetro segue a nomenclatura Link/Sinapse.
        const body = { destino_node_id: destinoNodeId, tipo_vinculo: tipoLink };
        if (dados && Object.keys(dados).length) body.dados = dados;
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/links`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Falha ao criar conexão.');
        return res.json();
    },

    async deletarLink(cronicaId, nodeId, linkId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/links/${linkId}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Falha ao desfazer conexão.');
    },

    // Atualiza EXCLUSIVAMENTE o JSONB `dados` (intriga) de um link existente.
    // Convenção real do cliente: cronicaId é sempre o 1º argumento.
    async atualizarLink(cronicaId, nodeId, linkId, dados) {
        const res = await API.fetch(`/cronicas/${cronicaId}/nodes/${nodeId}/links/${linkId}`, {
            method: 'PUT',
            body: JSON.stringify({ dados: dados || {} })
        });
        if (!res.ok) throw new Error('Falha ao atualizar conexão.');
        return res.json();
    },

    // ── TABULEIROS DE CAMPANHA (FASE 13) — world_boards ──
    async listarBoards(cronicaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/boards`);
        if (!res.ok) throw new Error('Falha ao listar tabuleiros.');
        return res.json();
    },
    async buscarBoard(cronicaId, boardId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/boards/${boardId}`);
        if (!res.ok) throw new Error('Falha ao carregar o tabuleiro.');
        return res.json(); // { id, nome, dados, ..., atualizado_automaticamente }
    },
    async criarBoard(cronicaId, nome, dados = {}) {
        const res = await API.fetch(`/cronicas/${cronicaId}/boards`, {
            method: 'POST', body: JSON.stringify({ nome, dados })
        });
        if (!res.ok) throw new Error('Falha ao criar o tabuleiro.');
        return res.json();
    },
    async atualizarBoard(cronicaId, boardId, payload) {
        const res = await API.fetch(`/cronicas/${cronicaId}/boards/${boardId}`, {
            method: 'PUT', body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Falha ao salvar o tabuleiro.');
        return res.json();
    },
    async deletarBoard(cronicaId, boardId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/boards/${boardId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Falha ao remover o tabuleiro.');
        return res.json();
    },

    // ── DIREÇÃO DE CENA (FASE 17): world_cenas (layouts efêmeros) ──
    async listarCenas(cronicaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/cenas`);
        if (!res.ok) throw new Error('Falha ao listar cenas.');
        return res.json();
    },
    async buscarCena(cronicaId, cenaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/cenas/${cenaId}`);
        if (!res.ok) throw new Error('Falha ao carregar a cena.');
        return res.json(); // { id, nome, dados: { colunas, atores }, ... }
    },
    async criarCena(cronicaId, nome, dados = { colunas: [], atores: {} }) {
        const res = await API.fetch(`/cronicas/${cronicaId}/cenas`, {
            method: 'POST', body: JSON.stringify({ nome, dados })
        });
        if (!res.ok) throw new Error('Falha ao criar a cena.');
        return res.json();
    },
    async atualizarCena(cronicaId, cenaId, payload) {
        const res = await API.fetch(`/cronicas/${cronicaId}/cenas/${cenaId}`, {
            method: 'PUT', body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Falha ao salvar a cena.');
        return res.json();
    },
    async deletarCena(cronicaId, cenaId) {
        const res = await API.fetch(`/cronicas/${cronicaId}/cenas/${cenaId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Falha ao remover a cena.');
        return res.json();
    },

    // ── DIPLOMACIA (FASE 14): relações núcleo↔núcleo (global por crônica) ──
    // Tolerante a backend ausente no GET (cai p/ []), para o board não quebrar.
    async getDiplomacia(cronicaId) {
        try {
            const res = await API.fetch(`/cronicas/${cronicaId}/diplomacia`);
            if (!res.ok) return [];
            return res.json(); // [{ id, nucleoA, nucleoB, status }]
        } catch (e) { return []; }
    },
    async salvarDiplomacia(cronicaId, relacoes) {
        const res = await API.fetch(`/cronicas/${cronicaId}/diplomacia`, {
            method: 'PUT', body: JSON.stringify({ relacoes })
        });
        if (!res.ok) throw new Error('Falha ao salvar a diplomacia.');
        return res.json();
    }
};
