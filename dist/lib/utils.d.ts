/**
 * Utility functions for the collaboration backend
 */
/**
 * Generate a unique client ID
 */
export declare function generateClientId(): string;
/**
 * Generate a random color for participants
 */
export declare function generateParticipantColor(): string;
/**
 * Throttle function calls
 */
export declare function throttle<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void;
/**
 * Debounce function calls
 */
export declare function debounce<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void;
/**
 * Retry function with exponential backoff
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries?: number, baseDelay?: number): Promise<T>;
/**
 * Create a room invitation URL
 */
export declare function createRoomInviteUrl(roomId: string, baseUrl?: string): string;
/**
 * Parse a room invitation URL
 */
export declare function parseRoomInviteUrl(url: string): {
    roomId: string;
} | null;
/**
 * Validate UUID format
 */
export declare function isValidUUID(str: string): boolean;
/**
 * Format file size in human readable format
 */
export declare function formatFileSize(bytes: number): string;
/**
 * Format timestamp for display
 */
export declare function formatTimestamp(timestamp: string | Date): string;
/**
 * Sanitize display name
 */
export declare function sanitizeDisplayName(name: string): string;
/**
 * Create a shortened room ID for display
 */
export declare function createShortRoomId(roomId: string): string;
/**
 * Validate email format
 */
export declare function isValidEmail(email: string): boolean;
/**
 * Get language from file extension
 */
export declare function getLanguageFromFilePath(filePath: string): string;
/**
 * Calculate text statistics
 */
export declare function calculateTextStats(text: string): {
    lines: number;
    words: number;
    characters: number;
    charactersNoSpaces: number;
};
/**
 * Create error response
 */
export declare function createErrorResponse(message: string, code?: string, statusCode?: number): {
    error: string;
    code: string | undefined;
    statusCode: number;
    timestamp: string;
};
/**
 * Create success response
 */
export declare function createSuccessResponse<T>(data: T, message?: string): {
    success: boolean;
    data: T;
    message: string | undefined;
    timestamp: string;
};
/**
 * Environment helpers
 */
export declare const ENV: {
    isDevelopment: boolean;
    isProduction: boolean;
    isTest: boolean;
    debug: boolean;
};
/**
 * Logger utility
 */
export declare const logger: {
    debug: (message: string, ...args: any[]) => void;
    info: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
    error: (message: string, error?: Error, ...args: any[]) => void;
};
/**
 * Clean up expired rooms (utility function for maintenance)
 */
export declare function cleanupExpiredRooms(): Promise<number>;
/**
 * Health check for the backend services
 */
export declare function performHealthCheck(): Promise<{
    supabase: boolean;
    timestamp: string;
}>;
//# sourceMappingURL=utils.d.ts.map