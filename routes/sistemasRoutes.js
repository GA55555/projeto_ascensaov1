const express = require('express');
const router = express.Router();
const SistemasController = require('../controllers/sistemasController');

router.get('/', SistemasController.listarSistemas);

module.exports = router;