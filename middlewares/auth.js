const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET;

    // Aceita única e exclusivamente o Cookie HttpOnly assinado pelo backend (sem fallback de header).
    const token = req.cookies ? req.cookies.m20_token : null;

    if (!token) {
        return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    if (!JWT_SECRET) {
        console.error('JWT_SECRET não configurado nas variáveis de ambiente!');
        return res.status(500).json({ erro: 'Erro interno de configuração do servidor.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ erro: 'Token expirado. Faça login novamente.' });
            }
            return res.status(403).json({ erro: 'Token inválido.' });
        }

        req.usuario = decoded;
        next();
    });
}

module.exports = verificarToken;