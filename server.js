require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const verificarToken = require('./middlewares/auth');
const app = express();
const PORTA = 3000;
const JWT_SECRET = 'grimorio_secreto_m20_super_seguro';
const authRoutes = require('./routes/authRoutes');
const personagensRoutes = require('./routes/personagensRoutes');
const cronicasRoutes = require('./routes/cronicasRoutes');

app.use(express.json({ limit: '1mb' })); 

// Define a pasta public como raiz estática (assim tudo dentro de public fica acessível no navegador)
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ROTA DO HUB DE PERFIL (DASHBOARD)
// ==========================================

app.get('/auth/dashboard-resumo', verificarToken, async (req, res) => {
    const userId = req.usuario.id;

    try {
        const queryNarrador = await pool.query(
            'SELECT id, nome, status FROM cronicas WHERE narrador_id = $1 ORDER BY criado_em DESC', 
            [userId]
        );

        const queryJogador = await pool.query(`
            SELECT c.id as cronica_id, c.nome as cronica_nome, c.status
            FROM cronica_jogadores cj
            JOIN cronicas c ON cj.cronica_id = c.id
            WHERE cj.usuario_id = $1
            ORDER BY c.criado_em DESC
        `, [userId]);

        res.json({
            narrando: queryNarrador.rows,
            jogando: queryJogador.rows
        });

    } catch (err) {
        console.error("Erro ao carregar resumo do dashboard:", err);
        res.status(500).json({ erro: 'Erro interno ao carregar perfil.' });
    }
});

