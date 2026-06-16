// middlewares/permissoes.js
const pool = require('../db');

// Transformado em Middleware do Express!
async function checarAcessoCronica(req, res, next) {
    try {
        // Pescamos os dados de onde eles realmente estão:
        const usuarioId = req.usuario.id; 
        const cronicaId = req.params.cronicaId; // Vem da URL (ex: /cronicas/1/...)

        if (!cronicaId) {
            return res.status(400).json({ erro: 'ID da crônica ausente na URL.' });
        }

        // 1. Checa se é o Narrador (Dono da Crônica)
        const donoQuery = await pool.query(
            'SELECT narrador_id FROM cronicas WHERE id = $1', 
            [cronicaId]
        );
        
        if (donoQuery.rows.length > 0 && donoQuery.rows[0].narrador_id === usuarioId) {
            req.acesso = 'narrador'; // Guarda a permissão no objeto 'req'
            return next(); // Libera a catraca para a próxima função!
        }

        // 2. Checa se é um Jogador da Crônica
        const jogadorQuery = await pool.query(
            'SELECT papel FROM cronica_jogadores WHERE cronica_id = $1 AND usuario_id = $2',
            [cronicaId, usuarioId]
        );

        if (jogadorQuery.rows.length > 0) {
            req.acesso = jogadorQuery.rows[0].papel || 'jogador'; // Guarda a permissão
            return next(); // Libera a catraca!
        }

        // 3. Se não caiu em nenhum dos casos acima, o acesso é negado.
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