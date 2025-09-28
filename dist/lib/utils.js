"use strict";
/**
 * Utility functions for the collaboration backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.ENV = void 0;
exports.generateClientId = generateClientId;
exports.generateParticipantColor = generateParticipantColor;
exports.throttle = throttle;
exports.debounce = debounce;
exports.retryWithBackoff = retryWithBackoff;
exports.createRoomInviteUrl = createRoomInviteUrl;
exports.parseRoomInviteUrl = parseRoomInviteUrl;
exports.isValidUUID = isValidUUID;
exports.formatFileSize = formatFileSize;
exports.formatTimestamp = formatTimestamp;
exports.sanitizeDisplayName = sanitizeDisplayName;
exports.createShortRoomId = createShortRoomId;
exports.isValidEmail = isValidEmail;
exports.getLanguageFromFilePath = getLanguageFromFilePath;
exports.calculateTextStats = calculateTextStats;
exports.createErrorResponse = createErrorResponse;
exports.createSuccessResponse = createSuccessResponse;
exports.cleanupExpiredRooms = cleanupExpiredRooms;
exports.performHealthCheck = performHealthCheck;
const uuid_1 = require("uuid");
const supabase_1 = require("./supabase");
/**
 * Generate a unique client ID
 */
function generateClientId() {
    return (0, uuid_1.v4)();
}
/**
 * Generate a random color for participants
 */
function generateParticipantColor() {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
        '#F8C471', '#82E0AA', '#AED6F1', '#F1948A', '#D7BDE2',
        '#A3E4D7', '#FAD7A0', '#D5A6BD', '#A9DFBF', '#D6EAF8',
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    return randomColor;
}
/**
 * Throttle function calls
 */
function throttle(func, delay) {
    let timeoutId = null;
    let lastExecTime = 0;
    return (...args) => {
        const currentTime = Date.now();
        if (currentTime - lastExecTime > delay) {
            func(...args);
            lastExecTime = currentTime;
        }
        else {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                func(...args);
                lastExecTime = Date.now();
            }, delay - (currentTime - lastExecTime));
        }
    };
}
/**
 * Debounce function calls
 */
function debounce(func, delay) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => func(...args), delay);
    };
}
/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt === maxRetries) {
                throw lastError;
            }
            const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
/**
 * Create a room invitation URL
 */
function createRoomInviteUrl(roomId, baseUrl) {
    const base = baseUrl || 'vscode://octate/collaboration';
    return `${base}/room/${roomId}`;
}
/**
 * Parse a room invitation URL
 */
function parseRoomInviteUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const roomIndex = pathParts.indexOf('room');
        if (roomIndex !== -1 && roomIndex + 1 < pathParts.length) {
            const roomId = pathParts[roomIndex + 1];
            if (roomId && isValidUUID(roomId)) {
                return { roomId };
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Validate UUID format
 */
function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}
/**
 * Format file size in human readable format
 */
function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffSeconds < 60) {
        return 'just now';
    }
    else if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
    }
    else if (diffHours < 24) {
        return `${diffHours}h ago`;
    }
    else if (diffDays < 7) {
        return `${diffDays}d ago`;
    }
    else {
        return date.toLocaleDateString();
    }
}
/**
 * Sanitize display name
 */
function sanitizeDisplayName(name) {
    return name
        .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
        .trim()
        .substring(0, 100); // Limit length
}
/**
 * Create a shortened room ID for display
 */
function createShortRoomId(roomId) {
    if (!roomId)
        return 'UNKNOWN';
    const parts = roomId.split('-');
    return parts[0]?.toUpperCase() || 'UNKNOWN';
}
/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
/**
 * Get language from file extension
 */
function getLanguageFromFilePath(filePath) {
    const extension = filePath.split('.').pop()?.toLowerCase();
    const languageMap = {
        'js': 'javascript',
        'jsx': 'javascriptreact',
        'ts': 'typescript',
        'tsx': 'typescriptreact',
        'py': 'python',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'php': 'php',
        'rb': 'ruby',
        'go': 'go',
        'rs': 'rust',
        'swift': 'swift',
        'kt': 'kotlin',
        'scala': 'scala',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'sass': 'sass',
        'less': 'less',
        'json': 'json',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'md': 'markdown',
        'sql': 'sql',
        'sh': 'shellscript',
        'bat': 'bat',
        'ps1': 'powershell',
    };
    return languageMap[extension || ''] || 'plaintext';
}
/**
 * Calculate text statistics
 */
function calculateTextStats(text) {
    const lines = text.split('\n');
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const characters = text.length;
    const charactersNoSpaces = text.replace(/\s/g, '').length;
    return {
        lines: lines.length,
        words: words.length,
        characters,
        charactersNoSpaces,
    };
}
/**
 * Create error response
 */
function createErrorResponse(message, code, statusCode = 500) {
    return {
        error: message,
        code,
        statusCode,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Create success response
 */
function createSuccessResponse(data, message) {
    return {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Environment helpers
 */
exports.ENV = {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
    debug: process.env.DEBUG === 'true',
};
/**
 * Logger utility
 */
exports.logger = {
    debug: (message, ...args) => {
        if (exports.ENV.debug || exports.ENV.isDevelopment) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    },
    info: (message, ...args) => {
        console.info(`[INFO] ${message}`, ...args);
    },
    warn: (message, ...args) => {
        console.warn(`[WARN] ${message}`, ...args);
    },
    error: (message, error, ...args) => {
        console.error(`[ERROR] ${message}`, error, ...args);
    },
};
/**
 * Clean up expired rooms (utility function for maintenance)
 */
async function cleanupExpiredRooms() {
    try {
        const { data } = await supabase_1.supabase.rpc('cleanup_expired_rooms');
        exports.logger.info(`Cleaned up ${data || 0} expired rooms`);
        return data || 0;
    }
    catch (error) {
        exports.logger.error('Failed to cleanup expired rooms', error);
        return 0;
    }
}
/**
 * Health check for the backend services
 */
async function performHealthCheck() {
    let supabaseHealth = false;
    try {
        const { error } = await supabase_1.supabase
            .from('rooms')
            .select('id')
            .limit(1);
        supabaseHealth = !error;
    }
    catch {
        supabaseHealth = false;
    }
    return {
        supabase: supabaseHealth,
        timestamp: new Date().toISOString(),
    };
}
//# sourceMappingURL=utils.js.map