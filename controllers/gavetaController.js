const asyncHandler = require('../utils/asyncHandler');
const pool = require('../db');

exports.criarFicha = asyncHandler(async (req, res) => {
    const { nome, sistema, versao, dados_ficha } = req.body;
    const tipo = 'ficha_pessoal';

    // A versão e o sistema vivem dentro do JSONB (a tabela não tem colunas dedicadas).
    const dados = { ...dados_ficha, sistema, ...(versao !== undefined ? { versao } : {}) };

    const result = await pool.query(
        'INSERT INTO gaveta_fichas (usuario_id, nome, tipo, dados_ficha) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.usuario.id, nome, tipo, dados]
    );

    res.status(201).json(result.rows[0]);
});

exports.atualizarFicha = asyncHandler(async (req, res) => {
    const { fichaId } = req.params;
    const { nome, versao, dados_ficha } = req.body;

    const dados = versao !== undefined ? { ...dados_ficha, versao } : dados_ficha;

    const result = await pool.query(
        'UPDATE gaveta_fichas SET dados_ficha = $1, nome = COALESCE($2, nome) WHERE id = $3 AND usuario_id = $4 RETURNING *',
        [dados, nome ?? null, fichaId, req.usuario.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ erro: 'Ficha não encontrada.' });

    res.json(result.rows[0]);
});

exports.listarFichas = asyncHandler(async (req, res) => {
    const result = await pool.query(
        'SELECT id, nome, tipo, dados_ficha, criado_em FROM gaveta_fichas WHERE usuario_id = $1 ORDER BY criado_em DESC',
        [req.usuario.id]
    );
    res.json(result.rows);
});

exports.deletarFicha = asyncHandler(async (req, res) => {
    const { fichaId } = req.params;
    await pool.query('DELETE FROM gaveta_fichas WHERE id = $1', [fichaId]);
    res.json({ mensagem: 'Ficha removida com sucesso.' });
});
