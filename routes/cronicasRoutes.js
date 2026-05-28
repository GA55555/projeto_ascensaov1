const express = require('express');
const router = express.Router();
const pool = require('../db'); // Conexão com o banco
const verificarToken = require('../middlewares/auth'); // O segurança da porta
const { checarAcessoCronica } = require('../middlewares/permissoes');


// Rota: Buscar todas as crônicas criadas pelo narrador logado
router.get('/', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM cronicas WHERE narrador_id = $1',
            [req.usuario.id] // Busca apenas as crônicas deste usuário
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar crônicas:', err);
        res.status(500).json({ error: 'Erro no servidor ao acessar os registros.' });
    }
});

router.post('/', verificarToken, async (req, res) => {
    const { nome, descricao, sistema_id, capa_url } = req.body;

    try {
        const novaCronica = await pool.query(
            `INSERT INTO cronicas (narrador_id, nome, descricao, sistema_id, capa_url) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.usuario.id, nome, descricao, sistema_id || 1, capa_url]
        );
        
        // Cria a aba "Feed Geral" automaticamente
        await pool.query(
            `INSERT INTO cronica_abas (cronica_id, nome, tipo) VALUES ($1, 'Feed Geral', 'geral')`,
            [novaCronica.rows[0].id]
        );
        
        res.status(201).json(novaCronica.rows[0]);
    } catch (err) {
        console.error('Erro ao criar crônica:', err);
        res.status(500).json({ erro: 'Erro no servidor ao forjar a nova crônica.' });
    }
});

// Rota completa para o painel
router.get('/:id/comunidade', verificarToken, async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario.id;

    try {
        // Busca a crônica
        const cronica = await pool.query('SELECT * FROM cronicas WHERE id = $1', [id]);
        if (cronica.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });

        // Verifica acesso
        const acesso = await checarAcessoCronica(usuarioId, id);
        if (!acesso.temAcesso) return res.status(403).json({ erro: 'Acesso negado.' });

        // Busca abas
        const abas = await pool.query('SELECT * FROM cronica_abas WHERE cronica_id = $1', [id]);

        res.json({
            cronica: cronica.rows[0],
            abas: abas.rows,
            papel: acesso.papel,
            is_narrador: acesso.papel === 'narrador'
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao carregar comunidade.' });
    }
});

router.put('/:id/status', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const usuarioId = req.usuario.id;

    const statusPermitidos = ['ativa', 'inativa', 'terminada'];
    if (!statusPermitidos.includes(status)) {
        return res.status(400).json({ erro: 'Status inválido. Use: ativa, inativa ou terminada.' });
    }

    try {
        // Determina o valor de data_termino ANTES da query
        const dataTermino = status === 'terminada' ? new Date() : null;

        const result = await pool.query(
            `UPDATE cronicas 
             SET status = $1, 
                 data_termino = $2
             WHERE id = $3 AND narrador_id = $4 
             RETURNING *`,
            [status, dataTermino, id, usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode alterar o status.' });
        }

        res.json({ 
            mensagem: `Crônica ${status === 'ativa' ? 'ativada' : status === 'inativa' ? 'pausada' : 'finalizada'}!`,
            cronica: result.rows[0]
        });
    } catch (err) {
        console.error('Erro ao atualizar status:', err);
        res.status(500).json({ erro: 'Erro ao alterar status da crônica.' });
    }
});

// Criar uma nova aba na crônica
router.post('/:id/abas', verificarToken, async (req, res) => {
    const cronicaId = req.params.id;
    const { nome, tipo } = req.body;
    const usuarioId = req.usuario.id;

    try {
        // Verifica se o usuário é o narrador da crônica
        const acesso = await checarAcessoCronica(usuarioId, cronicaId);
        if (acesso.papel !== 'narrador') {
            return res.status(403).json({ erro: 'Apenas o narrador pode criar abas.' });
        }

        const result = await pool.query(
            `INSERT INTO cronica_abas (cronica_id, nome, tipo) VALUES ($1, $2, $3) RETURNING *`,
            [cronicaId, nome, tipo || 'restrita']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao criar aba:', err);
        res.status(500).json({ erro: 'Erro interno ao criar a aba.' });
    }
});

// Deletar uma aba existente
router.delete('/:id/abas/:abaId', verificarToken, async (req, res) => {
    const { id, abaId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const acesso = await checarAcessoCronica(usuarioId, id);
        if (acesso.papel !== 'narrador') {
            return res.status(403).json({ erro: 'Apenas o narrador pode deletar abas.' });
        }

        await pool.query('DELETE FROM cronica_abas WHERE id = $1 AND cronica_id = $2', [abaId, id]);
        res.json({ mensagem: 'Aba deletada com sucesso.' });
    } catch (err) {
        console.error('Erro ao deletar aba:', err);
        res.status(500).json({ erro: 'Erro ao deletar a aba.' });
    }
});

// Deletar crônica (imediatamente, com confirmação)
router.delete('/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const result = await pool.query(
            'DELETE FROM cronicas WHERE id = $1 AND narrador_id = $2 RETURNING id',
            [id, usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode deletar a crônica.' });
        }

        res.json({ mensagem: 'Crônica e todos os seus registros foram apagados.' });
    } catch (err) {
        console.error('Erro ao deletar crônica:', err);
        res.status(500).json({ erro: 'Erro ao deletar crônica.' });
    }
});

// ==========================================
// ROTAS DE AUTOMAÇÕES
// ==========================================

// 1. Listar automações da crônica
router.get('/:cronicaId/automacoes', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(`
            SELECT a.*, e.nome AS evento_nome, t.nome AS tipo_nome 
            FROM automacoes a
            JOIN world_events e ON a.evento_id = e.id
            JOIN automacao_tipos t ON a.tipo_id = t.id
            WHERE e.cronica_id = $1
            ORDER BY a.criado_em DESC
        `, [cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar automações.' }); }
});

// Rota para buscar eventos (usada pelo carregarEventos e abrirModalAutomacao)
router.get('/:cronicaId/eventos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(`
            SELECT e.*, 
            COALESCE(json_agg(json_build_object('node_nome', n.nome, 'flag_key', w.flag_key, 'peso', w.peso)) 
            FILTER (WHERE w.id IS NOT NULL), '[]') as gatilhos
            FROM world_events e
            LEFT JOIN event_flag_weights w ON e.id = w.event_id
            LEFT JOIN world_nodes n ON w.node_id = n.id
            WHERE e.cronica_id = $1
            GROUP BY e.id
        `, [cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar eventos.' }); }
});

// 2. Criar nova automação
router.post('/:cronicaId/automacoes', verificarToken, async (req, res) => {
    const { evento_id, tipo_nome, parametros } = req.body;
    try {
        // Busca o ID do tipo pelo nome enviado pelo front
        const tipoQuery = await pool.query('SELECT id FROM automacao_tipos WHERE nome = $1', [tipo_nome]);
        const tipoId = tipoQuery.rows[0].id;

        await pool.query(
            'INSERT INTO automacoes (evento_id, tipo_id, parametros) VALUES ($1, $2, $3)',
            [evento_id, tipoId, JSON.stringify(parametros)]
        );
        res.status(201).json({ mensagem: 'Automação forjada!' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao criar automação.' }); }
});

// 3. Deletar automação
router.delete('/:cronicaId/automacoes/:id', verificarToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM automacoes WHERE id = $1', [req.params.id]);
        res.json({ mensagem: 'Automação destruída.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao deletar.' }); }
});

// 4. Toggle (Ativar/Desativar)
router.put('/:cronicaId/automacoes/:id/toggle', verificarToken, async (req, res) => {
    const { ativo } = req.body;
    try {
        await pool.query('UPDATE automacoes SET ativo = $1 WHERE id = $2', [ativo, req.params.id]);
        res.json({ mensagem: 'Estado alterado.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao alterar estado.' }); }
});

// Rota: Buscar Fichas da Crônica (Com Controle de Visibilidade)
router.get('/:id/fichas', verificarToken, async (req, res) => {
    const cronicaId = req.params.id;
    const usuarioId = req.usuario.id;

    try {
        // 1. Descobrir o papel do usuário NESTA crônica específica (Isolamento)
        const membroQuery = await pool.query(
            'SELECT papel FROM cronica_membros WHERE cronica_id = $1 AND usuario_id = $2',
            [cronicaId, usuarioId]
        );

        if (membroQuery.rows.length === 0) {
            return res.status(403).json({ erro: 'Você não faz parte desta crônica.' });
        }

        const papel = membroQuery.rows[0].papel;

        // 2. Aplicar a Regra de Acesso
        let fichasQuery;
        if (papel === 'narrador') {
            // Narrador vê TODAS as fichas da mesa
            fichasQuery = await pool.query(
                'SELECT * FROM personagens WHERE cronica_id = $1',
                [cronicaId]
            );
        } else {
            // Jogador vê APENAS a sua ficha
            fichasQuery = await pool.query(
                'SELECT * FROM personagens WHERE cronica_id = $1 AND usuario_id = $2',
                [cronicaId, usuarioId]
            );
        }

        res.json({ papel, fichas: fichasQuery.rows });

    } catch (err) {
        console.error('Erro ao buscar fichas da crônica:', err);
        res.status(500).json({ erro: 'Erro no servidor.' });
    }
});

// Rota: Buscar Fichas da Crônica (Com Controle de Visibilidade)
router.get('/:id/fichas', verificarToken, async (req, res) => {
    const cronicaId = req.params.id;
    const usuarioId = req.usuario.id;

    try {
        // 1. Descobrir o papel do usuário NESTA crônica específica (Isolamento)
        const membroQuery = await pool.query(
            'SELECT papel FROM cronica_membros WHERE cronica_id = $1 AND usuario_id = $2',
            [cronicaId, usuarioId]
        );

        if (membroQuery.rows.length === 0) {
            return res.status(403).json({ erro: 'Você não faz parte desta crônica.' });
        }

        const papel = membroQuery.rows[0].papel;

        // 2. Aplicar a Regra de Acesso
        let fichasQuery;
        if (papel === 'narrador') {
            // Narrador vê TODAS as fichas da mesa
            fichasQuery = await pool.query(
                'SELECT * FROM personagens WHERE cronica_id = $1',
                [cronicaId]
            );
        } else {
            // Jogador vê APENAS a sua ficha
            fichasQuery = await pool.query(
                'SELECT * FROM personagens WHERE cronica_id = $1 AND usuario_id = $2',
                [cronicaId, usuarioId]
            );
        }

        res.json({ papel, fichas: fichasQuery.rows });

    } catch (err) {
        console.error('Erro ao buscar fichas da crônica:', err);
        res.status(500).json({ erro: 'Erro no servidor.' });
    }
});

// Rota: Vincular uma Ficha da Gaveta à Crônica
router.put('/:id/vincular-ficha', verificarToken, async (req, res) => {
    const cronicaId = req.params.id;
    const usuarioId = req.usuario.id;
    const { personagem_id } = req.body;

    try {
        // Verifica se o usuário é membro da crônica
        const membro = await pool.query('SELECT 1 FROM cronica_membros WHERE cronica_id = $1 AND usuario_id = $2', [cronicaId, usuarioId]);
        if (membro.rows.length === 0) return res.status(403).json({ erro: 'Acesso negado.' });

        // Atualiza a ficha (garantindo que ela pertence a este usuário)
        const update = await pool.query(
            'UPDATE personagens SET cronica_id = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *',
            [cronicaId, personagem_id, usuarioId]
        );

        if (update.rows.length === 0) return res.status(404).json({ erro: 'Ficha não encontrada ou não pertence a você.' });
        
        res.json({ mensagem: 'Ficha vinculada com sucesso!', ficha: update.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao vincular ficha.' });
    }
});

// Exporta o roteador
module.exports = router;