const pool = require('../db');
// Removi o checarAcessoCronica daqui, importamos apenas o checarNivelAcessoAba
const { checarNivelAcessoAba } = require('../middlewares/permissoes');

exports.listarPosts = async (req, res) => {
    const { cronicaId, abaId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        // O acesso à crônica já foi validado pela rota!
        
        const nivel = await checarNivelAcessoAba(usuarioId, abaId);
        if (nivel === 'nenhuma') return res.status(403).json({ erro: 'Aba oculta para você.' });

        const postsQuery = await pool.query(`
            SELECT p.*, COALESCE(pc.apelido, u.nome_usuario) AS autor_nome, COALESCE(pc.avatar_url, u.avatar_url) AS autor_avatar
            FROM postagens p
            JOIN usuarios u ON p.autor_id = u.id
            LEFT JOIN perfis_cronica pc ON pc.usuario_id = u.id AND pc.cronica_id = $2
            WHERE p.aba_id = $1 ORDER BY p.criado_em DESC
        `, [abaId, cronicaId]);

        for (let post of postsQuery.rows) {
            if (post.tipo === 'album') {
                const album = await pool.query('SELECT * FROM post_album_itens WHERE post_id = $1 ORDER BY ordem', [post.id]);
                post.album_itens = album.rows;
            }
            if (post.tipo === 'votacao') {
                const opcoes = await pool.query('SELECT * FROM post_votacao_opcoes WHERE post_id = $1', [post.id]);
                post.opcoes = opcoes.rows;
            }
        }
        
        // Passamos o req.acesso (que foi definido no middleware) para o front-end
        res.json({ posts: postsQuery.rows, minha_permissao: nivel, papel_na_mesa: req.acesso, meu_usuario_id: usuarioId });
    } catch (err) { res.status(500).json({ erro: 'Erro ao carregar pergaminhos.' }); }
};

