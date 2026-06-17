const express = require('express');
const router = express.Router();
const GavetaController = require('../controllers/gavetaController');
const verificarToken = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { criarFichaSchema, atualizarFichaSchema, deletarFichaSchema } = require('../validators/gavetaValidators');

router.get('/fichas',             verificarToken,                                                   GavetaController.listarFichas);
router.post('/fichas',            verificarToken, validate(criarFichaSchema),                       GavetaController.criarFicha);
router.put('/fichas/:fichaId',    verificarToken, validate(atualizarFichaSchema),                   GavetaController.atualizarFicha);
router.delete('/fichas/:fichaId', verificarToken, validate(deletarFichaSchema),                    GavetaController.deletarFicha);

module.exports = router;
