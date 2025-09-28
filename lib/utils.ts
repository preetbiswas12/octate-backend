/**
 * Utility functions for the collaboration backend
 */

import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';

/**
 * Generate a unique client ID
 */
export function generateClientId(): string {
	return uuidv4();
}

/**
 * Generate a random color for participants
 */
export function generateParticipantColor(): string {
	const colors = [
		'#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
		'#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
		'#F8C471', '#82E0AA', '#AED6F1', '#F1948A', '#D7BDE2',
		'#A3E4D7', '#FAD7A0', '#D5A6BD', '#A9DFBF', '#D6EAF8',
	];
	const randomColor = colors[Math.floor(Math.random() * colors.length)];
	return randomColor!;
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let lastExecTime = 0;

	return (...args: Parameters<T>) => {
		const currentTime = Date.now();

		if (currentTime - lastExecTime > delay) {
			func(...args);
			lastExecTime = currentTime;
		} else {
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
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	return (...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	maxRetries: number = 3,
	baseDelay: number = 1000
): Promise<T> {
	let lastError: Error;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			if (attempt === maxRetries) {
				throw lastError;
			}

			const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}

/**
 * Create a room invitation URL
 */
export function createRoomInviteUrl(roomId: string, baseUrl?: string): string {
	const base = baseUrl || 'vscode://octate/collaboration';
	return `${base}/room/${roomId}`;
}

/**
 * Parse a room invitation URL
 */
export function parseRoomInviteUrl(url: string): { roomId: string } | null {
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
	} catch {
		return null;
	}
}

/**
 * Validate UUID format
 */
export function isValidUUID(str: string): boolean {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(str);
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string | Date): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) {
		return 'just now';
	} else if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	} else if (diffHours < 24) {
		return `${diffHours}h ago`;
	} else if (diffDays < 7) {
		return `${diffDays}d ago`;
	} else {
		return date.toLocaleDateString();
	}
}

/**
 * Sanitize display name
 */
export function sanitizeDisplayName(name: string): string {
	return name
		.replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
		.trim()
		.substring(0, 100); // Limit length
}

/**
 * Create a shortened room ID for display
 */
export function createShortRoomId(roomId: string): string {
	if (!roomId) return 'UNKNOWN';
	const parts = roomId.split('-');
	return parts[0]?.toUpperCase() || 'UNKNOWN';
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Get language from file extension
 */
export function getLanguageFromFilePath(filePath: string): string {
	const extension = filePath.split('.').pop()?.toLowerCase();

	const languageMap: Record<string, string> = {
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
export function calculateTextStats(text: string) {
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
export function createErrorResponse(
	message: string,
	code?: string,
	statusCode: number = 500
) {
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
export function createSuccessResponse<T>(data: T, message?: string) {
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
export const ENV = {
	isDevelopment: process.env.NODE_ENV === 'development',
	isProduction: process.env.NODE_ENV === 'production',
	isTest: process.env.NODE_ENV === 'test',
	debug: process.env.DEBUG === 'true',
};

/**
 * Logger utility
 */
export const logger = {
	debug: (message: string, ...args: any[]) => {
		if (ENV.debug || ENV.isDevelopment) {
			console.debug(`[DEBUG] ${message}`, ...args);
		}
	},
	info: (message: string, ...args: any[]) => {
		console.info(`[INFO] ${message}`, ...args);
	},
	warn: (message: string, ...args: any[]) => {
		console.warn(`[WARN] ${message}`, ...args);
	},
	error: (message: string, error?: Error, ...args: any[]) => {
		console.error(`[ERROR] ${message}`, error, ...args);
	},
};

/**
 * Clean up expired rooms (utility function for maintenance)
 */
export async function cleanupExpiredRooms(): Promise<number> {
	try {
		const { data } = await supabase.rpc('cleanup_expired_rooms');
		logger.info(`Cleaned up ${data || 0} expired rooms`);
		return data || 0;
	} catch (error) {
		logger.error('Failed to cleanup expired rooms', error as Error);
		return 0;
	}
}

/**
 * Health check for the backend services
 */
export async function performHealthCheck(): Promise<{
	supabase: boolean;
	timestamp: string;
}> {
	let supabaseHealth = false;

	try {
		const { error } = await supabase
			.from('rooms')
			.select('id')
			.limit(1);
		supabaseHealth = !error;
	} catch {
		supabaseHealth = false;
	}

	return {
		supabase: supabaseHealth,
		timestamp: new Date().toISOString(),
	};
}
