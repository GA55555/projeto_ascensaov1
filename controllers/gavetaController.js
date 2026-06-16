const asyncHandler = require('../utils/asyncHandler');
const pool = require('../db');
const path = require('path');
const fs = require('fs');

exports.uploadFicha = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum ficheiro PDF enviado.' });

    const usuarioId = req.usuario.id;
    const nome = (req.body.nome || req.file.originalname).substring(0, 255);
    const tipo = req.body.tipo === 'modelo_oficial' ? 'modelo_oficial' : 'ficha_pessoal';
    const urlArquivo = `/uploads/fichas/${req.file.filename}`;

    const result = await pool.query(
        'INSERT INTO gaveta_fichas (usuario_id, nome, tipo, url_arquivo) VALUES ($1, $2, $3, $4) RETURNING *',
        [usuarioId, nome, tipo, urlArquivo]
    );

    res.status(201).json(result.rows[0]);
});

exports.listarFichas = asyncHandler(async (req, res) => {
    const result = await pool.query(
        'SELECT id, nome, tipo, url_arquivo, criado_em FROM gaveta_fichas WHERE usuario_id = $1 ORDER BY criado_em DESC',
        [req.usuario.id]
    );
    res.json(result.rows);
});

exports.deletarFicha = asyncHandler(async (req, res) => {
    const { fichaId } = req.params;

    const busca = await pool.query(
        'SELECT url_arquivo FROM gaveta_fichas WHERE id = $1 AND usuario_id = $2',
        [fichaId, req.usuario.id]
    );

    if (busca.rows.length === 0) return res.status(404).json({ erro: 'Ficha não encontrada.' });

    const caminhoFisico = path.join(__dirname, '..', 'public', busca.rows[0].url_arquivo);

    await pool.query('DELETE FROM gaveta_fichas WHERE id = $1', [fichaId]);

    fs.unlink(caminhoFisico, (err) => {
        if (err) console.error('[Gaveta] Arquivo físico não localizado para remoção:', caminhoFisico);
    });

    res.json({ mensagem: 'Ficha removida com sucesso.' });
});
