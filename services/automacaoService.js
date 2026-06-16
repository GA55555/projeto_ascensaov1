// services/automacaoService.js

const pool = require('../db');

// =======================================================
// MOTOR DE AÇÕES (SUA LÓGICA ORIGINAL)
// =======================================================
const MotorAutomacao = {
    'criar_flag': async (parametros, cronicaId) => {
        const { node_id, flag_key, valor_inicial } = parametros;
        if (!node_id || !flag_key) throw new Error(`Parâmetros inválidos para criar flag.`);

        const keyFormatada = flag_key.trim().toLowerCase().replace(/\s+/g, '_');

        await pool.query(`
            INSERT INTO world_flags (node_id, flag_key, flag_value)
            VALUES ($1, $2, $3)
            ON CONFLICT (node_id, flag_key) DO NOTHING;
        `, [node_id, keyFormatada, valor_inicial]);
        
        return `Nova flag '${keyFormatada}' forjada na entidade.`;
    },

    'alterar_flag': async (parametros, cronicaId) => {
        const { node_id, flag_key, novo_valor } = parametros;
        if (!node_id || !flag_key) throw new Error(`Parâmetros inválidos para alterar flag.`);

        const keyFormatada = flag_key.trim().toLowerCase().replace(/\s+/g, '_');

        await pool.query(`
            UPDATE world_flags
            SET flag_value = $1, atualizado_em = NOW()
            WHERE node_id = $2 AND flag_key = $3;
        `, [novo_valor, node_id, keyFormatada]);
        
        return `Flag '${keyFormatada}' alterada para ${novo_valor}.`;
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
            INSERT INTO world_events (cronica_id, nome, descricao, pool_maxima, pool_atual, status) 
            VALUES ($1, $2, $3, $4, 0, 'monitorando')
        `, [cronicaId, nome, descricao || '', pool_maxima || 10]);
        return `Evento ${nome} gerado.`;
    },  // ← VÍRGULA AQUI (agora sim!)

    'criar_entidade': async (parametros, cronicaId) => {
        const { nome, tipo, nucleo_id, flags } = parametros;
        if (!nome) throw new Error('Nome da entidade é obrigatório para a automação.');
        if (!tipo) throw new Error('Tipo da entidade é obrigatório para a automação.');

        const nodeResult = await pool.query(`
            INSERT INTO world_nodes (cronica_id, nome, tipo, nucleo_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `, [cronicaId, nome, tipo, nucleo_id || null]);
        
        const nodeId = nodeResult.rows[0].id;

        if (flags && Array.isArray(flags) && flags.length > 0) {
            const flagPromises = flags.map(f => {
                const keyFormatada = f.key.trim().toLowerCase().replace(/\s+/g, '_');
                return pool.query(`
                    INSERT INTO world_flags (node_id, flag_key, flag_value)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (node_id, flag_key) DO NOTHING
                `, [nodeId, keyFormatada, f.value]);
            });
            await Promise.all(flagPromises);
        }

        return `Entidade '${nome}' forjada automaticamente com ${flags ? flags.length : 0} flag(s).`;
    },
};

// =======================================================
// EXECUÇÃO REAL DAS AUTOMAÇÕES (SUA LÓGICA ORIGINAL)
// =======================================================
async function dispararAutomacoesDoEvento(eventId, cronicaId) {
    try {
        const automacoes = await pool.query(`
            SELECT id, effect_json 
            FROM world_triggers 
            WHERE (condition_json->>'evento_id')::uuid = $1 AND ativo = TRUE
        `, [eventId]);

        for (let auto of automacoes.rows) {
            const tipo = auto.effect_json.tipo_nome;
            const params = auto.effect_json.parametros;

            try {
                if (MotorAutomacao[tipo]) {
                    const detalhes = await MotorAutomacao[tipo](params, cronicaId);
                    await pool.query(`INSERT INTO automacao_log (automacao_id, evento_id, status, detalhes) VALUES ($1, $2, 'sucesso', $3)`, [auto.id, eventId, detalhes]);
                }
            } catch (erroAcao) {
                await pool.query(`INSERT INTO automacao_log (automacao_id, evento_id, status, detalhes) VALUES ($1, $2, 'erro', $3)`, [auto.id, eventId, erroAcao.message]);
            }
        }
        // Desativa as automações depois de executar
        await pool.query(`UPDATE world_triggers SET ativo = FALSE WHERE (condition_json->>'evento_id')::uuid = $1`, [eventId]);
    } catch (err) {
        console.error("Falha fatal no Motor de Automações:", err);
    }
}

// =======================================================
// FILA DE PROCESSAMENTO (NOVO - ASSÍNCRONO)
// =======================================================
const filaDeTarefas = [];
let processando = false;

function agendarDisparo(eventId, cronicaId) {
    filaDeTarefas.push({ eventId, cronicaId });
    console.log(`📋 Tarefa agendada para evento ${eventId}. Fila: ${filaDeTarefas.length} item(ns).`);

    if (!processando) {
        processarFila();
    }
}

async function processarFila() {
    if (processando || filaDeTarefas.length === 0) return;
    processando = true;

    while (filaDeTarefas.length > 0) {
        const tarefa = filaDeTarefas.shift();
        try {
            console.log(`⚙️  Executando automações do evento ${tarefa.eventId}...`);
            await dispararAutomacoesDoEvento(tarefa.eventId, tarefa.cronicaId);
        } catch (erro) {
            console.error(`❌ Erro no evento ${tarefa.eventId}:`, erro.message);
        }

        // respiro para outras requisições
        await new Promise(resolve => setImmediate(resolve));
    }

    processando = false;
    console.log('✅ Fila de automações concluída.');
}

// =======================================================
// EXPORTA APENAS O AGENDADOR
// =======================================================
module.exports = {
    agendarDisparo
};