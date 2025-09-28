"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APIError = void 0;
exports.authenticateUser = authenticateUser;
exports.optionalAuth = optionalAuth;
exports.handleAPIError = handleAPIError;
const supabase_1 = require("../../lib/supabase");
async function authenticateUser(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Missing or invalid authorization header' });
            return;
        }
        const token = authHeader.substring(7);
        const { data: { user }, error } = await supabase_1.supabase.auth.getUser(token);
        if (error || !user) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }
        req.user = user;
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
}
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }
    authenticateUser(req, res, next);
}
class APIError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'APIError';
    }
}
exports.APIError = APIError;
function handleAPIError(error, req, res, next) {
    if (error instanceof APIError) {
        res.status(error.statusCode).json({
            error: error.message,
            code: error.code
        });
        return;
    }
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
}
//# sourceMappingURL=auth.js.map