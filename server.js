require('dotenv').config();
const express = require('express');
const pool = require('./db');
const path = require('path');
const verificarToken = require('./middlewares/auth');
const { checarAcessoCronica, checarNivelAcessoAba } = require('./middlewares/permissoes');
const app = express();

app.set('trust proxy', 1); // Obrigatório para a Cloudflare
const PORTA = 3000;

const authRoutes = require('./routes/authRoutes');
const cronicasRoutes = require('./routes/cronicasRoutes');
const perfilRoutes = require('./routes/perfilRoutes');
const escudoRoutes = require('./routes/escudoRoutes');
const comunidadeRoutes = require('./routes/comunidadeRoutes');
const mundoRoutes = require('./routes/mundoRoutes');
const jogadoresRoutes = require('./routes/jogadoresRoutes');
const sistemasRoutes = require('./routes/sistemasRoutes');
const midiaRoutes = require('./routes/midiaRoutes');
const gavetaRoutes = require('./routes/gavetaRoutes');
const multer = require('multer');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// =========================================================================
// CONFIGURAÇÃO DE SEGURANÇA E CORS (LÊ DO .ENV)
// =========================================================================
const dominiosCORS = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',') 
    : ['http://localhost:3000'];

// middlewares base (HELMET REATIVADO E DINÂMICO)
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc:    ["'self'", ...dominiosCORS],
                scriptSrc:     ["'self'", "'unsafe-inline'", ...dominiosCORS],
                scriptSrcAttr: ["'self'", "'unsafe-inline'"],
                styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc:       ["'self'", "https://fonts.gstatic.com", "data:"],
                imgSrc:        ["'self'", "data:", "blob:", "https:", "http:"],
                connectSrc:    ["'self'", "ws:", "wss:", ...dominiosCORS],
                objectSrc:     ["'self'"],
            },
        },
        hsts: true,
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    })
);

app.use(cors({
    origin: function (origin, callback) {
        // Permite chamadas sem origin (ex: Postman), localhost genérico, ou domínios configurados no .env
        if (!origin || origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000' || dominiosCORS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado pelo CORS'));
        }
    },
    credentials: true
}));

app.use(express.static(path.join(__dirname, 'static')));
app.use(express.json({ limit: '1mb' }));

// Redireciona raiz para login
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// =========================================================================
// ORDEM CRÍTICA CORRIGIDA: O ANTI-CACHE VEM ANTES DA PASTA PUBLIC
// =========================================================================

// 1º Segurança extra: páginas protegidas nunca serão servidas do cache
app.use((req, res, next) => {
    if (req.path.endsWith('.html') && req.path !== '/login.html' && req.path !== '/registro.html') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
});

// 2º Define a pasta public como raiz estática
app.use(express.static(path.join(__dirname, 'public')));


const limitadorGeral = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { erro: 'Muitas requisições deste IP, tente novamente em um minuto.' }
});

// Rotas da API
app.use(limitadorGeral);
app.use('/auth', authRoutes);
app.use('/cronicas', cronicasRoutes);
app.use('/perfil', perfilRoutes);
app.use('/cronicas/:cronicaId', escudoRoutes);
app.use('/cronicas/:cronicaId', comunidadeRoutes);
app.use('/cronicas/:cronicaId', mundoRoutes);
app.use('/cronicas', jogadoresRoutes);
app.use('/midia', midiaRoutes);
app.use('/gaveta', gavetaRoutes);
app.use('/sistemas', sistemasRoutes);

// =========================================================================
// MIDDLEWARE GLOBAL DE ERROS (Último passo do fluxo de requisições)
// =========================================================================
app.use((err, req, res, next) => {
    console.error("🔥 Erro Interno:", err); // Log explícito no terminal do servidor

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ erro: 'Arquivo muito grande! Máximo 5MB.' });
        return res.status(400).json({ erro: err.message });
    } 
    
    // Tratamento defensivo para erros de infraestrutura/PostgreSQL
    if (err.code) {
        if (err.code === '42P01') return res.status(500).json({ erro: 'Tabela não encontrada no banco de dados.' });
        return res.status(500).json({ erro: 'Erro no banco de dados.', detalhe: err.message });
    }

    // Erros gerais da aplicação
    res.status(err.status || 500).json({ erro: err.message || 'Erro interno no servidor.' });
});

// Inicialização do Servidor
app.listen(PORTA, () => console.log(`🚀 Servidor rodando na porta ${PORTA}`));