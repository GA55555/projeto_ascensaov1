const express = require('express');
const router = express.Router({ mergeParams: true });
const CenasController = require('../controllers/cenasController');
const verificarToken = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { checarAcessoCronica } = require('../middlewares/permissoes');
const {
    criarCenaSchema, atualizarCenaSchema, cenaIdParamsSchema
} = require('../validators/cenasValidator');

// Middleware apenas narrador (espelha o padrão de mundoRoutes).
const apenasNarrador = (req, res, next) => {
    if (req.acesso !== 'narrador') {
        return res.status(403).json({ erro: 'Acesso negado: Apenas o Narrador pode dirigir cenas.' });
    }
    next();
};

// ── DIREÇÃO DE CENA (FASE 17) — world_cenas (montado em /cronicas/:cronicaId) ──
router.get('/cenas', verificarToken, checarAcessoCronica, CenasController.listarCenas);
router.get('/cenas/:cenaId', verificarToken, checarAcessoCronica, validate(cenaIdParamsSchema), CenasController.buscarCena);
router.post('/cenas', verificarToken, checarAcessoCronica, apenasNarrador, validate(criarCenaSchema), CenasController.criarCena);
router.put('/cenas/:cenaId', verificarToken, checarAcessoCronica, apenasNarrador, validate(atualizarCenaSchema), CenasController.atualizarCena);
router.delete('/cenas/:cenaId', verificarToken, checarAcessoCronica, apenasNarrador, validate(cenaIdParamsSchema), CenasController.deletarCena);

module.exports = router;
