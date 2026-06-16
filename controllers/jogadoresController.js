const pool = require('../db');

// ==========================================
// SEGURANÇA E PERMISSÕES DE ABAS
// ==========================================

exports.listarPermissoesAba = async (req, res) => {
    const { cronicaId, abaId } = req.params;
    try {
        const jogadoresQuery = await pool.query(`
            SELECT DISTINCT u.id, u.nome_usuario 
            FROM cronica_jogadores cj
            JOIN usuarios u ON cj.usuario_id = u.id
            WHERE cj.cronica_id = $1
        `, [cronicaId]);

        const permissoesQuery = await pool.query(`
            SELECT p.jogador_id, u.nome_usuario, p.nivel_acesso
            FROM aba_permissoes p
            JOIN usuarios u ON p.jogador_id = u.id
            WHERE p.aba_id = $1
        `, [abaId]);

        res.json({ jogadores: jogadoresQuery.rows, permissoes: permissoesQuery.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar permissões.' });
    }
};

exports.concederPermissaoAba = async (req, res) => {
    const { abaId } = req.params;
    const { jogador_id, nivel_acesso } = req.body;

    if (!jogador_id || jogador_id.trim() === '') {
        return res.status(400).json({ erro: 'Selecione um jogador válido antes de conceder poder.' });
    }
    
    try {
        await pool.query(`
            INSERT INTO aba_permissoes (aba_id, jogador_id, nivel_acesso)
            VALUES ($1, $2, $3)
            ON CONFLICT (aba_id, jogador_id) 
            DO UPDATE SET nivel_acesso = EXCLUDED.nivel_acesso;
        `, [abaId, jogador_id, nivel_acesso]);
        res.json({ mensagem: 'Acesso concedido.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao forjar acesso.' });
    }
};

exports.revogarPermissaoAba = async (req, res) => {
    const { abaId, jogadorId } = req.params;
    try {
        await pool.query('DELETE FROM aba_permissoes WHERE aba_id = $1 AND jogador_id = $2', [abaId, jogadorId]);
        res.json({ mensagem: 'Acesso revogado.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao revogar acesso.' });
    }
};

// ==========================================
// GESTÃO DE JOGADORES NA CRÔNICA
// ==========================================

exports.adicionarJogador = async (req, res) => {
    const { cronicaId } = req.params;
    const { email_jogador } = req.body;

    try {
        const cronica = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        if (cronica.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });
        if (cronica.rows[0].narrador_id !== req.usuario.id) return res.status(403).json({ erro: 'Apenas o Narrador pode adicionar jogadores.' });

        const userQuery = await pool.query('SELECT id, nome_usuario FROM usuarios WHERE email = $1', [email_jogador]);
        if (userQuery.rows.length === 0) return res.status(404).json({ erro: 'Nenhum desperto encontrado com este e-mail.' });

        const convidado = userQuery.rows[0];
        if (convidado.id === req.usuario.id) return res.status(400).json({ erro: 'Você já é o Narrador desta crônica!' });

        await pool.query('INSERT INTO cronica_jogadores (cronica_id, usuario_id) VALUES ($1, $2)', [cronicaId, convidado.id]);

        res.status(201).json({ 
            mensagem: `${convidado.nome_usuario} foi convocado para a crônica!`,
            jogador: { id: convidado.id, nome_usuario: convidado.nome_usuario }
        });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Este jogador já faz parte desta crônica.' });
        console.error(err);
        res.status(500).json({ erro: 'Erro ao adicionar jogador.' });
    }
};

exports.listarJogadores = async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(`
            SELECT u.id, u.nome_usuario, cj.papel
            FROM cronica_jogadores cj
            JOIN usuarios u ON cj.usuario_id = u.id
            WHERE cj.cronica_id = $1
        `, [cronicaId]);
        res.json(query.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar jogadores da crônica.' });
    }
};

exports.removerJogador = async (req, res) => {
    const { cronicaId, jogadorId } = req.params;
    try {
        const cronica = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        if (cronica.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });
        if (cronica.rows[0].narrador_id !== req.usuario.id) return res.status(403).json({ erro: 'Apenas o Narrador pode remover jogadores.' });
        if (jogadorId === req.usuario.id) return res.status(400).json({ erro: 'Você é o Narrador, não um jogador.' });

        const result = await pool.query('DELETE FROM cronica_jogadores WHERE cronica_id = $1 AND usuario_id = $2 RETURNING *', [cronicaId, jogadorId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Jogador não encontrado nesta crônica.' });

        res.json({ mensagem: 'Jogador removido da crônica.' });
    } catch (err) {
        console.error('Erro ao remover jogador:', err);
        res.status(500).json({ erro: 'Erro ao remover jogador.' });
    }
};

exports.sairDaCronica = async (req, res) => {
    const { cronicaId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const cronica = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        if (cronica.rows.length === 0) return res.status(404).json({ erro: 'Crônica não encontrada.' });
        if (cronica.rows[0].narrador_id === usuarioId) return res.status(400).json({ erro: 'O Narrador não pode sair da própria crônica. Use a opção de Finalizar/Deletar.' });

        const result = await pool.query('DELETE FROM cronica_jogadores WHERE cronica_id = $1 AND usuario_id = $2 RETURNING *', [cronicaId, usuarioId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Você não está nesta crônica.' });

        res.json({ mensagem: 'Você saiu da crônica.' });
    } catch (err) {
        console.error('Erro ao sair da crônica:', err);
        res.status(500).json({ erro: 'Erro ao sair da crônica.' });
    }
};

exports.listarCronicasDoJogador = async (req, res) => {
    const usuarioId = req.usuario.id;
    const sistemaSlug = req.query.sistema;

    try {
        let query = `
            SELECT c.id, c.nome, s.slug AS sistema
            FROM cronicas c
            JOIN cronica_jogadores cj ON c.id = cj.cronica_id
            JOIN sistemas s ON c.sistema_id = s.id
            WHERE cj.usuario_id = $1
        `;
        const params = [usuarioId];

        if (sistemaSlug) {
            query += ` AND s.slug = $2`;
            params.push(sistemaSlug);
        }

        query += ` ORDER BY c.nome ASC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar crônicas do jogador:', err);
        res.status(500).json({ erro: 'Erro ao buscar crônicas.' });
    }
};