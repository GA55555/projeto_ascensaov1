// ============================================================================
// mundoUtils.js — Helpers de apresentação do domínio "Mundo", COMPARTILHADOS
// entre o Controle de Mundo (controle_mundo.js) e o Escudo (escudo_narrador.js).
// Caminho B (unificação): elimina as cópias gêmeas que viviam nos dois scripts.
// Carregar SEMPRE antes do script da página (depois de utils.js) nas duas HTMLs.
// Funções puras, sem estado e sem DOM — seguras para qualquer página.
// ============================================================================

// Humaniza a chave crua de um Marco (flag_key) só para exibição — NÃO altera o
// identificador real; o valor cru continua viajando em data-flag-key/title e na API.
function humanizarMarco(key) {
    return String(key || '')
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase());
}

// Ícone Lucide por tipo de entidade (world_nodes.tipo).
function iconeEntidade(tipo) {
    const mapa = { npc: 'user', protagonista: 'crown', faccao: 'flag', local: 'map-pin', cenario: 'mountain' };
    return mapa[String(tipo || '').toLowerCase()] || 'box';
}

// ── Fragmentos de esqueleto do card de Mundo (Caminho B3) ───────────────────
// Markup IDÊNTICO entre controle_mundo e escudo: identidade (ícone+avatar+nome+badge)
// e rodapé do núcleo. As partes que divergem de verdade (ações, kebab, sinapses, fiar
// dos marcos) continuam em cada página. Os id= node-nome-/node-nucleo- são usados pela
// edição inline e pelo update otimista de núcleo. Retornam string (puro, sem tocar o DOM).

// Bloco de identidade do card: ícone-base + avatar (F2) + nome (editável) + badge do tipo.
function cardIdentHTML(node) {
    const id = escapeHTML(String(node.id));
    return `
        <div class="world-card__ident">
            <span class="world-card__icone">
                <i data-lucide="${iconeEntidade(node.tipo)}"></i>
                ${node.avatar_url ? `<img class="world-card__avatar" src="${escapeHTML(node.avatar_url)}" alt="" draggable="false" onerror="this.remove()">` : ''}
            </span>
            <div class="world-card__titulo-wrap">
                <strong id="node-nome-${id}" class="world-card__nome">${escapeHTML(node.nome)}</strong>
                <span class="badge world-card__tipo">${escapeHTML(node.tipo)}</span>
            </div>
        </div>`;
}

// Rodapé do card: o núcleo a que a entidade pertence.
function cardRodapeNucleoHTML(node) {
    return `
        <div class="world-card__rodape">
            <div class="world-card__nucleo">
                <span>Núcleo: <span id="node-nucleo-${escapeHTML(String(node.id))}" class="world-card__nucleo-nome">${escapeHTML(node.nucleo_nome || 'Nenhum')}</span></span>
            </div>
        </div>`;
}
