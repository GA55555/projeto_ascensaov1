// utils/oraculoCripto.js
// Cifragem em repouso da chave BYOK do Narrador (usuarios.oraculo_gen_key) — Regra 6 / oraculo.md §4.4.
// AES-256-GCM (autenticado): além de cifrar, o authTag detecta adulteração na decifragem. A chave de
// 32 bytes é DERIVADA do segredo ORACULO_ENC_KEY (.env) por SHA-256 — assim o segredo no .env pode ter
// qualquer comprimento. NUNCA logar o texto puro nem a chave derivada. Persistido como "iv:tag:dados" (hex).

const crypto = require('crypto');

const ALGORITMO = 'aes-256-gcm';
const TAM_IV = 12; // 96 bits — tamanho recomendado de nonce para GCM

function chaveMestra() {
    const segredo = process.env.ORACULO_ENC_KEY;
    if (!segredo) throw new Error('ORACULO_ENC_KEY ausente no .env — impossível cifrar a chave BYOK.');
    // Normaliza qualquer segredo para exatamente 32 bytes (requisito do AES-256).
    return crypto.createHash('sha256').update(segredo, 'utf8').digest();
}

/** true se o servidor pode cifrar/decifrar — gate p/ responder claro em vez de estourar 500 cru. */
function criptoConfigurada() {
    return Boolean(process.env.ORACULO_ENC_KEY);
}

/** Cifra um texto puro. Devolve "iv:tag:dados" (hex). */
function cifrar(textoPuro) {
    const iv = crypto.randomBytes(TAM_IV);
    const cipher = crypto.createCipheriv(ALGORITMO, chaveMestra(), iv);
    const enc = Buffer.concat([cipher.update(String(textoPuro), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Decifra "iv:tag:dados" (hex). Lança se o formato for inválido ou o authTag não bater (adulteração/chave trocada). */
function decifrar(blob) {
    if (typeof blob !== 'string') throw new Error('Valor cifrado inválido.');
    const partes = blob.split(':');
    if (partes.length !== 3) throw new Error('Formato de chave cifrada inválido.');
    const [ivHex, tagHex, dadosHex] = partes;
    const decipher = crypto.createDecipheriv(ALGORITMO, chaveMestra(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dadosHex, 'hex')), decipher.final()]).toString('utf8');
}

module.exports = { cifrar, decifrar, criptoConfigurada };
