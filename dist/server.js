"use strict";
/**
 * Simple local server for testing the collaboration backend
 * This allows testing without deploying to Vercel
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = require("http");
const url_1 = require("url");
// Import API handlers
const health_1 = __importDefault(require("./api/health"));
const websocket_1 = __importDefault(require("./api/websocket"));
const port = process.env.PORT || 3000;
const server = (0, http_1.createServer)(async (req, res) => {
    const parsedUrl = (0, url_1.parse)(req.url, true);
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
            await (0, health_1.default)(req, res);
        }
        else if (pathname === '/api/websocket') {
            await (0, websocket_1.default)(req, res);
        }
        else if (pathname?.startsWith('/api/rooms')) {
            // Handle rooms API endpoints
            const roomsHandler = await Promise.resolve().then(() => __importStar(require('./api/rooms/index')));
            await roomsHandler.default(req, res);
        }
        else if (pathname?.startsWith('/api/documents')) {
            // Handle documents API endpoints
            const documentsHandler = await Promise.resolve().then(() => __importStar(require('./api/documents/index')));
            await documentsHandler.default(req, res);
        }
        else {
            // 404 for unknown routes
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
                error: 'Not Found',
                message: `Route ${pathname} not found`,
                timestamp: new Date().toISOString()
            }));
        }
    }
    catch (error) {
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
//# sourceMappingURL=server.js.map