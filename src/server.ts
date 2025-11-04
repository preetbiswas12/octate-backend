import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { checkSupabaseConnection } from '../lib/supabase';
import { initializeDatabase } from '../lib/database-init';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Socket.IO setup with CORS
const io = new Server(server, {
	cors: {
		origin: process.env.CORS_ORIGIN?.split(',') || ["https://octate.qzz.io", "https://www.octate.qzz.io"],
		methods: ["GET", "POST"],
		credentials: true
	},
	transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", "data:", "https:"],
		},
	},
}));

app.use(cors({
	origin: process.env.CORS_ORIGIN?.split(',') || ["https://octate.qzz.io", "https://www.octate.qzz.io"],
	credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (req, res) => {
	const dbConnected = await checkSupabaseConnection();
	res.json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		database: dbConnected ? 'connected' : 'disconnected'
	});
});

app.get('/', (req, res) => {
  res.json({ message: 'OctateIDE Collaboration Backend is running on https://octate.qzz.io 🚀' });
});


// Import and use routes
import roomsRouter from './routes/rooms.js';
import documentsRouter from './routes/documents.js';
import authRouter from './routes/auth.js';

app.use('/api/rooms', roomsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/auth', authRouter);

// WebSocket connection handling
io.on('connection', (socket) => {
	console.log(`Client connected: ${socket.id}`);

	// Join room for real-time collaboration
	socket.on('join-room', (roomId: string) => {
		socket.join(roomId);
		socket.to(roomId).emit('user-joined', { socketId: socket.id });
		console.log(`Socket ${socket.id} joined room ${roomId}`);
	});

	// Leave room
	socket.on('leave-room', (roomId: string) => {
		socket.leave(roomId);
		socket.to(roomId).emit('user-left', { socketId: socket.id });
		console.log(`Socket ${socket.id} left room ${roomId}`);
	});

	// Handle document operations for Operational Transform
	socket.on('operation', (data: {
		roomId: string;
		documentId: string;
		operation: any;
		clientId: string;
	}) => {
		// Broadcast operation to all other clients in the room
		socket.to(data.roomId).emit('operation', data);
	});

	// Handle cursor position updates
	socket.on('cursor-update', (data: {
		roomId: string;
		documentId: string;
		cursor: {
			line: number;
			column: number;
			selection?: { start: any; end: any };
		};
		participant: {
			id: string;
			displayName: string;
			color: string;
		};
	}) => {
		// Broadcast cursor position to all other clients in the room
		socket.to(data.roomId).emit('cursor-update', data);
	});

	// Handle presence updates
	socket.on('presence-update', (data: {
		roomId: string;
		status: 'online' | 'away' | 'offline';
		activity?: string;
	}) => {
		// Broadcast presence update to all other clients in the room
		socket.to(data.roomId).emit('presence-update', {
			...data,
			socketId: socket.id
		});
	});

	// Handle disconnection
	socket.on('disconnect', () => {
		console.log(`Client disconnected: ${socket.id}`);
		// Notify all rooms this socket was in about the disconnection
		socket.broadcast.emit('user-disconnected', { socketId: socket.id });
	});
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
	console.error('Error:', err);
	res.status(500).json({
		error: 'Internal server error',
		message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
	});
});

// 404 handler
app.use('*', (req, res) => {
	res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

// Initialize server with database connection check
async function startServer() {
	console.log(`🚀 Starting Octate collaboration backend...`);
	console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);

	// Check database connection on startup
	const dbConnected = await checkSupabaseConnection();
	if (!dbConnected) {
		console.error('❌ Failed to connect to Supabase database');
		console.error('📋 Please check your environment variables:');
		console.error(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
		console.error(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`);
		console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);

		console.log('⚠️  Server will start but database features will not work');
	} else {
		console.log('✅ Supabase database connection verified');

		// Initialize database schema
		const dbInitialized = await initializeDatabase();
		if (!dbInitialized) {
			console.error('❌ Database initialization failed');
			console.log('⚠️  Server will start but some features may not work properly');
		}
	}

	server.listen(PORT, () => {
		console.log(`🚀 Octate collaboration backend running on port ${PORT}`);
		console.log(`📡 WebSocket server ready for real-time collaboration`);
		console.log(`🔗 Health check: http://localhost:${PORT}/health`);
		if (process.env.NODE_ENV === 'production') {
			console.log(`🌐 Production URL: https://octate.qzz.io`);
		}
	});
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('SIGTERM received, shutting down gracefully');
	server.close(() => {
		console.log('Server closed');
		process.exit(0);
	});
});

export default app;
