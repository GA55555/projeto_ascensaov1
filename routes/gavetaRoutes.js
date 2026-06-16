const express = require('express');
const router = express.Router();
const GavetaController = require('../controllers/gavetaController');
const verificarToken = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { uploadPdf } = require('../config/upload');
const { uploadFichaSchema, deletarFichaSchema } = require('../validators/gavetaValidators');

router.get('/fichas',             verificarToken,                                                   GavetaController.listarFichas);
router.post('/fichas',            verificarToken, uploadPdf.single('ficha'), validate(uploadFichaSchema), GavetaController.uploadFicha);
router.delete('/fichas/:fichaId', verificarToken, validate(deletarFichaSchema),                    GavetaController.deletarFicha);

module.exports = router;
