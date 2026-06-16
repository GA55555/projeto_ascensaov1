const asyncHandler = require('../utils/asyncHandler');
const pool = require('../db');

// ==========================================
// GERENCIAMENTO DE CARDS DE MONSTROS
// ==========================================

// Listar todos os monstros de uma crônica específica
exports.listarCardsMonstros = asyncHandler(async (req, res) => {
    const { cronicaId } = req.params;
    
    const result = await pool.query(
        "SELECT * FROM escudo_cards_monstros WHERE cronica_id = $1 ORDER BY iniciativa DESC, criado_em ASC",
        [cronicaId]
    );
    
    res.json(result.rows);
});

// Criar um novo card de monstro
exports.criarCardMonstro = asyncHandler(async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, hp_max, imagem_url } = req.body;
    
    const result = await pool.query(
        "INSERT INTO escudo_cards_monstros (cronica_id, nome, hp_max, hp_atual, imagem_url) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [cronicaId, nome, hp_max, hp_max, imagem_url]
    );
    
    res.status(201).json(result.rows[0]);
});

// Atualizar dados do card (HP atual, HP máximo, Iniciativa ou Nome)
exports.atualizarCardMonstro = asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    const { nome, hp_max, hp_atual, iniciativa } = req.body;
    
    const campos = [];
    const valores = [];
    let idx = 1;

    if (nome !== undefined) { campos.push(`nome = $${idx++}`); valores.push(nome); }
    if (hp_max !== undefined) { campos.push(`hp_max = $${idx++}`); valores.push(hp_max); }
    if (hp_atual !== undefined) { campos.push(`hp_atual = $${idx++}`); valores.push(hp_atual); }
    if (iniciativa !== undefined) { campos.push(`iniciativa = $${idx++}`); valores.push(iniciativa); }

    if (campos.length === 0) {
        return res.status(400).json({ erro: "Nenhum campo para atualizar informado." });
    }

    valores.push(cardId);
    const query = `UPDATE escudo_cards_monstros SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`;
    
    const result = await pool.query(query, valores);
    
    if (result.rowCount === 0) {
        return res.status(404).json({ erro: "Card de monstro não encontrado." });
    }
    
    res.json(result.rows[0]);
});

// Excluir card de monstro
exports.deletarCardMonstro = asyncHandler(async (req, res) => {
    const { cardId } = req.params;
    
    const result = await pool.query("DELETE FROM escudo_cards_monstros WHERE id = $1", [cardId]);
    
    if (result.rowCount === 0) {
        return res.status(404).json({ erro: "Card de monstro não encontrado." });
    }
    
    res.json({ mensagem: "Card de monstro banido do combate com sucesso!" });
});


// ==========================================
// PERSISTÊNCIA DIRETA DO LAYOUT MODULAR
// ==========================================

// Buscar o layout salvo da crônica
exports.obterLayoutEscudo = asyncHandler(async (req, res) => {
    const { cronicaId } = req.params;

    const result = await pool.query(
        "SELECT layout_escudo FROM public.cronicas WHERE id = $1",
        [cronicaId]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ erro: "Crônica não encontrada." });
    }

    res.json(result.rows[0].layout_escudo || []);
});

// Persistir o novo layout rearranjado pelo narrador
exports.salvarLayoutEscudo = asyncHandler(async (req, res) => {
    const { cronicaId } = req.params;
    const { layout, resumo_html, cena_html } = req.body;

    // Recupera o estado atual para não sobrescrever os HTMLs caso o frontend envie apenas a geometria
    const currentResult = await pool.query("SELECT layout_escudo FROM public.cronicas WHERE id = $1", [cronicaId]);
    if (currentResult.rowCount === 0) return res.status(404).json({ erro: "Crônica não encontrada." });

    const currentData = currentResult.rows[0].layout_escudo || {};

    const layoutPayload = {
        layout: layout || currentData.layout || [],
        resumo_html: resumo_html !== undefined ? resumo_html : (currentData.resumo_html || ''),
        cena_html: cena_html !== undefined ? cena_html : (currentData.cena_html || '')
    };

    const result = await pool.query(
        "UPDATE public.cronicas SET layout_escudo = $1 WHERE id = $2 RETURNING layout_escudo",
        [JSON.stringify(layoutPayload), cronicaId]
    );

    res.json({ mensagem: "Layout do Escudo memorizado na Trama!", layout: result.rows[0].layout_escudo });
});


// ==========================================
// SISTEMA DE MEMÓRIAS/SAVES COMPLETOS (Layout + Dados + Monstros)
// ==========================================

