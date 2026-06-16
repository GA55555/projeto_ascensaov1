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
        return res.status(400).json({ erro: err.errors });
    }
};
module.exports = validate;