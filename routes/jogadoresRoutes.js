const express = require('express');
const router = express.Router({ mergeParams: true });
const JogadoresController = require('../controllers/jogadoresController');
const verificarToken = require('../middlewares/auth');

// Importar o middleware de permissões
const { checarAcessoCronica } = require('../middlewares/permissoes');

// O guardião do Narrador
const apenasNarrador = (req, res, next) => {
    if (req.acesso !== 'narrador') {
        return res.status(403).json({ erro: 'Acesso negado: Apenas o Narrador pode gerir jogadores e permissões.' });
    }
    next();
};

// =======================================================
// BUSCA GERAL (Não depende de uma crónica específica)
// =======================================================

// Rota: /cronicas/jogador (Busca as crónicas onde o utilizador joga)
// Não usa checarAcessoCronica porque ainda não estamos dentro de uma crónica!
router.get('/jogador', verificarToken, JogadoresController.listarCronicasDoJogador);


// =======================================================
// GESTÃO DE JOGADORES (Dentro de uma crónica específica)
// =======================================================

// Todos os membros da crónica podem ver a lista de jogadores
router.get('/:cronicaId/jogadores', verificarToken, checarAcessoCronica, JogadoresController.listarJogadores);

// O jogador pode sair da crónica (Não pode ter o bloqueio "apenasNarrador")
router.delete('/:cronicaId/sair', verificarToken, checarAcessoCronica, JogadoresController.sairDaCronica);

// Apenas o Narrador pode adicionar pelo e-mail e expulsar jogadores
router.post('/:cronicaId/adicionar-jogador', verificarToken, checarAcessoCronica, apenasNarrador, JogadoresController.adicionarJogador);
router.delete('/:cronicaId/jogadores/:jogadorId', verificarToken, checarAcessoCronica, apenasNarrador, JogadoresController.removerJogador);


// =======================================================
// PERMISSÕES DE ABAS (Exclusivo do Narrador)
// =======================================================

// O Narrador tem o poder de ver quem tem acesso a quê, e de dar/tirar poder.
router.get('/:cronicaId/abas/:abaId/permissoes', verificarToken, checarAcessoCronica, apenasNarrador, JogadoresController.listarPermissoesAba);
router.put('/:cronicaId/abas/:abaId/permissoes', verificarToken, checarAcessoCronica, apenasNarrador, JogadoresController.concederPermissaoAba);
router.delete('/:cronicaId/abas/:abaId/permissoes/:jogadorId', verificarToken, checarAcessoCronica, apenasNarrador, JogadoresController.revogarPermissaoAba);

module.exports = router;