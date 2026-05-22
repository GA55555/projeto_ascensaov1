const express = require('express');
const router = express.Router();
const pool = require('../db'); 
const verificarToken = require('../middlewares/auth');

// ROTA: Listar todas as crônicas do usuário (usada no dashboard)
router.get('/minhas', verificarToken, async (req, res) => {
    // ... copie a lógica de busca de crônicas do seu server.js aqui ...
});

// ROTA: Criar uma nova aba
router.post('/:cronicaId/abas', verificarToken, async (req, res) => {
    // ... insira a lógica que validamos anteriormente aqui ...
});

// ROTA: Listar posts de uma aba
router.get('/:cronicaId/abas/:abaId/posts', verificarToken, async (req, res) => {
    // ... lógica de carregar posts ...
});

// ==========================================
// FUNÇÃO DEFINITIVA DE PERMISSÕES
// ==========================================
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

// Adicione aqui todas as outras rotas relacionadas a crônicas/posts/abas
module.exports = router;


