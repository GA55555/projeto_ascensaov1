// services/oraculoClient.js
// Camada de rede isolada (Regra 2.4) para falar com o microsserviço Oráculo (Python, em 127.0.0.1).
// FIRE-AND-FORGET: dispara e NÃO espera a resposta — o salvar do Narrador nunca atrasa nem quebra
// se o Oráculo estiver fora do ar.

const ORACULO_URL = process.env.ORACULO_URL;             // ex.: http://127.0.0.1:8000
const ORACULO_SECRET = process.env.ORACULO_SHARED_SECRET; // mesmo segredo do .env do serviço Python

/**
 * Envia uma ação ao Oráculo sem bloquear o request do Narrador.
 * @param {'upsert'|'remover'} acao
 * @param {object} dados  payload (sempre com cronica_id — base do anti-IDOR, Regra 3.3.1)
 */
function enviarParaOraculo(acao, dados) {
    // Gate (opt-in grosso): se o Oráculo não está configurado, vira no-op silencioso.
    // Quando a coluna cronicas.oraculo_ativo existir (DDL do DBA), o gate fino entra aqui.
    if (!ORACULO_URL || !ORACULO_SECRET) return;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 2000); // não pendura a conexão

    fetch(`${ORACULO_URL}/${acao}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Oraculo-Secret': ORACULO_SECRET },
        body: JSON.stringify(dados),
        signal: ctrl.signal,
    })
        .catch(err => console.error(`[oraculo] ${acao} falhou (seguindo a vida):`, err.message))
        .finally(() => clearTimeout(timeout));
    // Sem await: o controller segue e responde ao Narrador imediatamente.
}

module.exports = { enviarParaOraculo };
