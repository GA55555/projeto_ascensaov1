const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'grimorio_secreto_m20_super_seguro';


function verificarToken(req, res, next) {
    
    const token = req.headers['authorization'];
    
    
    if (!token) {
        return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido ou expirado.' });
        }
        
        
        req.usuario = decoded;
        
        
        next();
    });
}


module.exports = verificarToken;