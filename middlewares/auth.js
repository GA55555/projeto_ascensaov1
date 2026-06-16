const jwt = require('jsonwebtoken');

// ✅ Usa variável de ambiente, sem fallback hardcoded
const JWT_SECRET = process.env.JWT_SECRET;

function verificarToken(req, res, next) {
    
    const authHeader = req.headers['authorization'];
    
    // 1. Verifica se o header existe
    if (!authHeader) {
        return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    // 2. Valida o prefixo "Bearer "
    const partes = authHeader.split(' ');
    
    if (partes.length !== 2 || partes[0] !== 'Bearer') {
        return res.status(401).json({ erro: 'Formato de token inválido. Use: Bearer <token>' });
    }

    const token = partes[1];

    // 3. Verifica se JWT_SECRET está configurado
    if (!JWT_SECRET) {
        console.error('JWT_SECRET não configurado nas variáveis de ambiente!');
        return res.status(500).json({ erro: 'Erro interno de configuração do servidor.' });
    }

    // 4. Verifica o token
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ erro: 'Token expirado. Faça login novamente.' });
            }
            return res.status(403).json({ erro: 'Token inválido.' });
        }
        
        // Injeta dados do usuário na requisição
        req.usuario = decoded;
        next();
    });
}

module.exports = verificarToken;