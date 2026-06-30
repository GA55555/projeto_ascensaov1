const express = require('express');
const router = express.Router({ mergeParams: true });
const ComunidadeController = require('../controllers/comunidadeController');
const verificarToken = require('../middlewares/auth');

// Importamos o middleware
const { checarAcessoCronica } = require('../middlewares/permissoes');
const validate = require('../middlewares/validate');
const { criarPostSchema, conteudoSchema, votarSchema } = require('../validators/comunidadeValidators');

// Posts e Abas (Blindados!)
router.get('/abas/:abaId/posts', verificarToken, checarAcessoCronica, ComunidadeController.listarPosts);
router.post('/abas/:abaId/posts', verificarToken, checarAcessoCronica, validate(criarPostSchema), ComunidadeController.criarPost);
router.put('/abas/:abaId/posts/:postId', verificarToken, checarAcessoCronica, validate(conteudoSchema), ComunidadeController.editarPost);
router.delete('/abas/:abaId/posts/:postId', verificarToken, checarAcessoCronica, ComunidadeController.deletarPost);
router.delete('/abas/:abaId', verificarToken, checarAcessoCronica, ComunidadeController.deletarAba);

// Comentários (Blindados!)
router.get('/posts/:postId/comentarios', verificarToken, checarAcessoCronica, ComunidadeController.listarComentarios);
router.post('/posts/:postId/comentarios', verificarToken, checarAcessoCronica, validate(conteudoSchema), ComunidadeController.criarComentario);
router.put('/posts/:postId/comentarios/:comentarioId', verificarToken, checarAcessoCronica, validate(conteudoSchema), ComunidadeController.editarComentario);
router.delete('/posts/:postId/comentarios/:comentarioId', verificarToken, checarAcessoCronica, ComunidadeController.deletarComentario);

// Votações (Blindado!)
router.post('/posts/:postId/votar', verificarToken, checarAcessoCronica, validate(votarSchema), ComunidadeController.votarOpcao);

module.exports = router;