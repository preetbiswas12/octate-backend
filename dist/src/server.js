"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const supabase_1 = require("../lib/supabase");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
// Socket.IO setup with CORS
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});
// Middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "*",
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
server.listen(PORT, () => {
    console.log(`🚀 Octate collaboration backend running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 WebSocket server ready for real-time collaboration`);
});
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