app.put('/personagens/:id/evoluir', verificarToken, async (req, res) => {
    const { id } = req.params;
    const donoId = req.usuario.id;
    const { dados_ficha, exp_total, exp_gasta, arete } = req.body;
    try {
        const atualizacao = await pool.query(
            `UPDATE personagens SET dados_ficha = $1, exp_total = $2, exp_gasta = $3, arete = $4 
             WHERE id = $5 AND usuario_id = $6 RETURNING *`,
            [dados_ficha, exp_total, exp_gasta, arete, id, donoId]
        );
        if (atualizacao.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão para editar.'});
        res.json({ mensagem: "Evolução salva!" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/personagens/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    const donoId = req.usuario.id;
    try {
        const delecao = await pool.query('DELETE FROM personagens WHERE id = $1 AND usuario_id = $2', [id, donoId]);
        if (delecao.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão para deletar.'});
        res.json({ mensagem: "Excluído com sucesso" });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ==========================================
// CONFIGURAÇÃO DO STORAGE (HD DO DEBIAN)
// ==========================================

const caminhosUpload = [
    'public/uploads/avatares',
    'public/uploads/capas',
    'public/uploads/social'
];
caminhosUpload.forEach(pasta => {
    if (!fs.existsSync(pasta)) fs.mkdirSync(pasta, { recursive: true });
});

const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        let subpasta = req.params.tipo; 
        if (subpasta !== 'avatares' && subpasta !== 'capas' && subpasta !== 'social') {
            subpasta = 'social'; 
        }
        cb(null, `public/uploads/${subpasta}`);
    },
    filename: (req, file, cb) => {
        const sufixoUnico = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extensao = path.extname(file.originalname).toLowerCase();
        cb(null, `${file.fieldname}-${sufixoUnico}${extensao}`);
    }
});

const filtroImagens = (req, file, cb) => {
    const extensoesPermitidas = /jpeg|jpg|png|webp|gif/;
    const extValida = extensoesPermitidas.test(path.extname(file.originalname).toLowerCase());
    const mimeValido = extensoesPermitidas.test(file.mimetype);
    if (extValida && mimeValido) return cb(null, true);
    cb(new Error('Apenas uploads de imagens são permitidos (jpeg, jpg, png, webp, gif)!'));
};

const upload = multer({ 
    storage: storageConfig,
    fileFilter: filtroImagens,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// ==========================================
// UPLOAD DE MÍDIA
// ==========================================

app.post('/midia/upload/:tipo', verificarToken, upload.array('imagens', 4), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ erro: 'Nenhuma imagem.' });

        // PEGA O TIPO DA URL (ex: 'capas' ou 'social')
        const tipo = req.params.tipo; 
        
        // CORREÇÃO: Usa a variável ${tipo} aqui
        const urlsGeradas = req.files.map(file => `/uploads/${tipo}/${file.filename}`);
        
        console.log("Servidor enviando estas URLs:", urlsGeradas); 
        
        res.status(201).json({ urls: urlsGeradas }); 
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro no upload.' });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ erro: 'Arquivo muito grande! Máximo 5MB.' });
        return res.status(400).json({ erro: err.message });
    } else if (err) {
        return res.status(400).json({ erro: err.message });
    }
    next();
});

// ==========================================
// ROTAS DE CRÔNICAS (NARRADOR)
// ==========================================

app.post('/cronicas', verificarToken, async (req, res) => {
    const { nome, descricao, sistema_id, capa_url } = req.body;
    const narrador_id = req.usuario.id;

    try {
        await pool.query('BEGIN');
        const novaCronica = await pool.query(
            `INSERT INTO cronicas (nome, descricao, narrador_id, sistema_id, capa_url) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [nome, descricao, narrador_id, sistema_id || 1, capa_url]
        );
        const cronicaId = novaCronica.rows[0].id;
        await pool.query(
            `INSERT INTO cronica_abas (cronica_id, nome, tipo) VALUES ($1, 'Feed Geral', 'geral')`,
            [cronicaId]
        );
        await pool.query('COMMIT');
        res.status(201).json({ mensagem: 'Crônica criada com sucesso!', id: cronicaId });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("Erro ao criar crônica:", err);
        res.status(500).json({ erro: 'Erro interno ao criar a crônica.' });
    }
});

// ==========================================
// ROTAS DO FEED DA COMUNIDADE
// ==========================================

// BUSCAR POSTS (Envia o ID e o Papel para o Front-end saber quem é o dono)
app.get('/cronicas/:cronicaId/abas/:abaId/posts', verificarToken, async (req, res) => {
    const { cronicaId, abaId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const acesso = await checarAcessoCronica(usuarioId, cronicaId);
        if (!acesso.temAcesso) return res.status(403).json({ erro: 'Acesso negado.' });

        const nivel = await checarNivelAcessoAba(usuarioId, abaId);
        if (nivel === 'nenhuma') return res.status(403).json({ erro: 'Aba oculta para você.' });

        const postsQuery = await pool.query(`
            SELECT p.*, u.nome_usuario as autor_nome
            FROM postagens p
            JOIN usuarios u ON p.autor_id = u.id
            WHERE p.aba_id = $1
            ORDER BY p.criado_em DESC
        `, [abaId]);

        res.json({
            posts: postsQuery.rows,
            minha_permissao: nivel,         // 'leitura', 'comentar', 'editor', ou 'narrador'
            papel_na_mesa: acesso.papel,    // 'narrador' ou 'jogador'
            meu_usuario_id: usuarioId       // Para o front-end saber quais posts são MEUS
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao carregar pergaminhos.' });
    }
});

// CRIAR POST (Apenas Narrador e Editor)
app.post('/cronicas/:cronicaId/abas/:abaId/posts', verificarToken, async (req, res) => {
    const { cronicaId, abaId } = req.params;
    const { conteudo, imagem_url, imagens } = req.body;
    const autorId = req.usuario.id;

    try {
        const acesso = await checarAcessoCronica(autorId, cronicaId);
        if (!acesso.temAcesso) return res.status(403).json({ erro: 'Acesso negado.' });

        const nivel = await checarNivelAcessoAba(autorId, abaId);
        
        // BLOQUEIO: Se for 'leitura' ou 'comentar', a requisição morre aqui!
        if (nivel !== 'narrador' && nivel !== 'editor') {
            return res.status(403).json({ erro: 'Você não tem poder de Editor nesta aba para forjar novas postagens.' });
        }

        const novoPost = await pool.query(
            "INSERT INTO postagens (aba_id, autor_id, conteudo, imagem_url, imagens) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [abaId, autorId, conteudo, imagem_url || null, JSON.stringify(imagens || [])]
        );
        res.status(201).json(novoPost.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao forjar o post.' });
    }
});


app.post('/cronicas/:cronicaId/abas/:abaId/posts', verificarToken, async (req, res) => {
    const { cronicaId, abaId } = req.params;
    const { conteudo, imagem_url, imagens } = req.body;
    const autorId = req.usuario.id;

    try {
        const acesso = await checarAcessoCronica(autorId, cronicaId);
        if (!acesso.temAcesso) return res.status(403).json({ erro: 'Acesso negado.' });

        // BLINDAGEM DO SERVIDOR: Verifica se o jogador pode escrever
        if (acesso.papel === 'jogador') {
            const queryAba = await pool.query('SELECT tipo FROM cronica_abas WHERE id = $1', [abaId]);
            const tipoAba = queryAba.rows[0].tipo;

            if (tipoAba === 'restrita') {
                const queryPerm = await pool.query(
                    'SELECT nivel_acesso FROM aba_permissoes WHERE aba_id = $1 AND jogador_id = $2',
                    [abaId, autorId]
                );

                if (queryPerm.rows.length === 0 || queryPerm.rows[0].nivel_acesso === 'leitura') {
                    return res.status(403).json({ erro: 'Sua magia não permite alterar esta aba. Apenas leitura.' });
                }
            }
        }

        const novoPost = await pool.query(
            "INSERT INTO postagens (aba_id, autor_id, conteudo, imagem_url, imagens) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [abaId, autorId, conteudo, imagem_url || null, JSON.stringify(imagens || [])]
        );
        res.status(201).json(novoPost.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao forjar o post.' });
    }
});

// ==========================================
// EDICAO E EXCLUSAO DE PUBLICACÕES (POSTS)
// ==========================================

app.put('/cronicas/:cronicaId/abas/:abaId/posts/:postId', verificarToken, async (req, res) => {
    const { cronicaId, postId } = req.params;
    const { conteudo } = req.body;
    const usuarioId = req.usuario.id;

    if (!conteudo || conteudo.trim() === '') return res.status(400).json({ erro: 'O pergaminho não pode ficar em branco.' });

    try {
        const atualizado = await pool.query(`
            UPDATE postagens 
            SET conteudo = $1, atualizado_em = NOW()
            WHERE id = $2 AND (
                autor_id = $3 OR EXISTS (SELECT 1 FROM cronicas WHERE id = $4 AND narrador_id = $3)
            ) RETURNING *
        `, [conteudo, postId, usuarioId, cronicaId]);

        if (atualizado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão.' });
        res.json({ mensagem: 'Realidade textual redefinida.', post: atualizado.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao manipular os registros.' });
    }
});

app.delete('/cronicas/:cronicaId/abas/:abaId/posts/:postId', verificarToken, async (req, res) => {
    const { cronicaId, postId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const deletado = await pool.query(`
            DELETE FROM postagens 
            WHERE id = $1 AND (
                autor_id = $2 OR EXISTS (SELECT 1 FROM cronicas WHERE id = $3 AND narrador_id = $2)
            )
        `, [postId, usuarioId, cronicaId]);
        
        if (deletado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão para apagar.' });
        res.json({ mensagem: 'O post foi apagado da existência.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar postagem.' });
    }
});

app.delete('/cronicas/:cronicaId/abas/:abaId', verificarToken, async (req, res) => {
    const { cronicaId, abaId } = req.params;
    const userId = req.usuario.id;
    try {
        const check = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        if (check.rows.length === 0 || check.rows[0].narrador_id !== userId) 
            return res.status(403).json({ erro: 'Apenas o Narrador pode deletar abas.' });

        await pool.query('DELETE FROM cronica_abas WHERE id = $1 AND cronica_id = $2', [abaId, cronicaId]);
        res.json({ mensagem: 'Aba excluída.' });
    } catch (err) { res.status(500).json({ erro: err.message }); }
});

// ==========================================
// COMENTÁRIOS DE POSTAGENS
// ==========================================

app.get('/cronicas/:cronicaId/posts/:postId/comentarios', verificarToken, async (req, res) => {
    const { postId } = req.params;
    try {
        const query = await pool.query(`
            SELECT c.*, u.nome_usuario as autor_nome
            FROM post_comentarios c
            JOIN usuarios u ON c.autor_id = u.id
            WHERE c.post_id = $1
            ORDER BY c.criado_em ASC
        `, [postId]);
        res.json(query.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar ecos.' });
    }
});

// ==========================================
// ROTA DE ENVIAR COMENTÁRIOS (URL ORIGINAL)
// ==========================================
app.post('/cronicas/:cronicaId/posts/:postId/comentarios', verificarToken, async (req, res) => {
    const { postId } = req.params;
    const { conteudo } = req.body;
    const autorId = req.usuario.id;

    if (!conteudo || conteudo.trim() === '') {
        return res.status(400).json({ erro: 'O pergaminho de comentário não pode estar vazio.' });
    }

    try {
        // 1. O servidor busca no banco a qual aba este post pertence automaticamente
        const postQuery = await pool.query('SELECT aba_id FROM postagens WHERE id = $1', [postId]);
        if (postQuery.rows.length === 0) {
            return res.status(404).json({ erro: 'Postagem não encontrada no éter.' });
        }
        const abaId = postQuery.rows[0].aba_id;

        // 2. Checa a permissão da aba correspondente
        const nivel = await checarNivelAcessoAba(autorId, abaId);
        
        // 3. Se for apenas leitura, bloqueia o usuário imediatamente
        if (nivel === 'leitura' || nivel === 'nenhuma') {
            return res.status(403).json({ erro: 'Você possui apenas permissão de leitura nesta aba.' });
        }

        // 4. Se for comentar, editor ou narrador, permite a gravação
        const novoComentario = await pool.query(`
            INSERT INTO post_comentarios (post_id, autor_id, conteudo)
            VALUES ($1, $2, $3) RETURNING *
        `, [postId, autorId, conteudo]);
        
        res.status(201).json(novoComentario.rows[0]);
    } catch (err) {
        console.error("Erro ao salvar comentário:", err);
        res.status(500).json({ erro: 'Erro ao enviar seu comentário para o véu da realidade.' });
    }
});

app.put('/cronicas/:cronicaId/posts/:postId/comentarios/:comentarioId', verificarToken, async (req, res) => {
    const { cronicaId, comentarioId } = req.params;
    const { conteudo } = req.body;
    const usuarioId = req.usuario.id;

    try {
        const atualizado = await pool.query(`
            UPDATE post_comentarios 
            SET conteudo = $1 
            WHERE id = $2 AND (
                autor_id = $3 OR 
                EXISTS (SELECT 1 FROM cronicas WHERE id = $4 AND narrador_id = $3)
            ) RETURNING *
        `, [conteudo, comentarioId, usuarioId, cronicaId]);

        if (atualizado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão.' });
        res.json(atualizado.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao atualizar comentário.' });
    }
});

app.delete('/cronicas/:cronicaId/posts/:postId/comentarios/:comentarioId', verificarToken, async (req, res) => {
    const { cronicaId, comentarioId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        const deletado = await pool.query(`
            DELETE FROM post_comentarios 
            WHERE id = $1 AND (
                autor_id = $2 OR 
                EXISTS (SELECT 1 FROM cronicas WHERE id = $3 AND narrador_id = $2)
            )
        `, [comentarioId, usuarioId, cronicaId]);
        
        if (deletado.rowCount === 0) return res.status(403).json({ erro: 'Sem permissão.' });
        res.json({ mensagem: 'Comentário apagado.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao deletar.' });
    }
});

// ==========================================
// WORLD ENGINE: ROTAS DE NODES E FLAGS
// ==========================================

app.get('/cronicas/:cronicaId/nodes', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(`
            SELECT n.id, n.nome, n.tipo, n.parent_node_id,
                   COALESCE(json_agg(json_build_object('key', f.flag_key, 'value', f.flag_value)) FILTER (WHERE f.id IS NOT NULL), '[]') as flags
            FROM world_nodes n
            LEFT JOIN world_flags f ON n.id = f.node_id
            WHERE n.cronica_id = $1
            GROUP BY n.id
            ORDER BY n.nome ASC
        `, [cronicaId]);
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar nós do mundo.' }); }
});

app.put('/cronicas/:cronicaId/nodes/:nodeId/flags', verificarToken, async (req, res) => {
    const { nodeId } = req.params;
    const { flag_key, flag_value } = req.body;

    try {
        const upsertQuery = `
            INSERT INTO world_flags (node_id, flag_key, flag_value)
            VALUES ($1, $2, $3)
            ON CONFLICT (node_id, flag_key) 
            DO UPDATE SET flag_value = EXCLUDED.flag_value, atualizado_em = NOW();
        `;
        await pool.query(upsertQuery, [nodeId, flag_key, flag_value]);

        const eventosAfetados = await pool.query(`
            SELECT event_id FROM event_flag_weights 
            WHERE node_id = $1 AND flag_key = $2
        `, [nodeId, flag_key]);

        for (let row of eventosAfetados.rows) {
            const eventId = row.event_id;
            const somaQuery = await pool.query(`
                SELECT COALESCE(SUM(w.peso), 0) as total
                FROM event_flag_weights w
                JOIN world_flags f ON w.node_id = f.node_id AND w.flag_key = f.flag_key
                WHERE w.event_id = $1 AND f.flag_value = TRUE
            `, [eventId]);

            const novoPool = somaQuery.rows[0].total;
            await pool.query(`
                UPDATE world_events
                SET pool_atual = $1,
                    status = CASE WHEN $1 >= pool_maxima THEN 'alerta_pronto' ELSE 'monitorando' END
                WHERE id = $2
            `, [novoPool, eventId]);
        }
        res.json({ mensagem: 'Realidade alterada.' });
    } catch (err) {
        console.error("Erro no Motor de Eventos:", err);
        res.status(500).json({ erro: 'Erro ao atualizar estado.' });
    }
});

app.post('/cronicas/:cronicaId/nodes/:nodeId/flags', verificarToken, async (req, res) => {
    const { nodeId } = req.params;
    const { flag_key } = req.body;

    if (!flag_key || flag_key.trim() === '') return res.status(400).json({ erro: 'O nome da flag não pode ser vazio.' });

    try {
        await pool.query(
            "INSERT INTO world_flags (node_id, flag_key, flag_value) VALUES ($1, $2, FALSE)",
            [nodeId, flag_key.trim().toLowerCase().replace(/\s+/g, '_')] 
        );
        res.status(201).json({ mensagem: 'Nova flag forjada.' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Uma flag com este nome já existe.' });
        console.error(err);
        res.status(500).json({ erro: 'Erro ao criar nova flag.' });
    }
});

app.post('/cronicas/:cronicaId/nodes', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, tipo } = req.body;
    try {
        const novoNode = await pool.query(
            "INSERT INTO world_nodes (cronica_id, nome, tipo, status) VALUES ($1, $2, $3, 'aprovado') RETURNING *",
            [cronicaId, nome, tipo]
        );
        res.status(201).json(novoNode.rows[0]);
    } catch (err) {
        console.error("🔥 ERRO FATAL NA FORJA:", err); 
        res.status(500).json({ erro: 'Erro interno ao forjar entidade.' });
    }
});

// ==========================================
// MODERAÇÃO DE CONTEÚDO (WORKFLOW)
// ==========================================

app.get('/cronicas/:cronicaId/moderacao', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(`
            SELECT * FROM world_nodes 
            WHERE cronica_id = $1 AND status = 'pendente'
            ORDER BY criado_em ASC
        `, [cronicaId]);
        res.json(query.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar fila de moderação.' });
    }
});

app.put('/cronicas/:cronicaId/nodes/:nodeId/aprovar', verificarToken, async (req, res) => {
    const { nodeId } = req.params;
    try {
        await pool.query("UPDATE world_nodes SET status = 'aprovado' WHERE id = $1", [nodeId]);
        res.json({ mensagem: 'Entidade aprovada.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao aprovar.' });
    }
});

// ==========================================
// AGENDA DE EVENTOS E POOLS DE TENSÃO
// ==========================================

app.get('/cronicas/:cronicaId/eventos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(
            `SELECT e.*,
                    COALESCE(json_agg(json_build_object('node_nome', n.nome, 'flag_key', w.flag_key, 'peso', w.peso)) FILTER (WHERE w.id IS NOT NULL), '[]') as gatilhos
             FROM world_events e
             LEFT JOIN event_flag_weights w ON e.id = w.event_id
             LEFT JOIN world_nodes n ON w.node_id = n.id
             WHERE e.cronica_id = $1
             GROUP BY e.id
             ORDER BY e.criado_em DESC`,
            [cronicaId]
        );
        res.json(query.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar eventos.' });
    }
});

app.post('/cronicas/:cronicaId/eventos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, descricao, pool_maxima } = req.body;
    try {
        const novoEvento = await pool.query(
            `INSERT INTO world_events (cronica_id, nome, descricao, pool_maxima) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [cronicaId, nome, descricao, pool_maxima || 10]
        );
        res.status(201).json(novoEvento.rows[0]);
    } catch (err) { res.status(500).json({ erro: 'Erro ao forjar novo evento.' }); }
});

app.post('/cronicas/:cronicaId/eventos/:eventId/pesos', verificarToken, async (req, res) => {
    const { eventId } = req.params;
    const { node_id, flag_key, peso } = req.body;
    try {
        const query = `
            INSERT INTO event_flag_weights (event_id, node_id, flag_key, peso)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (event_id, node_id, flag_key)
            DO UPDATE SET peso = EXCLUDED.peso;
        `;
        await pool.query(query, [eventId, node_id, flag_key.trim().toLowerCase().replace(/\s+/g, '_'), parseInt(peso) || 1]);
        res.json({ mensagem: 'Gatilho vinculado!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao vincular peso.' });
    }
});

// ==========================================
// SEGURANÇA E PERMISSÕES DE ABAS
// ==========================================

app.get('/cronicas/:cronicaId/abas/:abaId/permissoes', verificarToken, async (req, res) => {
    const { cronicaId, abaId } = req.params;
    try {
        // CORREÇÃO: Agora buscamos da tabela nova 'cronica_jogadores'
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

        res.json({
            jogadores: jogadoresQuery.rows, // Esta é a lista que vai preencher o seu <select>
            permissoes: permissoesQuery.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar permissões.' });
    }
});

app.put('/cronicas/:cronicaId/abas/:abaId/permissoes', verificarToken, async (req, res) => {
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
});

app.delete('/cronicas/:cronicaId/abas/:abaId/permissoes/:jogadorId', verificarToken, async (req, res) => {
    const { abaId, jogadorId } = req.params;
    try {
        await pool.query('DELETE FROM aba_permissoes WHERE aba_id = $1 AND jogador_id = $2', [abaId, jogadorId]);
        res.json({ mensagem: 'Acesso revogado.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao revogar acesso.' });
    }
});

app.post('/cronicas/:cronicaId/adicionar-jogador', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { email_jogador } = req.body;

    try {
        // 1. Busca o ID do usuário através do e-mail informado
        const userQuery = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email_jogador]);
        
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ erro: 'Nenhum desperto encontrado com este e-mail. Ele já se cadastrou?' });
        }

        const usuarioId = userQuery.rows[0].id;

        // 2. Insere na tabela associativa
        await pool.query(
            'INSERT INTO cronica_jogadores (cronica_id, usuario_id) VALUES ($1, $2)',
            [cronicaId, usuarioId]
        );

        res.status(201).json({ mensagem: 'Jogador convocado para a crônica com sucesso!' });

    } catch (err) {
        // O erro 23505 no Postgres significa "Unique Violation" (jogador já adicionado)
        if (err.code === '23505') {
            return res.status(400).json({ erro: 'Este jogador já faz parte desta crônica.' });
        }
        console.error(err);
        res.status(500).json({ erro: 'Erro ao adicionar jogador.' });
    }
});

// Buscar lista de jogadores da crônica
app.get('/cronicas/:cronicaId/jogadores', verificarToken, async (req, res) => {
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
});

// Função auxiliar para verificar se o usuário pertence à crônica
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

app.use('/auth', authRoutes);
app.use('/personagens', personagensRoutes);
app.use('/cronicas', cronicasRoutes);
app.listen(PORTA, () => console.log(`🚀 Servidor rodando em http://localhost:${PORTA}`));