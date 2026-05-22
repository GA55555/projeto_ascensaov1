// middlewares/permissoes.js
const pool = require('../db');

async function checarAcessoCronica(usuarioId, cronicaId) {
    const donoQuery = await pool.query(
        'SELECT narrador_id FROM cronicas WHERE id = $1', 
        [cronicaId]
    );
    
    if (donoQuery.rows.length > 0 && donoQuery.rows[0].narrador_id === usuarioId) {
        return { temAcesso: true, papel: 'narrador' };
    }

    const jogadorQuery = await pool.query(
        'SELECT papel FROM cronica_jogadores WHERE cronica_id = $1 AND usuario_id = $2',
        [cronicaId, usuarioId]
    );

    if (jogadorQuery.rows.length > 0) {
        return { temAcesso: true, papel: jogadorQuery.rows[0].papel };
    }

    return { temAcesso: false, papel: null };
}

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