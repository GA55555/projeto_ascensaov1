const jwt = require('jsonwebtoken');
require('dotenv').config();

function verificarToken(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ erro: 'Token não fornecido.' });

    const token = header.split(' ')[1];
    if (!token) return res.status(401).json({ erro: 'Token inválido.' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decodificado) => {
        if (err) return res.status(403).json({ erro: 'Token expirado ou corrompido.' });
        req.usuario = decodificado;
        next();
    });
}

module.exports = verificarToken;