// services/oraculoClient.js
// Camada de rede isolada (Regra 2.4) para falar com o microsserviço Oráculo (Python, em 127.0.0.1).
// Dois modos:
//   • enviarParaOraculo      → FIRE-AND-FORGET (ganchos da F2): dispara e NÃO espera; o salvar do
//                              Narrador nunca atrasa nem quebra se o Oráculo estiver fora do ar.
//   • enviarParaOraculoAsync → AWAITABLE (Big Bang da F3): permite lotes com backpressure e contagem
//                              real de sucessos/falhas. Nunca rejeita — resolve true/false.

const ORACULO_URL = process.env.ORACULO_URL;             // ex.: http://127.0.0.1:8000
const ORACULO_SECRET = process.env.ORACULO_SHARED_SECRET; // mesmo segredo do .env do serviço Python

/**
 * Gate grosso (opt-in de servidor): o Oráculo só funciona se a URL e o segredo existem no .env.
 * Quando ausentes, o conector é no-op silencioso — o app roda normal sem o Python no ar.
 * Exposto para que controllers (ex.: Big Bang) respondam claro em vez de fingir sucesso (Regra 3.2).
 */
function oraculoConfigurado() {
    return Boolean(ORACULO_URL && ORACULO_SECRET);
}

/**
 * Núcleo compartilhado (DRY): POST com header de segredo (Regra 6.4) e timeout via AbortController.
 * Devolve a Promise do fetch (quem chama decide se espera ou não).
 */
function _postar(acao, dados, timeoutMs) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(`${ORACULO_URL}/${acao}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Oraculo-Secret': ORACULO_SECRET },
        body: JSON.stringify(dados),
        signal: ctrl.signal,
    }).finally(() => clearTimeout(timeout));
}

/**
 * Envia uma ação ao Oráculo SEM bloquear o request do Narrador (ganchos da F2).
 * @param {'upsert'|'remover'} acao
 * @param {object} dados  payload (sempre com cronica_id — base do anti-IDOR, Regra 3.3.1)
 */
function enviarParaOraculo(acao, dados) {
    if (!oraculoConfigurado()) return; // gate grosso → no-op
    // Timeout FOLGADO (10s): o /upsert chama a API de embeddings (OpenAI), que às vezes passa de 2s.
    // Como isto é FIRE-AND-FORGET (sem await), um timeout maior NÃO atrasa o salvar do Narrador — só
    // evita abortar a re-indexação no meio (o que deixava o vetor desatualizado e o Oráculo "cego" à
    // mudança). Alinha com o Big Bang (8s). O antigo 2s causava falha silenciosa em escritas legítimas.
    _postar(acao, dados, 10000)
        .catch(err => console.error(`[oraculo] ${acao} falhou (seguindo a vida):`, err.message));
    // Sem await: o controller segue e responde ao Narrador imediatamente.
}

/**
 * Variante AWAITABLE para o Big Bang (F3): permite lotes com backpressure e contagem real.
 * Resolve true/false (NUNCA rejeita) — o chamador soma sucessos/falhas sem try/catch por item.
 * Timeout maior porque o /upsert chama a API de embeddings (OpenAI) e pode demorar mais que o salvar.
 * @param {'upsert'|'remover'} acao
 * @param {object} dados
 * @returns {Promise<boolean>}
 */
async function enviarParaOraculoAsync(acao, dados, timeoutMs = 8000) {
    if (!oraculoConfigurado()) return false; // gate grosso
    try {
        const resp = await _postar(acao, dados, timeoutMs);
        return resp.ok;
    } catch (err) {
        console.error(`[oraculo] ${acao} (sync) falhou:`, err.message);
        return false;
    }
}

/**
 * Consulta RAG (F4): ESPERA a resposta do Python (o Narrador aguarda — a geração pode demorar,
 * por isso o timeout é generoso e a UI mostra "lendo as estrelas"). Devolve o JSON do Oráculo
 * ({status, resposta_oraculo, ...}). LANÇA em erro de rede/timeout ou status != 2xx — o controller
 * traduz para a resposta padronizada ao frontend (Regra 3.2). NÃO loga a chave que vai no corpo.
 * @returns {Promise<object>}
 */
async function consultarOraculo(dados, timeoutMs = 30000) {
    if (!oraculoConfigurado()) throw new Error('Oráculo não configurado.');
    const resp = await _postar('consultar', dados, timeoutMs);
    if (!resp.ok) {
        let detalhe = '';
        try { const j = await resp.json(); detalhe = j.detail || JSON.stringify(j); } catch { /* corpo não-JSON */ }
        throw new Error(`Oráculo respondeu ${resp.status}: ${detalhe}`);
    }
    return resp.json();
}

/**
 * Consulta o gerador de pílulas (marcos em 1 clique) da IA (Fatia A/B).
 */
async function sugerirMarcosIA(dados, timeoutMs = 25000) {
    if (!oraculoConfigurado()) throw new Error('Oráculo não configurado.');
    const resp = await _postar('gerador/pilulas', dados, timeoutMs);
    if (!resp.ok) {
        let detalhe = '';
        try { const j = await resp.json(); detalhe = j.detail || JSON.stringify(j); } catch { }
        throw new Error(`Oráculo respondeu ${resp.status}: ${detalhe}`);
    }
    return resp.json();
}

/**
 * Consulta a tecelagem de destinos e profecia de evento (Fatia A/B).
 */
async function tecerProfeciaIA(dados, timeoutMs = 30000) {
    if (!oraculoConfigurado()) throw new Error('Oráculo não configurado.');
    const resp = await _postar('gerador/profecia', dados, timeoutMs);
    if (!resp.ok) {
        let detalhe = '';
        try { const j = await resp.json(); detalhe = j.detail || JSON.stringify(j); } catch { }
        throw new Error(`Oráculo respondeu ${resp.status}: ${detalhe}`);
    }
    return resp.json();
}

module.exports = { enviarParaOraculo, enviarParaOraculoAsync, consultarOraculo, sugerirMarcosIA, tecerProfeciaIA, oraculoConfigurado };
