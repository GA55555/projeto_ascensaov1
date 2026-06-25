const express = require('express');
const router = express.Router({ mergeParams: true });
const MundoController = require('../controllers/mundoController');
const verificarToken = require('../middlewares/auth');
const automacaoController = require('../controllers/automacaoController');
const sessaoController = require('../controllers/sessaoController');
const validate = require('../middlewares/validate');
const { checarAcessoCronica } = require('../middlewares/permissoes');
const {
    criarAutomacaoSchema, toggleStatusSchema,
    criarNodeSchema, editarNodeSchema,
    criarFlagSchema, atualizarFlagSchema, renomearFlagSchema,
    criarNucleoSchema, renomearNucleoSchema,
    criarEventoSchema, criarVinculoSchema,
    criarSessaoSchema, editarSessaoSchema,
    atualizarNucleoNodeSchema,
    listarLinksSchema, criarLinkSchema, deletarLinkSchema, atualizarLinkSchema,
    criarBoardSchema, atualizarBoardSchema, boardIdParamsSchema,
    salvarDiplomaciaSchema,
    sincronizarOraculoSchema
} = require('../validators/mundoValidator');

// Middleware apenas narrador
const apenasNarrador = (req, res, next) => {
    if (req.acesso !== 'narrador') {
        return res.status(403).json({ erro: 'Acesso negado: Apenas o Narrador pode forjar e alterar o Mundo.' });
    }
    next();
};

// ==========================================
// SESSÕES
// ==========================================
router.get('/sessoes', verificarToken, checarAcessoCronica, sessaoController.listarSessoes);
router.get('/sessao-nucleos', verificarToken, checarAcessoCronica, MundoController.listarNucleosSessao);
router.post('/sessoes', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarSessaoSchema), sessaoController.criarSessao);
router.put('/sessoes/:id', verificarToken, checarAcessoCronica, apenasNarrador, validate(editarSessaoSchema), sessaoController.editarSessao);
router.delete('/sessoes/:id', verificarToken, checarAcessoCronica, apenasNarrador, sessaoController.deletarSessao);

// ==========================================
// AUTOMAÇÕES
// ==========================================
router.get('/automacoes', verificarToken, checarAcessoCronica, automacaoController.listarAutomacoes);
router.post('/automacoes', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarAutomacaoSchema), automacaoController.criarAutomacao);
router.delete('/automacoes/:id', verificarToken, checarAcessoCronica, apenasNarrador, automacaoController.deletarAutomacao);
router.put('/automacoes/:id/status', verificarToken, checarAcessoCronica, apenasNarrador, validate(toggleStatusSchema), automacaoController.toggleStatusAutomacao);

// ==========================================
// ENTIDADES (NODES)
// ==========================================
router.get('/nodes', verificarToken, checarAcessoCronica, MundoController.listarNodes);
router.post('/nodes', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarNodeSchema), MundoController.criarNode);
router.put('/nodes/:nodeId', verificarToken, checarAcessoCronica, apenasNarrador, validate(editarNodeSchema), MundoController.editarNode);
router.delete('/nodes/:nodeId', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.deletarNode);
router.put('/nodes/:nodeId/nucleo', verificarToken, checarAcessoCronica, apenasNarrador, validate(atualizarNucleoNodeSchema), MundoController.atualizarNucleoNode);

// Sinapses (links bidirecionais entre entidades) — world_links. Params validados (Regra 4.3).
// Cronica-level: todos os links da crônica numa só query (otimização do Tabuleiro — evita N+1).
router.get('/links', verificarToken, checarAcessoCronica, MundoController.listarLinksCronica);
router.get('/nodes/:nodeId/links', verificarToken, checarAcessoCronica, validate(listarLinksSchema), MundoController.listarLinks);
router.post('/nodes/:nodeId/links', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarLinkSchema), MundoController.criarLink);
router.delete('/nodes/:nodeId/links/:linkId', verificarToken, checarAcessoCronica, apenasNarrador, validate(deletarLinkSchema), MundoController.deletarLink);
router.put('/nodes/:nodeId/links/:linkId', verificarToken, checarAcessoCronica, apenasNarrador, validate(atualizarLinkSchema), MundoController.atualizarLink);

