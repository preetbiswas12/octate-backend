import express from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { supabase } from '../../lib/supabase';
import { APIError } from '../middleware/auth';

const router = express.Router();

// Request validation schemas
const tokenValidationSchema = z.object({
	token: z.string(),
});

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// POST /api/auth/validate - Validate JWT token
router.post('/validate', async (req, res) => {
	try {
		const { token } = tokenValidationSchema.parse(req.body);

		// Decode and verify JWT token
		const decoded = jwt.verify(token, JWT_SECRET) as any;

		if (!decoded || !decoded.sub) {
			throw new APIError('Invalid token', 401, 'INVALID_TOKEN');
		}

		// Fetch user from Supabase
		const { data: user, error } = await supabase.auth.admin.getUserById(decoded.sub);

		if (error || !user) {
			throw new APIError('User not found', 404, 'USER_NOT_FOUND');
		}

		res.json({
			valid: true,
			user: {
				id: user.user.id,
				email: user.user.email,
				user_metadata: user.user.user_metadata,
			}
		});
	} catch (error) {
		if (error instanceof jwt.JsonWebTokenError) {
			return res.status(401).json({
				valid: false,
				error: 'Invalid token',
				code: 'INVALID_TOKEN'
			});
		}
		if (error instanceof z.ZodError) {
			return res.status(400).json({
				error: 'Invalid request data',
				details: error.errors
			});
		}
		if (error instanceof APIError) {
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
			throw new APIError('No token provided', 401, 'NO_TOKEN');
		}

		const token = authHeader.substring(7);
		const decoded = jwt.verify(token, JWT_SECRET) as any;

		if (!decoded || !decoded.sub) {
			throw new APIError('Invalid token', 401, 'INVALID_TOKEN');
		}

		// Fetch user from Supabase
		const { data: user, error } = await supabase.auth.admin.getUserById(decoded.sub);

		if (error || !user) {
			throw new APIError('User not found', 404, 'USER_NOT_FOUND');
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
	} catch (error) {
		if (error instanceof jwt.JsonWebTokenError) {
			return res.status(401).json({
				error: 'Invalid token',
				code: 'INVALID_TOKEN'
			});
		}
		if (error instanceof APIError) {
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
			throw new APIError('Refresh token required', 400, 'MISSING_REFRESH_TOKEN');
		}

		// Use Supabase to refresh the session
		const { data, error } = await supabase.auth.refreshSession({ refresh_token });

		if (error || !data.session) {
			throw new APIError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
		}

		res.json({
			access_token: data.session.access_token,
			refresh_token: data.session.refresh_token,
			expires_in: data.session.expires_in,
			user: data.user,
		});
	} catch (error) {
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({
				error: error.message,
				code: error.code
			});
		}
		console.error('Error refreshing token:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
