const express = require('express');
const router = express.Router();
const pool = require('../db'); 
const verificarToken = require('../middlewares/auth'); 

// 1. Buscar todos os personagens do jogador logado
router.get('/', verificarToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM personagens WHERE usuario_id = $1', [req.usuario.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar personagens:', err);
        res.status(500).json({ error: 'Erro no servidor ao acessar o grimório.' });
    }
});

// 2. Buscar o histórico de uma ficha específica (Colocado aqui para não conflitar)
router.get('/:id/historico', verificarToken, async (req, res) => {
    try {
        const check = await pool.query('SELECT 1 FROM personagens WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
        if (check.rows.length === 0) return res.status(403).json({ error: 'Acesso negado.' });

        const historico = await pool.query(
            'SELECT id, exp_total, exp_gasta, criado_em FROM personagens_historico WHERE personagem_id = $1 ORDER BY criado_em DESC',
            [req.params.id]
        );
        res.json(historico.rows);
    } catch (err) {
        console.error('Erro ao buscar histórico:', err);
        res.status(500).json({ error: 'Erro ao buscar o histórico de versões.' });
    }
});

// 3. Buscar UMA ficha específica pelo ID
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM personagens WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Ficha não encontrada ou sem permissão.' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao buscar a ficha:', err);
        res.status(500).json({ error: 'Erro no servidor ao carregar a ficha.' });
    }
});

// 4. Criar um novo personagem
router.post('/', verificarToken, async (req, res) => {
    const { nome, tradicao, essencia, conceito, natureza, comportamento, arete, exp_total, exp_gasta, dados_ficha } = req.body;
    try {
        const novoPersonagem = await pool.query(
            `INSERT INTO personagens 
            (usuario_id, nome, tradicao, essencia, conceito, natureza, comportamento, arete, exp_total, exp_gasta, dados_ficha) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [req.usuario.id, nome, tradicao, essencia, conceito, natureza, comportamento, arete || 1, exp_total || 0, exp_gasta || 0, dados_ficha]
        );
        res.status(201).json(novoPersonagem.rows[0]);
    } catch (err) {
        console.error('Erro ao criar personagem:', err);
        res.status(500).json({ error: 'Erro no servidor ao forjar a ficha.' });
    }
});

// 5. Evoluir / Salvar Personagem com Criação de HISTÓRICO
router.put('/:id/evoluir', verificarToken, async (req, res) => {
    const { dados_ficha, exp_total, exp_gasta, arete } = req.body;
    try {
        console.log("=== INICIANDO SALVAMENTO E HISTÓRICO ===");
        
        const fichaAntiga = await pool.query('SELECT dados_ficha, exp_total, exp_gasta FROM personagens WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
        if (fichaAntiga.rows.length === 0) return res.status(404).json({ error: 'Personagem não encontrado ou acesso negado.' });

        console.log(">> Criando a fotografia do passado...");
        
        // Passamos o JSON direto para o pg processar
        const historico_salvo = await pool.query(
            `INSERT INTO personagens_historico (personagem_id, dados_ficha, exp_total, exp_gasta) VALUES ($1, $2, $3, $4) RETURNING id`,
            [req.params.id, fichaAntiga.rows[0].dados_ficha, fichaAntiga.rows[0].exp_total, fichaAntiga.rows[0].exp_gasta]
        );
        
        console.log(">> SUCESSO! Histórico gravado no banco de dados. ID da linha:", historico_salvo.rows[0].id);

        console.log(">> Atualizando os dados na tabela principal...");
        
        const result = await pool.query(
            `UPDATE personagens SET dados_ficha = $1, exp_total = $2, exp_gasta = $3, arete = $4 WHERE id = $5 AND usuario_id = $6 RETURNING *`,
            [dados_ficha, exp_total, exp_gasta, arete, req.params.id, req.usuario.id]
        );
        
        console.log("=== EVOLUÇÃO CONCLUÍDA ===");
        res.json(result.rows[0]);
    } catch (err) {
        console.error('=== ERRO CRÍTICO DURANTE O SALVAMENTO ===', err);
        res.status(500).json({ error: 'Erro interno ao salvar evolução.' });
    }
});

// 6. Restaurar a ficha para um backup antigo
router.post('/:id/restaurar/:historico_id', verificarToken, async (req, res) => {
    try {
        const check = await pool.query('SELECT 1 FROM personagens WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
        if (check.rows.length === 0) return res.status(403).json({ error: 'Acesso negado.' });

        const hist = await pool.query('SELECT * FROM personagens_historico WHERE id = $1 AND personagem_id = $2', [req.params.historico_id, req.params.id]);
        if(hist.rows.length === 0) return res.status(404).json({ error: 'Backup não encontrado.' });

        const backup = hist.rows[0];
        const arete = backup.dados_ficha.vantagens?.arete || 1;

        const atual = await pool.query('SELECT dados_ficha, exp_total, exp_gasta FROM personagens WHERE id = $1', [req.params.id]);
        await pool.query(
            `INSERT INTO personagens_historico (personagem_id, dados_ficha, exp_total, exp_gasta) VALUES ($1, $2, $3, $4)`,
            [req.params.id, atual.rows[0].dados_ficha, atual.rows[0].exp_total, atual.rows[0].exp_gasta]
        );

        await pool.query(
            `UPDATE personagens SET dados_ficha = $1, exp_total = $2, exp_gasta = $3, arete = $4 WHERE id = $5`,
            [backup.dados_ficha, backup.exp_total, backup.exp_gasta, arete, req.params.id]
        );
        res.json({ mensagem: 'Ficha restaurada com sucesso!' });
    } catch (err) {
        console.error('Erro ao restaurar histórico:', err);
        res.status(500).json({ error: 'Erro no servidor ao tentar restaurar a ficha.' });
    }
});

// 7. Deletar um personagem
router.delete('/:id', verificarToken, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM personagens WHERE id = $1 AND usuario_id = $2 RETURNING *', [req.params.id, req.usuario.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Ficha não encontrada.' });
        res.json({ mensagem: 'Ficha deletada com sucesso.' });
    } catch (err) {
        console.error('Erro ao deletar personagem:', err);
        res.status(500).json({ error: 'Erro ao deletar a ficha.' });
    }
});

module.exports = router;