// Núcleos de Entidades
router.get('/entidade-nucleos', verificarToken, checarAcessoCronica, MundoController.listarNucleosEntidade);
router.post('/entidade-nucleos', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarNucleoSchema), MundoController.criarNucleoEntidade);
router.put('/entidade-nucleos/:nucleoId', verificarToken, checarAcessoCronica, apenasNarrador, validate(renomearNucleoSchema), MundoController.renomearNucleoEntidade);
router.delete('/entidade-nucleos/:nucleoId', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.excluirNucleoEntidade);

// ==========================================
// FLAGS
// ==========================================
router.post('/nodes/:nodeId/flags', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarFlagSchema), MundoController.criarFlag);
router.put('/nodes/:nodeId/flags', verificarToken, checarAcessoCronica, apenasNarrador, validate(atualizarFlagSchema), MundoController.atualizarFlag);
router.put('/nodes/:nodeId/flags/:flagKey', verificarToken, checarAcessoCronica, apenasNarrador, validate(renomearFlagSchema), MundoController.renomearFlag);
router.delete('/nodes/:nodeId/flags/:flagKey', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.deletarFlag);

// ==========================================
// EVENTOS
// ==========================================
router.get('/eventos', verificarToken, checarAcessoCronica, MundoController.listarEventos);
router.post('/eventos', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarEventoSchema), MundoController.criarEvento);
router.delete('/eventos/:eventoId', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.deletarEvento);

// Núcleos de Eventos
router.get('/evento-nucleos', verificarToken, checarAcessoCronica, MundoController.listarNucleosEventos);
router.post('/evento-nucleos', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarNucleoSchema), MundoController.criarNucleoEventos);
router.put('/evento-nucleos/:nucleoId', verificarToken, checarAcessoCronica, apenasNarrador, validate(renomearNucleoSchema), MundoController.renomearNucleoEventos);
router.delete('/evento-nucleos/:nucleoId', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.excluirNucleoEventos);
router.post('/eventos/:eventoId/nucleos', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.vincularEventoNucleo);
router.delete('/eventos/:eventoId/nucleos/:nucleoId', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.desvincularEventoNucleo);

// ==========================================
// VÍNCULOS (PESOS/GATILHOS)
// ==========================================
router.post('/eventos/:eventoId/pesos', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarVinculoSchema), MundoController.criarVinculo);
router.delete('/eventos/:eventoId/pesos', verificarToken, checarAcessoCronica, apenasNarrador, MundoController.deletarVinculo);

// ==========================================
// TABULEIROS DE CAMPANHA (FASE 13) — world_boards
// ==========================================
router.get('/boards', verificarToken, checarAcessoCronica, MundoController.listarBoards);
router.get('/boards/:boardId', verificarToken, checarAcessoCronica, validate(boardIdParamsSchema), MundoController.buscarBoard);
router.post('/boards', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarBoardSchema), MundoController.criarBoard);
router.put('/boards/:boardId', verificarToken, checarAcessoCronica, apenasNarrador, validate(atualizarBoardSchema), MundoController.atualizarBoard);
router.delete('/boards/:boardId', verificarToken, checarAcessoCronica, apenasNarrador, validate(boardIdParamsSchema), MundoController.deletarBoard);

// ============================================
// DIPLOMACIA (FASE 14) — nucleo_diplomacia (relações núcleo↔núcleo, global por crônica)
// ============================================
router.get('/diplomacia', verificarToken, checarAcessoCronica, MundoController.listarDiplomacia);
router.put('/diplomacia', verificarToken, checarAcessoCronica, apenasNarrador, validate(salvarDiplomaciaSchema), MundoController.salvarDiplomacia);

// ==========================================
// ORÁCULO (RAG) — Fatia 3: Big Bang (sincronização inicial)
// Só o Narrador da crônica popula o banco vetorial com o mundo já existente. Idempotente.
// ==========================================
router.post('/oraculo/sincronizar', verificarToken, checarAcessoCronica, apenasNarrador, validate(sincronizarOraculoSchema), MundoController.sincronizarOraculo);

module.exports = router;