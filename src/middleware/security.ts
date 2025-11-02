import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Rate limiting configuration
export const createRateLimiter = (windowMs: number = 15 * 60 * 1000, max: number = 100) => {
	return rateLimit({
		windowMs, // 15 minutes default
		max, // Limit each IP to 100 requests per windowMs
		message: {
			error: 'Too many requests from this IP, please try again later.',
			retryAfter: Math.ceil(windowMs / 1000)
		},
		standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
		legacyHeaders: false, // Disable the `X-RateLimit-*` headers
		handler: (req: Request, res: Response) => {
			res.status(429).json({
				error: 'Rate limit exceeded',
				message: 'Too many requests from this IP, please try again later.',
				retryAfter: Math.ceil(windowMs / 1000)
			});
		}
	});
};

// Different rate limits for different endpoints
export const apiLimiter = createRateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes
export const authLimiter = createRateLimiter(15 * 60 * 1000, 20);  // 20 auth requests per 15 minutes
export const strictLimiter = createRateLimiter(15 * 60 * 1000, 10); // 10 requests per 15 minutes

// IP whitelist for development/testing
const whitelistedIPs = process.env.NODE_ENV === 'production' ? [] : ['127.0.0.1', '::1'];

export const createWhitelistRateLimiter = (windowMs: number, max: number) => {
	return rateLimit({
		windowMs,
		max,
		skip: (req: Request) => {
			const clientIP = req.ip || req.connection.remoteAddress;
			return whitelistedIPs.includes(clientIP || '');
		},
		message: {
			error: 'Too many requests from this IP, please try again later.',
			retryAfter: Math.ceil(windowMs / 1000)
		}
	});
};

// CORS configuration
export const corsOptions = {
	origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
		// Allow requests with no origin (like mobile apps or curl requests)
		if (!origin) return callback(null, true);

		const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
			'https://octate.dev',
			'https://www.octate.dev',
			'http://localhost:3000',
			'http://localhost:3001'
		];

		if (allowedOrigins.includes(origin)) {
			callback(null, true);
		} else {
			callback(new Error('Not allowed by CORS'));
		}
	},
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Security headers
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
	// Prevent clickjacking
	res.setHeader('X-Frame-Options', 'DENY');
	
	// Prevent MIME type sniffing
	res.setHeader('X-Content-Type-Options', 'nosniff');
	
	// Enable XSS protection
	res.setHeader('X-XSS-Protection', '1; mode=block');
	
	// Enforce HTTPS in production
	if (process.env.NODE_ENV === 'production') {
		res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	
	// Prevent information disclosure
	res.removeHeader('X-Powered-By');
	
	next();
};

// Request validation
export const validateRequestSize = (req: Request, res: Response, next: NextFunction) => {
	const maxSize = parseInt(process.env.MAX_REQUEST_SIZE?.replace('mb', '') || '10') * 1024 * 1024;
	
	if (req.headers['content-length'] && parseInt(req.headers['content-length']) > maxSize) {
		return res.status(413).json({
			error: 'Request too large',
			maxSize: `${maxSize / 1024 / 1024}MB`
		});
	}
	
	next();
};

// Request logging for production
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
	const start = Date.now();
	
	res.on('finish', () => {
		const duration = Date.now() - start;
		const logData = {
			method: req.method,
			url: req.url,
			status: res.statusCode,
			duration: `${duration}ms`,
			ip: req.ip,
			userAgent: req.get('User-Agent'),
			timestamp: new Date().toISOString()
		};
		
		if (process.env.NODE_ENV === 'production') {
			console.log(JSON.stringify(logData));
		} else {
			console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
		}
	});
	
	next();
};