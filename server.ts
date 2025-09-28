/**
 * Simple local server for testing the collaboration backend
 * This allows testing without deploying to Vercel
 */

import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync } from 'fs';
import { join } from 'path';

// Import API handlers
import healthHandler from './api/health';
import websocketHandler from './api/websocket';

const port = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
	const parsedUrl = parse(req.url!, true);
	const { pathname } = parsedUrl;

	// Set CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		res.statusCode = 200;
		res.end();
		return;
	}

	try {
		// Route to appropriate handler
		if (pathname === '/api/health') {
			await healthHandler(req as any, res as any);
		} else if (pathname === '/api/websocket') {
			await websocketHandler(req as any, res as any);
		} else if (pathname?.startsWith('/api/rooms')) {
			// Handle rooms API endpoints
			const roomsHandler = await import('./api/rooms/index');
			await roomsHandler.default(req as any, res as any);
		} else if (pathname?.startsWith('/api/documents')) {
			// Handle documents API endpoints
			const documentsHandler = await import('./api/documents/index');
			await documentsHandler.default(req as any, res as any);
		} else {
			// 404 for unknown routes
			res.statusCode = 404;
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({
				error: 'Not Found',
				message: `Route ${pathname} not found`,
				timestamp: new Date().toISOString()
			}));
		}
	} catch (error) {
		console.error('Server error:', error);
		res.statusCode = 500;
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify({
			error: 'Internal Server Error',
			message: 'An unexpected error occurred',
			timestamp: new Date().toISOString()
		}));
	}
});

server.listen(port, () => {
	console.log(`🚀 Collaboration backend server running on http://localhost:${port}`);
	console.log(`📋 Health check: http://localhost:${port}/api/health`);
	console.log(`🔌 WebSocket: http://localhost:${port}/api/websocket`);
	console.log(`📚 API Documentation: See README.md for endpoint details`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('SIGTERM received, shutting down gracefully');
	server.close(() => {
		console.log('Server closed');
		process.exit(0);
	});
});

process.on('SIGINT', () => {
	console.log('SIGINT received, shutting down gracefully');
	server.close(() => {
		console.log('Server closed');
		process.exit(0);
	});
});
