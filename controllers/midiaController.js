const sharp = require('sharp');
const path = require('path');
const crypto = require('crypto');

exports.uploadImagens = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).json({ erro: 'Nenhuma imagem.' });

        const tipo = req.params.tipo;
        const pastaDestino = path.join(__dirname, '..', 'public', 'uploads', tipo);

        const urlsGeradas = await Promise.all(req.files.map(async (file) => {
            const nomeArquivo = crypto.randomBytes(16).toString('hex') + '.webp';

            await sharp(file.buffer)
                .rotate()
                .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .withMetadata(false)
                .toFile(path.join(pastaDestino, nomeArquivo));

            return `/uploads/${tipo}/${nomeArquivo}`;
        }));

        res.status(201).json({ urls: urlsGeradas });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro no upload.' });
    }
};
