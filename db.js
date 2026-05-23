const { Pool } = require('pg');

const pool = new Pool({
    user: 'app_mochila',           // ← usuário limitado
    password: process.env.DB_PASSWORD,  // ← do .env
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'mochila_do_aventureiro',
    port: process.env.DB_PORT || 5432,
    max: 20,                       // limite de conexões
    idleTimeoutMillis: 30000
});

module.exports = pool;