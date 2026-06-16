const pool = require('../db');

exports.listarSistemas = async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome FROM sistemas ORDER BY nome ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar sistemas:', err);
        res.status(500).json({ erro: 'Erro ao buscar sistemas.' });
    }
};