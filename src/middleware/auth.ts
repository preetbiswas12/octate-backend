import { Request, Response, NextFunction } from 'express';
import { supabase } from '../../lib/supabase';

export interface AuthenticatedRequest extends Request {
	user?: {
		id: string;
		email?: string;
		user_metadata?: any;
	};
}

export async function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			res.status(401).json({ error: 'Missing or invalid authorization header' });
			return;
		}

		const token = authHeader.substring(7);
		const { data: { user }, error } = await supabase.auth.getUser(token);

		if (error || !user) {
			res.status(401).json({ error: 'Invalid or expired token' });
			return;
		}

		req.user = user;
		next();
	} catch (error) {
		console.error('Authentication error:', error);
		res.status(401).json({ error: 'Authentication failed' });
	}
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return next();
	}

	authenticateUser(req, res, next);
}

export class APIError extends Error {
	constructor(
		message: string,
		public statusCode: number = 500,
		public code?: string
	) {
		super(message);
		this.name = 'APIError';
	}
}

export function handleAPIError(error: any, req: Request, res: Response, next: NextFunction): void {
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
