"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
const database_init_1 = require("../lib/database-init");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// Socket.IO setup with CORS
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['https://octate.qzz.io', 'https://www.octate.qzz.io'],
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ['self'],
            styleSrc: ['self', 'unsafe-inline'],
            scriptSrc: ['self'],
            imgSrc: ['self', 'data:', 'https:'],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN?.split(',') || ['https://octate.qzz.io', 'https://www.octate.qzz.io'],
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Health check endpoint
app.get('/health', async (req, res) => {
    const dbConnected = await (0, supabase_1.checkSupabaseConnection)();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected'
    });
});
// Import and use routes
const rooms_js_1 = __importDefault(require("./routes/rooms.js"));
const documents_js_1 = __importDefault(require("./routes/documents.js"));
const auth_js_1 = __importDefault(require("./routes/auth.js"));
app.use('/api/rooms', rooms_js_1.default);
app.use('/api/documents', documents_js_1.default);
app.use('/api/auth', auth_js_1.default);
// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    // Join room for real-time collaboration
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-joined', { socketId: socket.id });
        console.log(`Socket ${socket.id} joined room ${roomId}`);
    });
    // Leave room
    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        socket.to(roomId).emit('user-left', { socketId: socket.id });
        console.log(`Socket ${socket.id} left room ${roomId}`);
    });
    // Handle document operations for Operational Transform
    socket.on('operation', (data) => {
        // Broadcast operation to all other clients in the room
        socket.to(data.roomId).emit('operation', data);
    });
    // Handle cursor position updates
    socket.on('cursor-update', (data) => {
        // Broadcast cursor position to all other clients in the room
        socket.to(data.roomId).emit('cursor-update', data);
    });
    // Handle presence updates
    socket.on('presence-update', (data) => {
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
app.use((err, req, res, next) => {
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
    const dbConnected = await (0, supabase_1.checkSupabaseConnection)();
    if (!dbConnected) {
        console.error('❌ Failed to connect to Supabase database');
        console.error('📋 Please check your environment variables:');
        console.error(`   SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
        console.error(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'}`);
        console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}`);
        console.log('⚠️  Server will start but database features will not work');
    }
    else {
        console.log('✅ Supabase database connection verified');
        // Initialize database schema
        const dbInitialized = await (0, database_init_1.initializeDatabase)();
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
exports.default = app;
//# sourceMappingURL=server.js.map