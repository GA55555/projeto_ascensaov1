const pool = require('../db');


exports.dashboardResumo = async (req, res) => {
    const userId = req.usuario.id;
    try {
        const queryNarrador = await pool.query(
            'SELECT id, nome, status FROM cronicas WHERE narrador_id = $1 ORDER BY criado_em DESC', 
            [userId]
        );
        const queryJogador = await pool.query(`
            SELECT c.id as cronica_id, c.nome as cronica_nome, c.status
            FROM cronica_jogadores cj
            JOIN cronicas c ON cj.cronica_id = c.id
            WHERE cj.usuario_id = $1
            ORDER BY c.criado_em DESC
        `, [userId]);

        res.json({ narrando: queryNarrador.rows, jogando: queryJogador.rows });
    } catch (err) {
        console.error("Erro ao carregar resumo do dashboard:", err);
        res.status(500).json({ erro: 'Erro interno ao carregar perfil.' });
    }
};