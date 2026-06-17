const { ZodError } = require('zod');

// middlewares/validate.js
const validate = (schema) => (req, res, next) => {
    try {
        if (!schema) return next();
        
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (err) {
        // Zod v4: o array estruturado de erros vive em err.issues (err.errors é getter depreciado).
        if (err instanceof ZodError) {
            return res.status(400).json({ erro: err.issues });
        }
        return res.status(400).json({ erro: err.message });
    }
};
module.exports = validate;