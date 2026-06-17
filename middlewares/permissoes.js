// middlewares/permissoes.js
const pool = require('../db');

// Transformado em Middleware do Express!
async function checarAcessoCronica(req, res, next) {
    try {
        const usuarioId = req.usuario.id;
        const cronicaId = req.params.cronicaId;

        if (!cronicaId) {
            return res.status(400).json({ erro: 'ID da crônica ausente na URL.' });
        }

        const resultado = await pool.query(
            `SELECT 'narrador' AS papel FROM cronicas WHERE id = $1 AND narrador_id = $2
             UNION
             SELECT papel FROM cronica_jogadores WHERE cronica_id = $1 AND usuario_id = $2
             LIMIT 1`,
            [cronicaId, usuarioId]
        );

        if (resultado.rows.length > 0) {
            req.acesso = resultado.rows[0].papel || 'jogador';
            return next();
        }

        return res.status(403).json({ erro: 'Acesso negado: Você não pertence a esta crônica.' });

    } catch (err) {
        console.error("Erro no middleware checarAcessoCronica:", err);
        return res.status(500).json({ erro: 'Erro interno ao validar permissões da mesa.' });
    }
}

// Mantivemos esta como uma função normal (Helper)
async function checarNivelAcessoAba(usuarioId, abaId) {
    const queryAba = await pool.query(`
        SELECT a.tipo, c.narrador_id 
        FROM cronica_abas a
        JOIN cronicas c ON a.cronica_id = c.id
        WHERE a.id = $1
    `, [abaId]);

    if (queryAba.rows.length === 0) return 'nenhuma';

    const { tipo, narrador_id } = queryAba.rows[0];

    if (narrador_id === usuarioId) return 'narrador'; 
    if (tipo === 'publica') return 'editor'; 

    const queryPerm = await pool.query(
        'SELECT nivel_acesso FROM aba_permissoes WHERE aba_id = $1 AND jogador_id = $2',
        [abaId, usuarioId]
    );

    if (queryPerm.rows.length > 0) return queryPerm.rows[0].nivel_acesso;

    return 'leitura'; 
}

module.exports = {
    checarAcessoCronica,
    checarNivelAcessoAba
};