/**
 * Client-side collaboration service for VS Code Octate
 * This service manages real-time collaboration features including:
 * - Room management
 * - Real-time document synchronization
 * - Cursor and selection sharing
 * - Participant presence
 * - Conflict resolution using Operational Transforms
 */

import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'events';
import {
	TextOperation,
	transformTextOperations,
	composeTextOperations,
	createOperationFromDiff,
	transformCursorPosition,
} from './operational-transform';
import {
	generateClientId,
	generateParticipantColor,
	throttle,
	debounce,
	retryWithBackoff,
	logger,
} from './utils';

export interface Participant {
	id: string;
	displayName: string;
	color: string;
	avatar?: string;
	isOwner: boolean;
	status: 'online' | 'idle' | 'offline';
	lastSeen: string;
	joinedAt: string;
}

export interface Room {
	id: string;
	name: string;
	description?: string;
	ownerId: string;
	isPublic: boolean;
	maxParticipants: number;
	currentParticipants: number;
	createdAt: string;
	updatedAt: string;
	participants: Participant[];
}

export interface DocumentState {
	id: string;
	roomId: string;
	content: string;
	version: number;
	lastModified: string;
	language: string;
	filePath: string;
}

export interface CursorPosition {
	line: number;
	character: number;
}

export interface CursorData {
	participantId: string;
	position: CursorPosition;
	selection?: {
		start: CursorPosition;
		end: CursorPosition;
	};
	color: string;
	displayName: string;
}

export interface CollaborationOperation {
	id: string;
	type: 'text-edit' | 'cursor-move' | 'selection-change';
	documentId: string;
	participantId: string;
	operation: TextOperation[];
	timestamp: string;
	version: number;
}

export interface CollaborationEvents {
	// Connection events
	'connected': () => void;
	'disconnected': () => void;
	'error': (error: Error) => void;
	'reconnecting': (attemptNumber: number) => void;

	// Room events
	'room-joined': (room: Room) => void;
	'room-left': () => void;
	'participant-joined': (participant: Participant) => void;
	'participant-left': (participant: Participant) => void;
	'participant-updated': (participant: Participant) => void;

	// Document events
	'document-updated': (document: DocumentState) => void;
	'operation-applied': (operation: CollaborationOperation) => void;
	'cursor-updated': (cursor: CursorData) => void;
	'selection-updated': (selection: CursorData) => void;

	// Sync events
	'sync-started': () => void;
	'sync-completed': () => void;
	'conflict-resolved': (operation: CollaborationOperation) => void;
}

export class CollaborationService extends EventEmitter {
	private socket: Socket | null = null;
	private clientId: string;
	private currentRoom: Room | null = null;
	private currentDocument: DocumentState | null = null;
	private pendingOperations: Map<string, CollaborationOperation> = new Map();
	private operationQueue: CollaborationOperation[] = [];
	private isConnected = false;
	private isReconnecting = false;
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 5;
	private serverUrl: string;
	private authToken: string | null = null;

	// Throttled methods
	private throttledSendCursor: (cursor: CursorData) => void;
	private debouncedSendOperation: (operation: CollaborationOperation) => void;

	constructor(serverUrl: string = 'http://localhost:3000') {
		super();
		this.serverUrl = serverUrl;
		this.clientId = generateClientId();

		// Create throttled methods
		this.throttledSendCursor = throttle(this.sendCursorUpdate.bind(this), 100);
		this.debouncedSendOperation = debounce(this.sendOperation.bind(this), 50);

		logger.debug('CollaborationService initialized', { clientId: this.clientId });
	}

	/**
	 * Initialize the collaboration service
	 */
	async initialize(authToken?: string): Promise<void> {
		try {
			this.authToken = authToken || null;
			await this.connect();
			logger.info('CollaborationService initialized successfully');
		} catch (error) {
			logger.error('Failed to initialize CollaborationService', error as Error);
			throw error;
		}
	}

	/**
	 * Connect to the collaboration server
	 */
	private async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.socket = io(this.serverUrl, {
					auth: {
						token: this.authToken,
						clientId: this.clientId,
					},
					transports: ['websocket', 'polling'],
					timeout: 10000,
					reconnection: true,
					reconnectionAttempts: this.maxReconnectAttempts,
					reconnectionDelay: 1000,
				});

				this.setupSocketListeners();

				this.socket.on('connect', () => {
					this.isConnected = true;
					this.isReconnecting = false;
					this.reconnectAttempts = 0;
					logger.info('Connected to collaboration server');
					this.emit('connected');
					resolve();
				});

