const express = require('express');
const router = express.Router({ mergeParams: true });
const EscudoController = require('../controllers/escudoController');
const verificarToken = require('../middlewares/auth');
const { checarAcessoCronica } = require('../middlewares/permissoes');
const validate = require('../middlewares/validate');

// Importamos TODOS os esquemas de validação blindados
const { 
    criarCardMonstroSchema, 
    atualizarCardMonstroSchema, 
    salvarLayoutSchema,
    salvarSnapshotSchema // <-- NOVO: O schema do Snapshot completo
} = require('../validators/escudoValidator');

const apenasNarrador = (req, res, next) => {
    if (req.acesso !== 'narrador') {
        return res.status(403).json({ erro: 'Acesso negado: O Escudo é de uso exclusivo do Narrador.' });
    }
    next();
};

// ==========================================
// ROTAS DE SAVES (Combate, Cenas e Layout)
// ==========================================
router.get('/escudo-saves', verificarToken, checarAcessoCronica, apenasNarrador, EscudoController.listarSaves);

// Aplicamos a blindagem Zod no momento de guardar o Snapshot
router.post('/escudo-saves', verificarToken, checarAcessoCronica, apenasNarrador, validate(salvarSnapshotSchema), EscudoController.salvarEscudo);

router.get('/escudo-saves/:saveId', verificarToken, checarAcessoCronica, apenasNarrador, EscudoController.carregarSave);
router.post('/escudo-saves/:saveId/restaurar', verificarToken, checarAcessoCronica, apenasNarrador, EscudoController.restaurarSave);
router.delete('/escudo-saves/:saveId', verificarToken, checarAcessoCronica, apenasNarrador, EscudoController.deletarSave);

// ==========================================
// ROTAS DO GRID DE MONSTROS
// ==========================================
router.get('/monstros', verificarToken, checarAcessoCronica, apenasNarrador, EscudoController.listarCardsMonstros);
router.post('/monstros', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarCardMonstroSchema), EscudoController.criarCardMonstro);
router.put('/monstros/:cardId', verificarToken, checarAcessoCronica, apenasNarrador, validate(atualizarCardMonstroSchema), EscudoController.atualizarCardMonstro);
router.delete('/monstros/:cardId', verificarToken, checarAcessoCronica, apenasNarrador, EscudoController.deletarCardMonstro);

// ==========================================
// ROTAS DO LAYOUT (Auto-save da tela)
// ==========================================
router.get('/sistema', verificarToken, checarAcessoCronica, EscudoController.obterSistemaCronica);
router.get('/layout', verificarToken, checarAcessoCronica, EscudoController.obterLayoutEscudo);
router.put('/layout', verificarToken, checarAcessoCronica, apenasNarrador, validate(salvarLayoutSchema), EscudoController.salvarLayoutEscudo);

module.exports = router;