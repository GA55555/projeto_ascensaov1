// services/tarotCatalogo.js
// Catálogo dos 22 Arcanos Maiores (Tarot de Marselha). FONTE ÚNICA: public/data/tarot.json — servível ao
// front (em /data/tarot.json) e requerível pelo Node (aqui), evitando drift entre os dois lados.
// Cada carta = um estágio da Jornada do Herói. A "orientação" (em pé = +1 / invertida = −1) escolhe o
// significado (sig_pe / sig_invertida). É só DADO; a lógica de física/UI consome este catálogo.

const cartas = require('../public/data/tarot.json');
const porNum = new Map(cartas.map((c) => [Number(c.num), c]));

/** Carta pelo número do arcano (0–21), ou null se inválido. */
function cartaPorNum(num) {
    return porNum.get(Number(num)) || null;
}

module.exports = { cartas, cartaPorNum };