				this.socket.on('connect_error', (error) => {
					logger.error('Connection error', error);
					this.emit('error', error);
					reject(error);
				});

			} catch (error) {
				logger.error('Failed to create socket connection', error as Error);
				reject(error);
			}
		});
	}

	/**
	 * Setup socket event listeners
	 */
	private setupSocketListeners(): void {
		if (!this.socket) return;

		// Connection events
		this.socket.on('disconnect', (reason) => {
			this.isConnected = false;
			logger.warn('Disconnected from server', { reason });
			this.emit('disconnected');

			if (reason === 'io server disconnect') {
				// Server initiated disconnect, don't reconnect
				return;
			}

			this.handleReconnection();
		});

		this.socket.on('reconnect', (attemptNumber) => {
			this.isConnected = true;
			this.isReconnecting = false;
			logger.info('Reconnected to server', { attemptNumber });
			this.emit('connected');
		});

		this.socket.on('reconnect_attempt', (attemptNumber) => {
			this.isReconnecting = true;
			this.reconnectAttempts = attemptNumber;
			logger.debug('Attempting to reconnect', { attemptNumber });
			this.emit('reconnecting', attemptNumber);
		});

		this.socket.on('reconnect_failed', () => {
			this.isReconnecting = false;
			logger.error('Failed to reconnect after maximum attempts');
			this.emit('error', new Error('Failed to reconnect to server'));
		});

		// Room events
		this.socket.on('room-joined', (data: { room: Room }) => {
			this.currentRoom = data.room;
			logger.info('Joined room', { roomId: data.room.id });
			this.emit('room-joined', data.room);
		});

		this.socket.on('room-left', () => {
			this.currentRoom = null;
			this.currentDocument = null;
			logger.info('Left room');
			this.emit('room-left');
		});

		this.socket.on('participant-joined', (data: { participant: Participant }) => {
			logger.info('Participant joined', { participantId: data.participant.id });
			this.emit('participant-joined', data.participant);
		});

		this.socket.on('participant-left', (data: { participant: Participant }) => {
			logger.info('Participant left', { participantId: data.participant.id });
			this.emit('participant-left', data.participant);
		});

		this.socket.on('participant-updated', (data: { participant: Participant }) => {
			this.emit('participant-updated', data.participant);
		});

		// Document events
		this.socket.on('document-updated', (data: { document: DocumentState }) => {
			this.currentDocument = data.document;
			this.emit('document-updated', data.document);
		});

		this.socket.on('operation-received', (data: { operation: CollaborationOperation }) => {
			this.handleIncomingOperation(data.operation);
		});

		this.socket.on('cursor-updated', (data: { cursor: CursorData }) => {
			this.emit('cursor-updated', data.cursor);
		});

		this.socket.on('selection-updated', (data: { selection: CursorData }) => {
			this.emit('selection-updated', data.selection);
		});

		// Sync events
		this.socket.on('sync-request', () => {
			this.handleSyncRequest();
		});

		this.socket.on('operation-acknowledged', (data: { operationId: string }) => {
			this.pendingOperations.delete(data.operationId);
		});

		// Error events
		this.socket.on('error', (error) => {
			logger.error('Socket error', error);
			this.emit('error', error);
		});
	}

	/**
	 * Join a collaboration room
	 */
	async joinRoom(roomId: string, displayName: string): Promise<Room> {
		if (!this.isConnected || !this.socket) {
			throw new Error('Not connected to collaboration server');
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('Room join timeout'));
			}, 10000);

			this.socket!.emit('join-room', {
				roomId,
				participant: {
					id: this.clientId,
					displayName,
					color: generateParticipantColor(),
				},
			}, (response: { success: boolean; room?: Room; error?: string }) => {
				clearTimeout(timeout);

				if (response.success && response.room) {
					this.currentRoom = response.room;
					resolve(response.room);
				} else {
					reject(new Error(response.error || 'Failed to join room'));
				}
			});
		});
	}

	/**
	 * Leave the current room
	 */
	async leaveRoom(): Promise<void> {
		if (!this.socket || !this.currentRoom) {
			return;
		}

		return new Promise((resolve) => {
			this.socket!.emit('leave-room', {
				roomId: this.currentRoom!.id,
				participantId: this.clientId,
			}, () => {
				this.currentRoom = null;
				this.currentDocument = null;
				resolve();
			});
		});
	}

	/**
	 * Open a document for collaboration
	 */
	async openDocument(filePath: string, content: string, language: string): Promise<DocumentState> {
		if (!this.socket || !this.currentRoom) {
			throw new Error('Not in a collaboration room');
		}

		return new Promise((resolve, reject) => {
			this.socket!.emit('open-document', {
				roomId: this.currentRoom!.id,
				filePath,
				content,
				language,
				participantId: this.clientId,
			}, (response: { success: boolean; document?: DocumentState; error?: string }) => {
				if (response.success && response.document) {
					this.currentDocument = response.document;
					resolve(response.document);
				} else {
					reject(new Error(response.error || 'Failed to open document'));
				}
			});
		});
	}

	/**
	 * Apply a text edit operation
	 */
	applyTextEdit(
		documentId: string,
		oldText: string,
		newText: string,
		startLine: number,
		startCharacter: number
	): void {
		if (!this.currentDocument || this.currentDocument.id !== documentId) {
			logger.warn('Trying to apply edit to non-current document');
			return;
		}

		try {
			const operation = createOperationFromDiff(oldText, newText);
			const collaborationOp: CollaborationOperation = {
				id: generateClientId(),
				type: 'text-edit',
				documentId,
				participantId: this.clientId,
				operation,
				timestamp: new Date().toISOString(),
				version: this.currentDocument.version + 1,
			};

			// Add to pending operations
			this.pendingOperations.set(collaborationOp.id, collaborationOp);

			// Send to server (debounced)
			this.debouncedSendOperation(collaborationOp);

			logger.debug('Applied text edit', { operationId: collaborationOp.id });
		} catch (error) {
			logger.error('Failed to apply text edit', error as Error);
		}
	}

	/**
	 * Update cursor position
	 */
	updateCursor(line: number, character: number, selection?: { start: CursorPosition; end: CursorPosition }): void {
		if (!this.currentRoom) return;

		const cursor: CursorData = {
			participantId: this.clientId,
			position: { line, character },
			selection,
			color: generateParticipantColor(),
			displayName: 'You', // This should come from participant data
		};

		this.throttledSendCursor(cursor);
	}

	/**
	 * Send operation to server
	 */
	private sendOperation(operation: CollaborationOperation): void {
		if (!this.socket || !this.isConnected) {
			this.operationQueue.push(operation);
			return;
		}

		this.socket.emit('operation', { operation });
	}

	/**
	 * Send cursor update to server
	 */
	private sendCursorUpdate(cursor: CursorData): void {
		if (!this.socket || !this.isConnected || !this.currentRoom) {
			return;
		}

		this.socket.emit('cursor-update', {
			roomId: this.currentRoom.id,
			cursor,
		});
	}

	/**
	 * Handle incoming operation from other participants
	 */
	private handleIncomingOperation(operation: CollaborationOperation): void {
		if (!this.currentDocument || operation.participantId === this.clientId) {
			return;
		}

		try {
			// Transform against pending operations
			let transformedOp = operation.operation;

			for (const pendingOp of this.pendingOperations.values()) {
				const [transformed] = transformTextOperations(transformedOp, pendingOp.operation);
				transformedOp = transformed;
			}

			// Apply the transformed operation
			this.applyOperation(transformedOp);

			// Update document version
			this.currentDocument.version = Math.max(
				this.currentDocument.version,
				operation.version
			);

			this.emit('operation-applied', operation);
			logger.debug('Applied incoming operation', { operationId: operation.id });
		} catch (error) {
			logger.error('Failed to handle incoming operation', error as Error);
		}
	}

	/**
	 * Apply an operation to the current document
	 */
	private applyOperation(operations: TextOperation[]): void {
		if (!this.currentDocument) return;

		// This would integrate with VS Code's text editor
		// For now, we just update our internal state
		// In a real implementation, this would call VS Code's edit API

		logger.debug('Operation applied to document', {
			documentId: this.currentDocument.id,
			operationCount: operations.length
		});
	}

	/**
	 * Handle sync request from server
	 */
	private handleSyncRequest(): void {
		if (!this.socket || !this.currentDocument) return;

		this.emit('sync-started');

		// Send current document state for synchronization
		this.socket.emit('sync-response', {
			documentId: this.currentDocument.id,
			content: this.currentDocument.content,
			version: this.currentDocument.version,
			pendingOperations: Array.from(this.pendingOperations.values()),
		});

		this.emit('sync-completed');
	}

	/**
	 * Handle reconnection logic
	 */
	private handleReconnection(): void {
		if (this.isReconnecting) return;

		this.isReconnecting = true;

		retryWithBackoff(
			async () => {
				if (this.socket?.connected) {
					return;
				}
				throw new Error('Still disconnected');
			},
			this.maxReconnectAttempts,
			1000
		).catch(() => {
			this.emit('error', new Error('Failed to reconnect after maximum attempts'));
		});
	}

	/**
	 * Process queued operations after reconnection
	 */
	private processQueuedOperations(): void {
		if (!this.socket || !this.isConnected) return;

		while (this.operationQueue.length > 0) {
			const operation = this.operationQueue.shift();
			if (operation) {
				this.sendOperation(operation);
			}
		}
	}

	/**
	 * Get current room
	 */
	getCurrentRoom(): Room | null {
		return this.currentRoom;
	}

	/**
	 * Get current document
	 */
	getCurrentDocument(): DocumentState | null {
		return this.currentDocument;
	}

	/**
	 * Check if connected
	 */
	isConnectedToServer(): boolean {
		return this.isConnected;
	}

	/**
	 * Get client ID
	 */
	getClientId(): string {
		return this.clientId;
	}

	/**
	 * Cleanup and disconnect
	 */
	async dispose(): Promise<void> {
		try {
			await this.leaveRoom();

			if (this.socket) {
				this.socket.disconnect();
				this.socket = null;
			}

			this.pendingOperations.clear();
			this.operationQueue.length = 0;
			this.removeAllListeners();

			logger.info('CollaborationService disposed');
		} catch (error) {
			logger.error('Error during dispose', error as Error);
		}
	}
}

// Export a singleton instance for use across VS Code
export const collaborationService = new CollaborationService();
