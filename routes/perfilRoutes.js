const express = require('express');
const router = express.Router();
const pool = require('../db');
const verificarToken = require('../middlewares/auth');
const bcrypt = require('bcrypt');
const validate = require('../middlewares/validate');
const { salvarOraculoConfigSchema } = require('../validators/perfilValidators');
const oraculoCripto = require('../utils/oraculoCripto');

// Buscar perfil completo
// Devolve o usuário e as crônicas com os respectivos apelidos e avatares
router.get('/', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        
        // Busca os dados básicos do utilizador principal.
        // Oráculo (BYOK): expõe URL/modelo e APENAS um booleano de "chave definida" — a chave
        // cifrada NUNCA é devolvida ao frontend (write-only, oraculo.md §4.4 / Regra 6).
        const user = await pool.query(
            `SELECT nome_usuario, email, avatar_url, tema_interface,
                    oraculo_gen_url, oraculo_gen_model,
                    (oraculo_gen_key IS NOT NULL) AS oraculo_tem_chave
               FROM usuarios WHERE id = $1`,
            [usuarioId]
        );
        
        // Busca as crónicas em que o utilizador participa e as suas identidades (apelido/avatar)
        const perfis = await pool.query(`
            SELECT 
                c.id AS cronica_id, 
                c.nome AS cronica_nome, 
                pc.apelido, 
                pc.avatar_url 
            FROM cronicas c
            JOIN cronica_jogadores jc ON c.id = jc.cronica_id
            LEFT JOIN perfis_cronica pc ON c.id = pc.cronica_id AND pc.usuario_id = $1
            WHERE jc.usuario_id = $1
        `, [usuarioId]);

        res.json({ 
            usuario: user.rows[0], 
            perfis_cronica: perfis.rows 
        });
    } catch (err) {
        console.error('Erro ao buscar o perfil completo:', err);
        res.status(500).json({ erro: "Erro interno ao buscar perfil." });
    }
});

// Atualizar nome e email
router.put('/dados', verificarToken, async (req, res) => {
    const { nome_usuario, email } = req.body;

    try {
        const result = await pool.query(
            `UPDATE usuarios SET nome_usuario = $1, email = $2 
             WHERE id = $3 RETURNING id, nome_usuario, email`,
            [nome_usuario, email, req.usuario.id]
        );
        res.json({ mensagem: 'Dados atualizados!', usuario: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'Email ou nome já em uso.' });
        res.status(500).json({ erro: 'Erro ao atualizar dados.' });
    }
});

// Alterar senha
router.put('/senha', verificarToken, async (req, res) => {
    const { senha_atual, nova_senha } = req.body;

    try {
        const usuario = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.usuario.id]);
        const senhaValida = await bcrypt.compare(senha_atual, usuario.rows[0].senha_hash);
        
        if (!senhaValida) return res.status(401).json({ erro: 'Senha atual incorreta.' });

        const salt = await bcrypt.genSalt(10);
        const novaHash = await bcrypt.hash(nova_senha, salt);

        await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [novaHash, req.usuario.id]);
        res.json({ mensagem: 'Senha alterada com sucesso!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao alterar senha.' });
    }
});

// Atualizar avatar padrão
router.put('/avatar', verificarToken, async (req, res) => {
    const { avatar_url } = req.body;

    try {
        await pool.query('UPDATE usuarios SET avatar_url = $1 WHERE id = $2', [avatar_url, req.usuario.id]);
        res.json({ mensagem: 'Avatar atualizado!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar avatar.' });
    }
});

// Atualizar tema da interface
router.put('/tema', verificarToken, async (req, res) => {
    const { tema_interface } = req.body;
    const temasPermitidos = ['padrao', 'tema-pixel-16bit', 'tema-neovim'];
    if (!tema_interface || !temasPermitidos.includes(tema_interface)) {
        return res.status(400).json({ erro: 'Tema inválido.' });
    }
    try {
        await pool.query('UPDATE usuarios SET tema_interface = $1 WHERE id = $2', [tema_interface, req.usuario.id]);
        res.json({ mensagem: 'Tema atualizado!', tema_interface });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar tema.' });
    }
});

// Salvar/atualizar perfil por crônica
router.put('/cronica/:cronicaId', verificarToken, async (req, res) => {
    try {
        const usuarioId = req.usuario.id;
        const cronicaId = req.params.cronicaId;
        const { apelido, avatar_url } = req.body;

        // Query de Upsert: Insere o registo. Se a combinação (usuario_id, cronica_id) já existir, atualiza.
        // O COALESCE garante que, se for enviado apenas o apelido, o avatar antigo não é apagado da base de dados.
        const query = `
            INSERT INTO perfis_cronica (usuario_id, cronica_id, apelido, avatar_url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (usuario_id, cronica_id) 
            DO UPDATE SET 
                apelido = EXCLUDED.apelido, 
                avatar_url = COALESCE(EXCLUDED.avatar_url, perfis_cronica.avatar_url)
            RETURNING *;
        `;
        
        const result = await pool.query(query, [usuarioId, cronicaId, apelido, avatar_url]);

        res.json({ 
            mensagem: "Identidade na crónica atualizada com sucesso!", 
            perfil: result.rows[0] 
        });
    } catch (err) {
        console.error("Erro ao atualizar o perfil da crónica:", err);
        res.status(500).json({ erro: "Erro interno do servidor ao guardar a identidade." });
    }
});

// ==========================================
// ORÁCULO (RAG) — BYOK do Narrador (F4-Node, fatia 1: gravação write-only)
// Grava a chave de GERAÇÃO do utilizador CIFRADA em repouso (AES-GCM). A chave entra mas nunca
// volta (write-only); o GET / só revela "oraculo_tem_chave". Só a consulta (próxima fatia) decifra.
// ==========================================
router.put('/oraculo', verificarToken, validate(salvarOraculoConfigSchema), async (req, res) => {
    const { gen_key, gen_url, gen_model } = req.body;
    try {
        // Só cifra quando uma chave nova é enviada; senão preserva a guardada (permite trocar só URL/modelo).
        let chaveCifrada = null;
        if (gen_key) {
            if (!oraculoCripto.criptoConfigurada()) {
                return res.status(503).json({ erro: 'Cifragem do Oráculo indisponível no servidor (ORACULO_ENC_KEY ausente).' });
            }
            chaveCifrada = oraculoCripto.cifrar(gen_key);
        }
        // COALESCE: campos ausentes não apagam o valor atual; a chave só troca quando enviada.
        const result = await pool.query(
            `UPDATE usuarios
                SET oraculo_gen_key   = COALESCE($1, oraculo_gen_key),
                    oraculo_gen_url   = COALESCE($2, oraculo_gen_url),
                    oraculo_gen_model = COALESCE($3, oraculo_gen_model)
              WHERE id = $4
              RETURNING oraculo_gen_url, oraculo_gen_model, (oraculo_gen_key IS NOT NULL) AS oraculo_tem_chave`,
            [chaveCifrada, gen_url ?? null, gen_model ?? null, req.usuario.id]
        );
        // Resposta write-only: confirma o estado SEM jamais devolver a chave.
        res.json({ mensagem: 'Configuração do Oráculo salva.', ...result.rows[0] });
    } catch (err) {
        console.error('Erro ao salvar config do Oráculo:', err);
        res.status(500).json({ erro: 'Erro ao salvar a configuração do Oráculo.' });
    }
});

module.exports = router;