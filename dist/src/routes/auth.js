"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase_1 = require("../../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Request validation schemas
const tokenValidationSchema = zod_1.z.object({
    token: zod_1.z.string(),
});
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
// POST /api/auth/validate - Validate JWT token
router.post('/validate', async (req, res) => {
    try {
        const { token } = tokenValidationSchema.parse(req.body);
        // Decode and verify JWT token
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!decoded || !decoded.sub) {
            throw new auth_1.APIError('Invalid token', 401, 'INVALID_TOKEN');
        }
        // Fetch user from Supabase
        const { data: user, error } = await supabase_1.supabase.auth.admin.getUserById(decoded.sub);
        if (error || !user) {
            throw new auth_1.APIError('User not found', 404, 'USER_NOT_FOUND');
        }
        res.json({
            valid: true,
            user: {
                id: user.user.id,
                email: user.user.email,
                user_metadata: user.user.user_metadata,
            }
        });
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                valid: false,
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Invalid request data',
                details: error.errors
            });
        }
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({
                valid: false,
                error: error.message,
                code: error.code
            });
        }
        console.error('Error validating token:', error);
        res.status(500).json({
            valid: false,
            error: 'Internal server error'
        });
    }
});
// GET /api/auth/me - Get current user info
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new auth_1.APIError('No token provided', 401, 'NO_TOKEN');
        }
        const token = authHeader.substring(7);
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!decoded || !decoded.sub) {
            throw new auth_1.APIError('Invalid token', 401, 'INVALID_TOKEN');
        }
        // Fetch user from Supabase
        const { data: user, error } = await supabase_1.supabase.auth.admin.getUserById(decoded.sub);
        if (error || !user) {
            throw new auth_1.APIError('User not found', 404, 'USER_NOT_FOUND');
        }
        res.json({
            user: {
                id: user.user.id,
                email: user.user.email,
                user_metadata: user.user.user_metadata,
                created_at: user.user.created_at,
                last_sign_in_at: user.user.last_sign_in_at,
            }
        });
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(401).json({
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({
                error: error.message,
                code: error.code
            });
        }
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/auth/refresh - Refresh user session
router.post('/refresh', async (req, res) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            throw new auth_1.APIError('Refresh token required', 400, 'MISSING_REFRESH_TOKEN');
        }
        // Use Supabase to refresh the session
        const { data, error } = await supabase_1.supabase.auth.refreshSession({ refresh_token });
        if (error || !data.session) {
            throw new auth_1.APIError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
        }
        res.json({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            user: data.user,
        });
    }
    catch (error) {
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({
                error: error.message,
                code: error.code
            });
        }
        console.error('Error refreshing token:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map