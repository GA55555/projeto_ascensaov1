const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const verificarToken = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { registroSchema, loginSchema } = require('../validators/authValidators');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { erro: 'Muitas tentativas de login. Conta bloqueada temporariamente. Tente novamente em 15 minutos.' }
});

router.get('/dashboard-resumo', verificarToken, AuthController.dashboardResumo);

router.post('/registro', validate(registroSchema), AuthController.registrar);
router.post('/login', loginLimiter, validate(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);

module.exports = router;