// 1. Listar todos os saves de uma crônica
exports.listarSaves = asyncHandler(async (req, res) => {
    const { cronicaId } = req.params;
    
    const result = await pool.query(
        "SELECT id, nome, criado_em FROM escudo_saves WHERE cronica_id = $1 ORDER BY criado_em DESC",
        [cronicaId]
    );
    
    res.json(result.rows);
});

// 2. Salvar um novo estado completo do escudo
exports.salvarEscudo = asyncHandler(async (req, res) => {
    const { cronicaId } = req.params;
    const { nome, iniciativa, turno_atual, cena_html, resumo_html, layout, monstros } = req.body;

    const dadosSave = {
        iniciativa: iniciativa || [],
        turno_atual: turno_atual || 0,
        cena_html: cena_html || '',
        resumo_html: resumo_html || '',
        layout: layout || [],
        monstros: monstros || []
    };

    const result = await pool.query(
        "INSERT INTO escudo_saves (cronica_id, nome, dados) VALUES ($1, $2, $3) RETURNING id, nome, criado_em",
        [cronicaId, nome, JSON.stringify(dadosSave)]
    );

    res.status(201).json(result.rows[0]);
});

// 3. Carregar um save específico
exports.carregarSave = asyncHandler(async (req, res) => {
    const { saveId } = req.params;
    
    const result = await pool.query(
        "SELECT * FROM escudo_saves WHERE id = $1",
        [saveId]
    );
    
    if (result.rowCount === 0) {
        return res.status(404).json({ erro: "Memória não encontrada." });
    }
    
    res.json(result.rows[0]);
});

// 4. RESTAURAÇÃO ATÔMICA (Com Client dedicado para impedir vazamento de pool)
exports.restaurarSave = asyncHandler(async (req, res) => {
    const { cronicaId, saveId } = req.params;
    const saveResult = await pool.query("SELECT * FROM escudo_saves WHERE id = $1 AND cronica_id = $2", [saveId, cronicaId]);
    
    if (saveResult.rowCount === 0) return res.status(404).json({ erro: "Memória não encontrada." });
    const dados = saveResult.rows[0].dados || {};

    // 1. Conecta um client exclusivo para isolar a transação
    const client = await pool.connect(); 

    try {
        await client.query("BEGIN"); 
        
        const layoutPayload = { layout: dados.layout || [], resumo_html: dados.resumo_html || '', cena_html: dados.cena_html || '' };
        await client.query("UPDATE cronicas SET layout_escudo = $1 WHERE id = $2", [JSON.stringify(layoutPayload), cronicaId]);

        // Este DELETE agora vai funcionar com 100% de certeza!
        await client.query("DELETE FROM escudo_cards_monstros WHERE cronica_id = $1", [cronicaId]);

        if (dados.monstros && Array.isArray(dados.monstros)) {
            for (const m of dados.monstros) {
                if (m.id) {
                    await client.query(
                        `INSERT INTO escudo_cards_monstros (id, cronica_id, nome, hp_max, hp_atual, iniciativa, imagem_url)
                         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
                        [m.id, cronicaId, m.nome || 'Desconhecido', m.hp_max || 10, m.hp_atual || 10, m.iniciativa || 0, m.imagem_url || '']
                    );
                } else {
                    await client.query(
                        `INSERT INTO escudo_cards_monstros (cronica_id, nome, hp_max, hp_atual, iniciativa, imagem_url)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [cronicaId, m.nome || 'Desconhecido', m.hp_max || 10, m.hp_atual || 10, m.iniciativa || 0, m.imagem_url || '']
                    );
                }
            }
        }
        await client.query("COMMIT");

        // 2. Transação terminada. Podemos usar o pool normal para ler.
        const monstrosAtuais = await pool.query(
            "SELECT * FROM escudo_cards_monstros WHERE cronica_id = $1 ORDER BY iniciativa DESC", [cronicaId]
        );

        res.json({ 
            mensagem: "Restaurado com sucesso!", 
            dados: {
                layout: dados.layout || [],
                resumo_html: dados.resumo_html || '',
                cena_html: dados.cena_html || '',
                monstros: monstrosAtuais.rows
            } 
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("Erro na transação de restauração:", err);
        throw err;
    } finally {
        client.release(); // 3. Devolve a conexão ao pool!
    }
});

// 5. Deletar um save permanentemente
exports.deletarSave = asyncHandler(async (req, res) => {
    const { saveId } = req.params;
    
    const result = await pool.query(
        "DELETE FROM escudo_saves WHERE id = $1 RETURNING id",
        [saveId]
    );
    
    if (result.rowCount === 0) {
        return res.status(404).json({ erro: "Memória não encontrada." });
    }
    
    res.json({ mensagem: "Memória apagada com sucesso." });
});