exports.criarPost = async (req, res) => {
    const { cronicaId, abaId } = req.params;
    const { conteudo, imagem_url, imagens, tipo, pergunta, opcoes, album_itens } = req.body;
    const autorId = req.usuario.id;

    try {
        const nivel = await checarNivelAcessoAba(autorId, abaId);
        if (nivel !== 'narrador' && nivel !== 'editor') return res.status(403).json({ erro: 'Você não tem poder de Editor nesta aba.' });

        const novoPost = await pool.query(
            `INSERT INTO postagens (aba_id, autor_id, conteudo, imagem_url, imagens, tipo, multipla_escolha) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [abaId, autorId, conteudo || pergunta || '', imagem_url || null, JSON.stringify(imagens || []), tipo || 'normal', req.body.multipla_escolha || false]
        );
        const postId = novoPost.rows[0].id;

        if (tipo === 'album' && album_itens && album_itens.length > 0) {
            for (let i = 0; i < album_itens.length; i++) {
                await pool.query(`INSERT INTO post_album_itens (post_id, imagem_url, descricao, ordem) VALUES ($1, $2, $3, $4)`, [postId, album_itens[i].imagem_url, album_itens[i].descricao || '', i]);
            }
        }
        if (tipo === 'votacao' && opcoes && opcoes.length > 0) {
            for (let opcao of opcoes) {
                if (opcao.trim()) await pool.query(`INSERT INTO post_votacao_opcoes (post_id, texto) VALUES ($1, $2)`, [postId, opcao.trim()]);
            }
        }
        res.status(201).json(novoPost.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao forjar o post.' }); }
};

exports.editarPost = async (req, res) => {
    const { cronicaId, postId } = req.params;
    const { conteudo } = req.body;
    if (!conteudo || conteudo.trim() === '') return res.status(400).json({ erro: 'O pergaminho não pode ficar em branco.' });

    try {
        const atualizado = await pool.query(`
            UPDATE postagens SET conteudo = $1, atualizado_em = NOW()
            WHERE id = $2 AND (autor_id = $3 OR EXISTS (SELECT 1 FROM cronicas WHERE id = $4 AND narrador_id = $3)) RETURNING *
        `, [conteudo, postId, req.usuario.id, cronicaId]);
        if (atualizado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão.' });
        res.json({ mensagem: 'Realidade textual redefinida.', post: atualizado.rows[0] });
    } catch (err) { res.status(500).json({ erro: 'Erro ao manipular os registros.' }); }
};

exports.deletarPost = async (req, res) => {
    const { cronicaId, postId } = req.params;
    try {
        const deletado = await pool.query(`
            DELETE FROM postagens WHERE id = $1 AND (autor_id = $2 OR EXISTS (SELECT 1 FROM cronicas WHERE id = $3 AND narrador_id = $2))
        `, [postId, req.usuario.id, cronicaId]);
        if (deletado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão para apagar.' });
        res.json({ mensagem: 'O post foi apagado da existência.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao deletar postagem.' }); }
};

exports.deletarAba = async (req, res) => {
    const { cronicaId, abaId } = req.params;
    try {
        // Agora podemos usar req.acesso para saber se é o narrador, muito mais leve que fazer SELECT!
        if (req.acesso !== 'narrador') return res.status(403).json({ erro: 'Apenas o Narrador pode deletar abas.' });
        
        await pool.query('DELETE FROM cronica_abas WHERE id = $1 AND cronica_id = $2', [abaId, cronicaId]);
        res.json({ mensagem: 'Aba excluída.' });
    } catch (err) { res.status(500).json({ erro: err.message }); }
};

exports.listarComentarios = async (req, res) => {
    const { cronicaId, postId } = req.params;
    try {
        const query = await pool.query(`
            SELECT c.*, COALESCE(pc.apelido, u.nome_usuario) AS autor_nome, COALESCE(pc.avatar_url, u.avatar_url) AS autor_avatar
            FROM post_comentarios c
            JOIN usuarios u ON c.autor_id = u.id
            LEFT JOIN perfis_cronica pc ON pc.usuario_id = u.id AND pc.cronica_id = $2
            WHERE c.post_id = $1 ORDER BY c.criado_em ASC
        `, [postId, cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar ecos.' }); }
};

exports.criarComentario = async (req, res) => {
    const { postId } = req.params;
    const { conteudo } = req.body;
    const autorId = req.usuario.id;
    if (!conteudo || conteudo.trim() === '') return res.status(400).json({ erro: 'O comentário não pode estar vazio.' });

    try {
        const postQuery = await pool.query('SELECT aba_id FROM postagens WHERE id = $1', [postId]);
        if (postQuery.rows.length === 0) return res.status(404).json({ erro: 'Postagem não encontrada.' });
        const nivel = await checarNivelAcessoAba(autorId, postQuery.rows[0].aba_id);
        if (nivel === 'leitura' || nivel === 'nenhuma') return res.status(403).json({ erro: 'Apenas leitura.' });

        const novoComentario = await pool.query(`INSERT INTO post_comentarios (post_id, autor_id, conteudo) VALUES ($1, $2, $3) RETURNING *`, [postId, autorId, conteudo]);
        res.status(201).json(novoComentario.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao enviar comentário.' }); }
};

exports.editarComentario = async (req, res) => {
    const { cronicaId, comentarioId } = req.params;
    try {
        const atualizado = await pool.query(`
            UPDATE post_comentarios SET conteudo = $1 
            WHERE id = $2 AND (autor_id = $3 OR EXISTS (SELECT 1 FROM cronicas WHERE id = $4 AND narrador_id = $3)) RETURNING *
        `, [req.body.conteudo, comentarioId, req.usuario.id, cronicaId]);
        if (atualizado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão.' });
        res.json(atualizado.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao atualizar.' }); }
};

exports.deletarComentario = async (req, res) => {
    const { cronicaId, comentarioId } = req.params;
    try {
        const deletado = await pool.query(`
            DELETE FROM post_comentarios WHERE id = $1 AND (autor_id = $2 OR EXISTS (SELECT 1 FROM cronicas WHERE id = $3 AND narrador_id = $2))
        `, [comentarioId, req.usuario.id, cronicaId]);
        if (deletado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão.' });
        res.json({ mensagem: 'Comentário apagado.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao deletar.' }); }
};

exports.votarOpcao = async (req, res) => {
    const { postId } = req.params;
    const { opcao_id } = req.body;
    const usuarioId = req.usuario.id;

    try {
        const post = await pool.query('SELECT * FROM postagens WHERE id = $1 AND tipo = $2', [postId, 'votacao']);
        if (post.rows.length === 0) return res.status(404).json({ erro: 'Votação não encontrada.' });

        if (!post.rows[0].multipla_escolha) {
            const jaVotou = await pool.query(`SELECT v.* FROM post_votacao_votos v JOIN post_votacao_opcoes o ON v.opcao_id = o.id WHERE o.post_id = $1 AND v.usuario_id = $2`, [postId, usuarioId]);
            if (jaVotou.rows.length > 0) {
                await pool.query(`DELETE FROM post_votacao_votos WHERE opcao_id IN (SELECT id FROM post_votacao_opcoes WHERE post_id = $1) AND usuario_id = $2`, [postId, usuarioId]);
                await pool.query('UPDATE post_votacao_opcoes SET votos = GREATEST(votos - 1, 0) WHERE id = $1', [jaVotou.rows[0].opcao_id]);
            }
        } else {
            const jaVotouNesta = await pool.query('SELECT * FROM post_votacao_votos WHERE opcao_id = $1 AND usuario_id = $2', [opcao_id, usuarioId]);
            if (jaVotouNesta.rows.length > 0) return res.status(400).json({ erro: 'Você já votou nesta opção.' });
        }

        await pool.query('INSERT INTO post_votacao_votos (opcao_id, usuario_id) VALUES ($1, $2)', [opcao_id, usuarioId]);
        await pool.query('UPDATE post_votacao_opcoes SET votos = votos + 1 WHERE id = $1', [opcao_id]);
        
        const opcoes = await pool.query('SELECT * FROM post_votacao_opcoes WHERE post_id = $1 ORDER BY id', [postId]);
        res.json({ mensagem: 'Voto registrado!', opcoes: opcoes.rows });
    } catch (err) { res.status(500).json({ erro: 'Erro ao registar voto.' }); }
};