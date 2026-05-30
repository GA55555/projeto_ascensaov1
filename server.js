require('dotenv').config();
const express = require('express');
const pool = require('./db');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const verificarToken = require('./middlewares/auth');
const { checarAcessoCronica, checarNivelAcessoAba } = require('./middlewares/permissoes');
const app = express();
const PORTA = 3000;
const authRoutes = require('./routes/authRoutes');
const personagensRoutes = require('./routes/personagensRoutes');
const cronicasRoutes = require('./routes/cronicasRoutes');
const perfilRoutes = require('./routes/perfilRoutes');

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
        SELECT 
        p.*,
        COALESCE(pc.apelido, u.nome_usuario) AS autor_nome,
        COALESCE(pc.avatar_url, u.avatar_url) AS autor_avatar
        FROM postagens p
        JOIN usuarios u ON p.autor_id = u.id
        LEFT JOIN perfis_cronica pc ON pc.usuario_id = u.id AND pc.cronica_id = $2
        WHERE p.aba_id = $1
        ORDER BY p.criado_em DESC
        `, [abaId, cronicaId]);

         for (let post of postsQuery.rows) {
        if (post.tipo === 'album') {
            const album = await pool.query(
                'SELECT * FROM post_album_itens WHERE post_id = $1 ORDER BY ordem', [post.id]
            );
            post.album_itens = album.rows;
        }
        if (post.tipo === 'votacao') {
            const opcoes = await pool.query(
                'SELECT * FROM post_votacao_opcoes WHERE post_id = $1', [post.id]
            );
            post.opcoes = opcoes.rows;
        }
    }
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

// CRIAR POST (com suporte a tipos: normal, album, votacao)
app.post('/cronicas/:cronicaId/abas/:abaId/posts', verificarToken, async (req, res) => {
    const { cronicaId, abaId } = req.params;
    const { conteudo, imagem_url, imagens, tipo, pergunta, opcoes, album_itens } = req.body;
    const autorId = req.usuario.id;

    try {
        const acesso = await checarAcessoCronica(autorId, cronicaId);
        if (!acesso.temAcesso) return res.status(403).json({ erro: 'Acesso negado.' });

        const nivel = await checarNivelAcessoAba(autorId, abaId);
        
        if (nivel !== 'narrador' && nivel !== 'editor') {
            return res.status(403).json({ erro: 'Você não tem poder de Editor nesta aba para forjar novas postagens.' });
        }

        // Salva o post principal
        const novoPost = await pool.query(
        `INSERT INTO postagens (aba_id, autor_id, conteudo, imagem_url, imagens, tipo, multipla_escolha) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [abaId, autorId, conteudo || pergunta || '', imagem_url || null, 
        JSON.stringify(imagens || []), tipo || 'normal', req.body.multipla_escolha || false]
    );
        
        const postId = novoPost.rows[0].id;

        // ✅ Salva itens do álbum
        if (tipo === 'album' && album_itens && album_itens.length > 0) {
            for (let i = 0; i < album_itens.length; i++) {
                const item = album_itens[i];
                await pool.query(
                    `INSERT INTO post_album_itens (post_id, imagem_url, descricao, ordem) 
                     VALUES ($1, $2, $3, $4)`,
                    [postId, item.imagem_url, item.descricao || '', i]
                );
            }
        }

        // ✅ Salva opções da votação
        if (tipo === 'votacao' && opcoes && opcoes.length > 0) {
            for (let opcao of opcoes) {
                if (opcao.trim()) {
                    await pool.query(
                        `INSERT INTO post_votacao_opcoes (post_id, texto) VALUES ($1, $2)`,
                        [postId, opcao.trim()]
                    );
                }
            }
        }

        res.status(201).json(novoPost.rows[0]);
    } catch (err) {
        console.error('Erro ao criar post:', err);
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
    const { cronicaId, postId } = req.params;  // ✅ Adicione cronicaId!
    
    try {
        const query = await pool.query(`
            SELECT 
                c.*,
                COALESCE(pc.apelido, u.nome_usuario) AS autor_nome,
                COALESCE(pc.avatar_url, u.avatar_url) AS autor_avatar
            FROM post_comentarios c
            JOIN usuarios u ON c.autor_id = u.id
            LEFT JOIN perfis_cronica pc ON pc.usuario_id = u.id AND pc.cronica_id = $2
            WHERE c.post_id = $1
            ORDER BY c.criado_em ASC
        `, [postId, cronicaId]);  // ✅ Agora cronicaId existe!
        
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
    const { cronicaId, postId } = req.params;
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
    const { nucleo_id } = req.query; // opcional: filtra por núcleo

    try {
        let queryStr = `
            SELECT n.id, n.nome, n.tipo, n.parent_node_id, n.nucleo_id,
                   en.nome as nucleo_nome,
                   COALESCE(json_agg(json_build_object('key', f.flag_key, 'value', f.flag_value)) FILTER (WHERE f.id IS NOT NULL), '[]') as flags
            FROM world_nodes n
            LEFT JOIN world_flags f ON n.id = f.node_id
            LEFT JOIN entidade_nucleos en ON n.nucleo_id = en.id
            WHERE n.cronica_id = $1
        `;
        const params = [cronicaId];
        let paramIdx = 2;

        if (nucleo_id) {
            queryStr += ` AND n.nucleo_id = $${paramIdx}`;
            params.push(nucleo_id);
            paramIdx++;
        }

        queryStr += ` GROUP BY n.id, en.nome ORDER BY n.nome ASC`;

        const query = await pool.query(queryStr, params);
        res.json(query.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar nós do mundo.' });
    }
});

app.put('/cronicas/:cronicaId/nodes/:nodeId/flags', verificarToken, async (req, res) => {
    const { cronicaId, nodeId } = req.params; // ✅ EXTRAI cronicaId
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

        const avisos = [];

        for (let row of eventosAfetados.rows) {
            const eventId = row.event_id;

            const eventoInfo = await pool.query(
                'SELECT nome, pool_maxima FROM world_events WHERE id = $1',
                [eventId]
            );
            if (eventoInfo.rows.length === 0) continue;
            const { nome, pool_maxima } = eventoInfo.rows[0];

            const somaQuery = await pool.query(`
                SELECT COALESCE(SUM(w.peso), 0) as total
                FROM event_flag_weights w
                JOIN world_flags f ON w.node_id = f.node_id AND w.flag_key = f.flag_key
                WHERE w.event_id = $1 AND f.flag_value = TRUE
            `, [eventId]);

            let novoPool = somaQuery.rows[0].total;
            let novoStatus;

            if (novoPool >= pool_maxima) {
                if (novoPool > pool_maxima) novoPool = pool_maxima;
                avisos.push(`${nome} (${novoPool}/${pool_maxima})`);
                novoStatus = 'alerta_pronto';
                await pool.query(`
                    UPDATE world_events
                    SET pool_atual = $1,
                        status = $2,
                        ultima_excedida_em = NOW()
                    WHERE id = $3
                `, [novoPool, novoStatus, eventId]);

                // ✅ DISPARA O MOTOR DE AUTOMAÇÕES
                console.log(`Evento ${eventId} (${nome}) atingiu o limite! Disparando motor...`);
                dispararAutomacoesDoEvento(eventId, cronicaId);

            } else {
                novoStatus = 'monitorando';
                await pool.query(`
                    UPDATE world_events
                    SET pool_atual = $1,
                        status = $2
                    WHERE id = $3
                `, [novoPool, novoStatus, eventId]);
            }
        }

        res.json({ mensagem: 'Realidade alterada.', avisos });
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
// AGENDA DE EVENTOS E POOLS DE TENSÃO
// ==========================================

app.get('/cronicas/:cronicaId/eventos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { nucleo_id } = req.query; // opcional: filtra eventos por núcleo

    try {
        let queryStr = `
            SELECT e.*,
                   COALESCE(json_agg(DISTINCT jsonb_build_object('node_nome', n.nome, 'flag_key', w.flag_key, 'peso', w.peso)) FILTER (WHERE w.id IS NOT NULL), '[]') as gatilhos,
                   COALESCE(json_agg(DISTINCT jsonb_build_object('id', en.id, 'nome', en.nome)) FILTER (WHERE en.id IS NOT NULL), '[]') as nucleos
            FROM world_events e
            LEFT JOIN event_flag_weights w ON e.id = w.event_id
            LEFT JOIN world_nodes n ON w.node_id = n.id
            LEFT JOIN evento_nucleo_ligacao enl ON e.id = enl.evento_id
            LEFT JOIN evento_nucleos en ON enl.nucleo_id = en.id
        `;

        const conditions = [`e.cronica_id = $1`];
        const params = [cronicaId];
        let paramIdx = 2;

        if (nucleo_id) {
            // Filtra eventos que estão associados ao núcleo informado
            conditions.push(`enl.nucleo_id = $${paramIdx}`);
            params.push(nucleo_id);
            paramIdx++;
        }

        queryStr += ` WHERE ${conditions.join(' AND ')} GROUP BY e.id ORDER BY e.criado_em DESC`;

        const query = await pool.query(queryStr, params);
        res.json(query.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao buscar eventos.' });
    }
});

app.post('/cronicas/:cronicaId/eventos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, descricao, pool_maxima, nucleos_ids } = req.body;

    try {
        const novoEvento = await pool.query(
            `INSERT INTO world_events (cronica_id, nome, descricao, pool_maxima) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [cronicaId, nome, descricao, pool_maxima || 10]
        );
        const eventoId = novoEvento.rows[0].id;

        if (nucleos_ids && Array.isArray(nucleos_ids)) {
            for (const nucleoId of nucleos_ids) {
                await pool.query(
                    'INSERT INTO evento_nucleo_ligacao (evento_id, nucleo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [eventoId, nucleoId]
                );
            }
        }

        res.status(201).json(novoEvento.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao forjar novo evento.' });
    }
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
        // ✅ VERIFICA SE É O NARRADOR DA CRÔNICA
        const cronica = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        
        if (cronica.rows.length === 0) {
            return res.status(404).json({ erro: 'Crônica não encontrada.' });
        }
        
        if (cronica.rows[0].narrador_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode adicionar jogadores.' });
        }

        // ✅ Busca o usuário pelo email
        const userQuery = await pool.query('SELECT id, nome_usuario FROM usuarios WHERE email = $1', [email_jogador]);
        
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ erro: 'Nenhum desperto encontrado com este e-mail.' });
        }

        const convidado = userQuery.rows[0];

        // ✅ IMPEDE QUE O NARRADOR ADICIONE A SI MESMO
        if (convidado.id === req.usuario.id) {
            return res.status(400).json({ erro: 'Você já é o Narrador desta crônica!' });
        }

        // ✅ Insere na tabela associativa
        await pool.query(
            'INSERT INTO cronica_jogadores (cronica_id, usuario_id) VALUES ($1, $2)',
            [cronicaId, convidado.id]
        );

        res.status(201).json({ 
            mensagem: `${convidado.nome_usuario} foi convocado para a crônica!`,
            jogador: { id: convidado.id, nome_usuario: convidado.nome_usuario }
        });

    } catch (err) {
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

// Remover jogador da crônica
app.delete('/cronicas/:cronicaId/jogadores/:jogadorId', verificarToken, async (req, res) => {
    const { cronicaId, jogadorId } = req.params;

    try {
        // ✅ Só o narrador pode remover
        const cronica = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        
        if (cronica.rows.length === 0) {
            return res.status(404).json({ erro: 'Crônica não encontrada.' });
        }
        
        if (cronica.rows[0].narrador_id !== req.usuario.id) {
            return res.status(403).json({ erro: 'Apenas o Narrador pode remover jogadores.' });
        }

        // ✅ Impede remover a si mesmo (narrador não é jogador)
        if (jogadorId === req.usuario.id) {
            return res.status(400).json({ erro: 'Você é o Narrador, não um jogador.' });
        }

        const result = await pool.query(
            'DELETE FROM cronica_jogadores WHERE cronica_id = $1 AND usuario_id = $2 RETURNING *',
            [cronicaId, jogadorId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Jogador não encontrado nesta crônica.' });
        }

        res.json({ mensagem: 'Jogador removido da crônica.' });
    } catch (err) {
        console.error('Erro ao remover jogador:', err);
        res.status(500).json({ erro: 'Erro ao remover jogador.' });
    }
});

// Jogador sai da crônica (auto-remoção)
app.delete('/cronicas/:cronicaId/sair', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const usuarioId = req.usuario.id;

    try {
        // ✅ Verifica se NÃO é o narrador (narrador não pode "sair")
        const cronica = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        
        if (cronica.rows.length === 0) {
            return res.status(404).json({ erro: 'Crônica não encontrada.' });
        }
        
        if (cronica.rows[0].narrador_id === usuarioId) {
            return res.status(400).json({ erro: 'O Narrador não pode sair da própria crônica. Use a opção de Finalizar/Deletar a crônica.' });
        }

        const result = await pool.query(
            'DELETE FROM cronica_jogadores WHERE cronica_id = $1 AND usuario_id = $2 RETURNING *',
            [cronicaId, usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'Você não está nesta crônica.' });
        }

        res.json({ mensagem: 'Você saiu da crônica.' });
    } catch (err) {
        console.error('Erro ao sair da crônica:', err);
        res.status(500).json({ erro: 'Erro ao sair da crônica.' });
    }
});

// Votar em uma opção (voto permanente, sem toggle)
app.post('/cronicas/:cronicaId/posts/:postId/votar', verificarToken, async (req, res) => {
    const { postId } = req.params;
    const { opcao_id } = req.body;
    const usuarioId = req.usuario.id;

    try {
        const post = await pool.query('SELECT * FROM postagens WHERE id = $1 AND tipo = $2', [postId, 'votacao']);
        if (post.rows.length === 0) return res.status(404).json({ erro: 'Votação não encontrada.' });

        const isMultipla = post.rows[0].multipla_escolha;

        // Se NÃO for múltipla, remove TODOS os votos anteriores (troca de opção)
        if (!isMultipla) {
            // Verifica se já votou em ALGUMA opção
            const jaVotou = await pool.query(
                `SELECT v.* FROM post_votacao_votos v 
                 JOIN post_votacao_opcoes o ON v.opcao_id = o.id 
                 WHERE o.post_id = $1 AND v.usuario_id = $2`,
                [postId, usuarioId]
            );

            if (jaVotou.rows.length > 0) {
                // Remove o voto anterior
                await pool.query(
                    `DELETE FROM post_votacao_votos 
                     WHERE opcao_id IN (SELECT id FROM post_votacao_opcoes WHERE post_id = $1) 
                     AND usuario_id = $2`,
                    [postId, usuarioId]
                );
                // Decrementa o contador da opção antiga
                await pool.query(
                    'UPDATE post_votacao_opcoes SET votos = GREATEST(votos - 1, 0) WHERE id = $1',
                    [jaVotou.rows[0].opcao_id]
                );
            }

            // Adiciona o novo voto
            await pool.query('INSERT INTO post_votacao_votos (opcao_id, usuario_id) VALUES ($1, $2)', [opcao_id, usuarioId]);
            await pool.query('UPDATE post_votacao_opcoes SET votos = votos + 1 WHERE id = $1', [opcao_id]);

        } else {
            // ✅ MÚLTIPLA ESCOLHA: verifica se já votou NESTA opção
            const jaVotouNesta = await pool.query(
                'SELECT * FROM post_votacao_votos WHERE opcao_id = $1 AND usuario_id = $2',
                [opcao_id, usuarioId]
            );

            if (jaVotouNesta.rows.length > 0) {
                return res.status(400).json({ erro: 'Você já votou nesta opção.' });
            }

            // Adiciona o voto (sem remover outros)
            await pool.query('INSERT INTO post_votacao_votos (opcao_id, usuario_id) VALUES ($1, $2)', [opcao_id, usuarioId]);
            await pool.query('UPDATE post_votacao_opcoes SET votos = votos + 1 WHERE id = $1', [opcao_id]);
        }

        const opcoes = await pool.query('SELECT * FROM post_votacao_opcoes WHERE post_id = $1 ORDER BY id', [postId]);
        res.json({ mensagem: 'Voto registrado!', opcoes: opcoes.rows });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Você já votou nesta opção.' });
        console.error('Erro ao votar:', err);
        res.status(500).json({ erro: 'Erro ao registrar voto.' });
    }
});

// Editar uma entidade (nome)
app.put('/cronicas/:cronicaId/nodes/:nodeId', verificarToken, async (req, res) => {
    const { nodeId } = req.params;
    const { nome } = req.body;

    try {
        const result = await pool.query(
            'UPDATE world_nodes SET nome = $1 WHERE id = $2 RETURNING *',
            [nome, nodeId]
        );
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        res.json({ mensagem: 'Entidade atualizada!', node: result.rows[0] });
    } catch (err) {
        console.error('Erro ao editar entidade:', err);
        res.status(500).json({ erro: 'Erro ao editar entidade.' });
    }
});

// Deletar uma entidade e tudo vinculado
app.delete('/cronicas/:cronicaId/nodes/:nodeId', verificarToken, async (req, res) => {
    const { nodeId } = req.params;

    try {
        // As foreign keys com ON DELETE CASCADE já cuidam de world_flags e event_flag_weights
        const result = await pool.query('DELETE FROM world_nodes WHERE id = $1 RETURNING id', [nodeId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Entidade não encontrada.' });
        res.json({ mensagem: 'Entidade e seus vínculos foram apagados.' });
    } catch (err) {
        console.error('Erro ao deletar entidade:', err);
        res.status(500).json({ erro: 'Erro ao deletar entidade.' });
    }
});

// Editar uma flag (renomear)
// Renomear uma flag
app.put('/cronicas/:cronicaId/nodes/:nodeId/flags/:flagKey', verificarToken, async (req, res) => {
    const { cronicaId, nodeId, flagKey } = req.params;
    const { novo_nome } = req.body;

    if (!novo_nome || novo_nome.trim() === '') {
        return res.status(400).json({ erro: 'Novo nome da flag não pode ser vazio.' });
    }

    try {
        await pool.query('BEGIN');

        // Atualiza o nome da flag na tabela world_flags
        await pool.query(
            'UPDATE world_flags SET flag_key = $1 WHERE node_id = $2 AND flag_key = $3',
            [novo_nome, nodeId, flagKey]
        );

        // Atualiza os pesos vinculados nos eventos
        await pool.query(
            'UPDATE event_flag_weights SET flag_key = $1 WHERE node_id = $2 AND flag_key = $3',
            [novo_nome, nodeId, flagKey]
        );

        await pool.query('COMMIT');
        res.json({ mensagem: 'Flag renomeada com sucesso.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        if (err.code === '23505') {
            return res.status(400).json({ erro: 'Já existe uma flag com este nome nesta entidade.' });
        }
        console.error('Erro ao renomear flag:', err);
        res.status(500).json({ erro: 'Erro ao renomear flag.' });
    }
});

// Deletar uma flag
app.delete('/cronicas/:cronicaId/nodes/:nodeId/flags/:flagKey', verificarToken, async (req, res) => {
    const { nodeId, flagKey } = req.params;

    try {
        await pool.query('BEGIN');

        const eventosVinculados = await pool.query(
            'SELECT DISTINCT event_id FROM event_flag_weights WHERE node_id = $1 AND flag_key = $2',
            [nodeId, flagKey]
        );

        await pool.query('DELETE FROM event_flag_weights WHERE node_id = $1 AND flag_key = $2', [nodeId, flagKey]);
        await pool.query('DELETE FROM world_flags WHERE node_id = $1 AND flag_key = $2', [nodeId, flagKey]);

        for (let row of eventosVinculados.rows) {
            const eventId = row.event_id;

            const eventoInfo = await pool.query('SELECT pool_maxima FROM world_events WHERE id = $1', [eventId]);
            if (eventoInfo.rows.length === 0) continue;
            const { pool_maxima } = eventoInfo.rows[0];

            const somaQuery = await pool.query(`
                SELECT COALESCE(SUM(w.peso), 0) as total
                FROM event_flag_weights w
                JOIN world_flags f ON w.node_id = f.node_id AND w.flag_key = f.flag_key
                WHERE w.event_id = $1 AND f.flag_value = TRUE
            `, [eventId]);

            const novoPool = somaQuery.rows[0].total;
            if (novoPool >= pool_maxima) {
                await pool.query(`
                    UPDATE world_events
                    SET pool_atual = $1,
                        status = 'alerta_pronto',
                        ultima_excedida_em = NOW()
                    WHERE id = $2
                `, [novoPool, eventId]); // Dica: use novoPool aqui para garantir fidelidade

                // A Integração fica muito mais limpa assim:
                console.log(`Evento ${eventId} atingiu o limite! Disparando motor...`);
                dispararAutomacoesDoEvento(eventId, cronicaId);
            } else {
                // Caso ainda não tenha atingido, apenas atualiza o valor
                await pool.query(`
                    UPDATE world_events SET pool_atual = $1, status = 'monitorando' WHERE id = $2
                `, [novoPool, eventId]);
            }
            }

        await pool.query('COMMIT');
        res.json({ mensagem: 'Flag e seus vínculos removidos. Eventos recalculados.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Erro ao deletar flag:', err);
        res.status(500).json({ erro: 'Erro ao deletar flag.' });
    }
});
// ============ NÚCLEOS DE ENTIDADES ============

// Listar núcleos de entidades da crônica
app.get('/cronicas/:cronicaId/entidade-nucleos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(
            "SELECT id, nome FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'entidade' ORDER BY nome ASC",
            [cronicaId]
        );
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar núcleos de entidades.' }); }
});

// Criar núcleo de entidade
app.post('/cronicas/:cronicaId/entidade-nucleos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { nome } = req.body;
    if (!nome || nome.trim() === '') return res.status(400).json({ erro: 'Nome do núcleo obrigatório.' });
    try {
        const novo = await pool.query(
            "INSERT INTO entidade_nucleos (cronica_id, nome, tipo) VALUES ($1, $2, 'entidade') RETURNING *",
            [cronicaId, nome.trim()]
        );
        res.status(201).json(novo.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Já existe um núcleo com este nome para este tipo.' });
        res.status(500).json({ erro: 'Erro ao criar núcleo.' });
    }
});

// Renomear núcleo de entidade
app.put('/cronicas/:cronicaId/entidade-nucleos/:nucleoId', verificarToken, async (req, res) => {
    const { nucleoId } = req.params;
    const { nome } = req.body;
    if (!nome || nome.trim() === '') return res.status(400).json({ erro: 'Nome obrigatório.' });
    try {
        const result = await pool.query(
            'UPDATE entidade_nucleos SET nome = $1 WHERE id = $2 RETURNING *',
            [nome.trim(), nucleoId]
        );
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Já existe um núcleo com este nome.' });
        console.error(err);
        res.status(500).json({ erro: 'Erro ao renomear núcleo.' });
    }
});

// Excluir núcleo de entidade (entidades vinculadas voltam a ter nucleo_id NULL)
app.delete('/cronicas/:cronicaId/entidade-nucleos/:nucleoId', verificarToken, async (req, res) => {
    const { nucleoId } = req.params;
    try {
        const result = await pool.query('DELETE FROM entidade_nucleos WHERE id = $1 RETURNING id', [nucleoId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json({ mensagem: 'Núcleo excluído.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao excluir núcleo.' });
    }
});

// Atualizar o núcleo de uma entidade (associação 1:N)
app.put('/cronicas/:cronicaId/nodes/:nodeId/nucleo', verificarToken, async (req, res) => {
    const { nodeId } = req.params;
    const { nucleo_id } = req.body; // pode ser null para remover
    try {
        await pool.query(
            'UPDATE world_nodes SET nucleo_id = $1 WHERE id = $2',
            [nucleo_id || null, nodeId]
        );
        res.json({ mensagem: 'Núcleo atualizado.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao associar núcleo.' });
    }
});


// ============ NÚCLEOS DE EVENTOS ============

// Listar núcleos de eventos
app.get('/cronicas/:cronicaId/evento-nucleos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(
            "SELECT id, nome FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'evento' ORDER BY nome ASC",
            [cronicaId]
        );
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar núcleos de eventos.' }); }
});

// Criar núcleo de evento
app.post('/cronicas/:cronicaId/evento-nucleos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { nome } = req.body;
    if (!nome || nome.trim() === '') return res.status(400).json({ erro: 'Nome obrigatório.' });
    try {
        const novo = await pool.query(
            "INSERT INTO entidade_nucleos (cronica_id, nome, tipo) VALUES ($1, $2, 'evento') RETURNING *",
            [cronicaId, nome.trim()]
        );
        res.status(201).json(novo.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Já existe um núcleo com este nome para este tipo.' });
        res.status(500).json({ erro: 'Erro ao criar núcleo.' });
    }
});

// Renomear núcleo de evento 
app.put('/cronicas/:cronicaId/evento-nucleos/:nucleoId', verificarToken, async (req, res) => {
    const { nucleoId } = req.params;
    const { nome } = req.body;
    if (!nome || nome.trim() === '') return res.status(400).json({ erro: 'Nome obrigatório.' });
    try {
        const result = await pool.query(
            'UPDATE entidade_nucleos SET nome = $1 WHERE id = $2 RETURNING *',
            [nome.trim(), nucleoId]
        );
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Já existe um núcleo com este nome para este tipo.' });
        console.error(err);
        res.status(500).json({ erro: 'Erro ao renomear núcleo.' });
    }
});

// Excluir núcleo de evento 
app.delete('/cronicas/:cronicaId/evento-nucleos/:nucleoId', verificarToken, async (req, res) => {
    const { nucleoId } = req.params;
    try {
        const result = await pool.query('DELETE FROM entidade_nucleos WHERE id = $1 RETURNING id', [nucleoId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json({ mensagem: 'Núcleo excluído.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao excluir núcleo.' });
    }
});

// Vincular evento a núcleo (adicionar)
app.post('/cronicas/:cronicaId/eventos/:eventId/nucleos', verificarToken, async (req, res) => {
    const { eventId } = req.params;
    const { nucleo_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO evento_nucleo_ligacao (evento_id, nucleo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [eventId, nucleo_id]
        );
        res.json({ mensagem: 'Evento vinculado ao núcleo.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao vincular.' });
    }
});

// Desvincular evento de núcleo
app.delete('/cronicas/:cronicaId/eventos/:eventId/nucleos/:nucleoId', verificarToken, async (req, res) => {
    const { eventId, nucleoId } = req.params;
    try {
        await pool.query(
            'DELETE FROM evento_nucleo_ligacao WHERE evento_id = $1 AND nucleo_id = $2',
            [eventId, nucleoId]
        );
        res.json({ mensagem: 'Vínculo removido.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao desvincular.' });
    }
});
// Deletar um evento
app.delete('/cronicas/:cronicaId/eventos/:eventId', verificarToken, async (req, res) => {
    const { eventId } = req.params;

    try {
        await pool.query('BEGIN');

        // Remove os pesos vinculados (gatilhos)
        await pool.query('DELETE FROM event_flag_weights WHERE event_id = $1', [eventId]);

        // Remove os vínculos com núcleos de eventos
        await pool.query('DELETE FROM evento_nucleo_ligacao WHERE evento_id = $1', [eventId]);

        // Remove o evento
        const result = await pool.query('DELETE FROM world_events WHERE id = $1 RETURNING id', [eventId]);

        if (result.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ erro: 'Evento não encontrado.' });
        }

        await pool.query('COMMIT');
        res.json({ mensagem: 'Evento deletado com sucesso.' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Erro ao deletar evento:', err);
        res.status(500).json({ erro: 'Erro ao deletar evento.' });
    }
});

// ==========================================
// MOTOR DE AUTOMAÇÕES (RULE ENGINE)
// ==========================================

const MotorAutomacao = {
    'alterar_flag': async (parametros, cronicaId) => {
        const { node_id, flag_key, novo_valor } = parametros;
        await pool.query(`
            INSERT INTO world_flags (node_id, flag_key, flag_value)
            VALUES ($1, $2, $3)
            ON CONFLICT (node_id, flag_key) 
            DO UPDATE SET flag_value = EXCLUDED.flag_value, atualizado_em = NOW();
        `, [node_id, flag_key, novo_valor]);
        return `Flag ${flag_key} definida como ${novo_valor}.`;
    },
    'postar_em_aba': async (parametros, cronicaId) => {
        const narrador = await pool.query('SELECT narrador_id FROM cronicas WHERE id = $1', [cronicaId]);
        const autorId = narrador.rows[0].narrador_id;
        const { aba_id, conteudo, tipo_post } = parametros;
        await pool.query(`
            INSERT INTO postagens (aba_id, autor_id, conteudo, tipo, multipla_escolha) 
            VALUES ($1, $2, $3, $4, FALSE)
        `, [aba_id, autorId, conteudo, tipo_post || 'normal']);
        return `Post gerado na aba ${aba_id}.`;
    },
    'criar_evento': async (parametros, cronicaId) => {
        const { nome, descricao, pool_maxima } = parametros;
        await pool.query(`
            INSERT INTO world_events (cronica_id, nome, descricao, pool_maxima) 
            VALUES ($1, $2, $3, $4)
        `, [cronicaId, nome, descricao || '', pool_maxima || 10]);
        return `Evento ${nome} gerado.`;
    }
};

async function dispararAutomacoesDoEvento(eventId, cronicaId) {
    try {
        const automacoes = await pool.query(`
            SELECT a.id, t.nome AS tipo, a.parametros 
            FROM automacoes a
            JOIN automacao_tipos t ON a.tipo_id = t.id
            WHERE a.evento_id = $1 AND a.ativo = TRUE
        `, [eventId]);

        for (let auto of automacoes.rows) {
            try {
                if (MotorAutomacao[auto.tipo]) {
                    const detalhes = await MotorAutomacao[auto.tipo](auto.parametros, cronicaId);
                    await pool.query(`INSERT INTO automacao_log (automacao_id, evento_id, status, detalhes) VALUES ($1, $2, 'sucesso', $3)`, [auto.id, eventId, detalhes]);
                }
            } catch (erroAcao) {
                await pool.query(`INSERT INTO automacao_log (automacao_id, evento_id, status, detalhes) VALUES ($1, $2, 'erro', $3)`, [auto.id, eventId, erroAcao.message]);
            }
        }
        await pool.query(`UPDATE automacoes SET ativo = FALSE WHERE evento_id = $1`, [eventId]);
    } catch (err) { console.error("Falha no Motor:", err); }
}

// ============ SESSÕES ============

// Listar sessões (agora com nucleo_id e nucleo_nome)
app.get('/cronicas/:cronicaId/sessoes', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(
            `SELECT s.*, en.nome AS nucleo_nome
             FROM sessoes s
             LEFT JOIN entidade_nucleos en ON s.nucleo_id = en.id
             WHERE s.cronica_id = $1
             ORDER BY s.data_sessao DESC, s.criado_em DESC`,
            [cronicaId]
        );
        // Garante que os campos JSONB sejam retornados como arrays
        const sessoes = query.rows.map(s => ({
            ...s,
            entidades: s.entidades || [],
            eventos: s.eventos || [],
            automacoes: s.automacoes || [],
            desfechos: s.desfechos || []
        }));
        res.json(sessoes);
    } catch (err) {
        console.error('Erro ao buscar sessões:', err);
        res.status(500).json({ erro: 'Erro ao buscar sessões.' });
    }
});

// Criar sessão (com nucleo_id)
app.post('/cronicas/:cronicaId/sessoes', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { titulo, data_sessao, resumo, status, nucleo_id, entidades, eventos, automacoes, desfechos } = req.body;
    if (!titulo || titulo.trim() === '') return res.status(400).json({ erro: 'Título obrigatório.' });
    try {
        const nova = await pool.query(
            `INSERT INTO sessoes (cronica_id, titulo, data_sessao, resumo, status, nucleo_id, entidades, eventos, automacoes, desfechos)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb) RETURNING id`,
            [
                cronicaId,
                titulo.trim(),
                data_sessao || null,
                resumo || null,
                status || 'planejada',
                nucleo_id || null,
                JSON.stringify(entidades || []),
                JSON.stringify(eventos || []),
                JSON.stringify(automacoes || []),
                JSON.stringify(desfechos || [])
            ]
        );
        res.status(201).json({ mensagem: 'Sessão criada.', id: nova.rows[0].id });
    } catch (err) {
        console.error('Erro ao criar sessão:', err);
        res.status(500).json({ erro: 'Erro ao criar sessão.' });
    }
});

// Editar sessão (com nucleo_id)
app.put('/cronicas/:cronicaId/sessoes/:sessaoId', verificarToken, async (req, res) => {
    const { sessaoId } = req.params;
    const { titulo, data_sessao, resumo, status, nucleo_id, entidades, eventos, automacoes, desfechos } = req.body;
    if (!titulo || titulo.trim() === '') return res.status(400).json({ erro: 'Título é obrigatório.' });
    try {
        const result = await pool.query(
            `UPDATE sessoes
             SET titulo = $1, data_sessao = $2, resumo = $3, status = $4, nucleo_id = $5,
                 entidades = $6::jsonb, eventos = $7::jsonb, automacoes = $8::jsonb, desfechos = $9::jsonb
             WHERE id = $10
             RETURNING *`,
            [
                titulo.trim(),
                data_sessao || null,
                resumo || null,
                status || 'planejada',
                nucleo_id || null,
                JSON.stringify(entidades || []),
                JSON.stringify(eventos || []),
                JSON.stringify(automacoes || []),
                JSON.stringify(desfechos || []),
                sessaoId
            ]
        );
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Sessão não encontrada.' });
        res.json({ mensagem: 'Sessão atualizada.', sessao: result.rows[0] });
    } catch (err) {
        console.error('Erro ao atualizar sessão:', err);
        res.status(500).json({ erro: 'Erro ao atualizar sessão.', detalhe: err.message });
    }
});

// Excluir sessão
app.delete('/cronicas/:cronicaId/sessoes/:sessaoId', verificarToken, async (req, res) => {
    const { sessaoId } = req.params;
    try {
        await pool.query('DELETE FROM sessoes WHERE id=$1', [sessaoId]);
        res.json({ mensagem: 'Sessão excluída.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao excluir sessão.' }); }
});

// ============ NÚCLEOS DE SESSÕES ============
// Listar núcleos de sessões
app.get('/cronicas/:cronicaId/sessao-nucleos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(
            "SELECT id, nome FROM entidade_nucleos WHERE cronica_id = $1 AND tipo = 'sessao' ORDER BY nome ASC",
            [cronicaId]
        );
        res.json(query.rows);
    } catch (err) { res.status(500).json({ erro: 'Erro ao buscar núcleos de sessão.' }); }
});

// NOVO: Criar núcleo de sessão
app.post('/cronicas/:cronicaId/sessao-nucleos', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    const { nome } = req.body;
    if (!nome || nome.trim() === '') return res.status(400).json({ erro: 'Nome obrigatório.' });
    try {
        const novo = await pool.query(
            "INSERT INTO entidade_nucleos (cronica_id, nome, tipo) VALUES ($1, $2, 'sessao') RETURNING *",
            [cronicaId, nome.trim()]
        );
        res.status(201).json(novo.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Já existe um núcleo com este nome para este tipo.' });
        res.status(500).json({ erro: 'Erro ao criar núcleo.' });
    }
});

// Renomear núcleo de sessão
app.put('/cronicas/:cronicaId/sessao-nucleos/:nucleoId', verificarToken, async (req, res) => {
    const { nucleoId } = req.params;
    const { nome } = req.body;
    if (!nome || nome.trim() === '') return res.status(400).json({ erro: 'Nome obrigatório.' });
    try {
        const result = await pool.query(
            'UPDATE entidade_nucleos SET nome = $1 WHERE id = $2 RETURNING *',
            [nome.trim(), nucleoId]
        );
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Já existe um núcleo com este nome para este tipo.' });
        res.status(500).json({ erro: 'Erro ao renomear núcleo.' });
    }
});

// Excluir núcleo de sessão
app.delete('/cronicas/:cronicaId/sessao-nucleos/:nucleoId', verificarToken, async (req, res) => {
    const { nucleoId } = req.params;
    try {
        const result = await pool.query('DELETE FROM entidade_nucleos WHERE id = $1 RETURNING id', [nucleoId]);
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Núcleo não encontrado.' });
        res.json({ mensagem: 'Núcleo excluído.' });
    } catch (err) { res.status(500).json({ erro: 'Erro ao excluir núcleo.' }); }
});

// Listar crônicas onde o jogador está registrado
app.get('/cronicas/jogador', verificarToken, async (req, res) => {
    const usuarioId = req.usuario.id;
    try {
        const query = await pool.query(`
            SELECT c.id, c.nome, c.sistema
            FROM cronicas c
            JOIN cronica_jogadores cj ON c.id = cj.cronica_id
            WHERE cj.usuario_id = $1
            ORDER BY c.nome ASC
        `, [usuarioId]);
        res.json(query.rows);
    } catch (err) {
        console.error('Erro ao buscar crônicas do jogador:', err);
        res.status(500).json({ erro: 'Erro ao buscar crônicas.' });
    }
});

// Listar personagens vinculados a uma crônica (para o Escudo do Narrador)
app.get('/cronicas/:cronicaId/personagens', verificarToken, async (req, res) => {
    const { cronicaId } = req.params;
    try {
        const query = await pool.query(`
            SELECT p.id, p.nome, p.arete, p.dados_ficha
            FROM personagens p
            WHERE p.cronica_id = $1
            ORDER BY p.nome ASC
        `, [cronicaId]);
        res.json(query.rows);
    } catch (err) {
        console.error('Erro ao buscar personagens:', err);
        res.status(500).json({ erro: 'Erro ao buscar personagens.' });
    }
});

app.use('/auth', authRoutes);
app.use('/personagens', personagensRoutes);
app.use('/cronicas', cronicasRoutes);
app.use('/perfil', perfilRoutes);

app.listen(PORTA, () => console.log(`🚀 Servidor rodando em http://localhost:${PORTA}`));