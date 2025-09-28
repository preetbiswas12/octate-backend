/**
 * Client-side collaboration service for VS Code Octate
 * This service manages real-time collaboration features including:
 * - Room management
 * - Real-time document synchronization
 * - Cursor and selection sharing
 * - Participant presence
 * - Conflict resolution using Operational Transforms
 */
import { EventEmitter } from 'events';
import { TextOperation } from './operational-transform';
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
    'connected': () => void;
    'disconnected': () => void;
    'error': (error: Error) => void;
    'reconnecting': (attemptNumber: number) => void;
    'room-joined': (room: Room) => void;
    'room-left': () => void;
    'participant-joined': (participant: Participant) => void;
    'participant-left': (participant: Participant) => void;
    'participant-updated': (participant: Participant) => void;
    'document-updated': (document: DocumentState) => void;
    'operation-applied': (operation: CollaborationOperation) => void;
    'cursor-updated': (cursor: CursorData) => void;
    'selection-updated': (selection: CursorData) => void;
    'sync-started': () => void;
    'sync-completed': () => void;
    'conflict-resolved': (operation: CollaborationOperation) => void;
}
export declare class CollaborationService extends EventEmitter {
    private socket;
    private clientId;
    private currentRoom;
    private currentDocument;
    private pendingOperations;
    private operationQueue;
    private isConnected;
    private isReconnecting;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private serverUrl;
    private authToken;
    private throttledSendCursor;
    private debouncedSendOperation;
    constructor(serverUrl?: string);
    /**
     * Initialize the collaboration service
     */
    initialize(authToken?: string): Promise<void>;
    /**
     * Connect to the collaboration server
     */
    private connect;
    /**
     * Setup socket event listeners
     */
    private setupSocketListeners;
    /**
     * Join a collaboration room
     */
    joinRoom(roomId: string, displayName: string): Promise<Room>;
    /**
     * Leave the current room
     */
    leaveRoom(): Promise<void>;
    /**
     * Open a document for collaboration
     */
    openDocument(filePath: string, content: string, language: string): Promise<DocumentState>;
    /**
     * Apply a text edit operation
     */
    applyTextEdit(documentId: string, oldText: string, newText: string, startLine: number, startCharacter: number): void;
    /**
     * Update cursor position
     */
    updateCursor(line: number, character: number, selection?: {
        start: CursorPosition;
        end: CursorPosition;
    }): void;
    /**
     * Send operation to server
     */
    private sendOperation;
    /**
     * Send cursor update to server
     */
    private sendCursorUpdate;
    /**
     * Handle incoming operation from other participants
     */
    private handleIncomingOperation;
    /**
     * Apply an operation to the current document
     */
    private applyOperation;
    /**
     * Handle sync request from server
     */
    private handleSyncRequest;
    /**
     * Handle reconnection logic
     */
    private handleReconnection;
    /**
     * Process queued operations after reconnection
     */
    private processQueuedOperations;
    /**
     * Get current room
     */
    getCurrentRoom(): Room | null;
    /**
     * Get current document
     */
    getCurrentDocument(): DocumentState | null;
    /**
     * Check if connected
     */
    isConnectedToServer(): boolean;
    /**
     * Get client ID
     */
    getClientId(): string;
    /**
     * Cleanup and disconnect
     */
    dispose(): Promise<void>;
}
export declare const collaborationService: CollaborationService;
//# sourceMappingURL=collaboration-service.d.ts.map