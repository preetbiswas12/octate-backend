"use strict";
/**
 * Client-side collaboration service for VS Code Octate
 * This service manages real-time collaboration features including:
 * - Room management
 * - Real-time document synchronization
 * - Cursor and selection sharing
 * - Participant presence
 * - Conflict resolution using Operational Transforms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.collaborationService = exports.CollaborationService = void 0;
const socket_io_client_1 = require("socket.io-client");
const events_1 = require("events");
const operational_transform_1 = require("./operational-transform");
const utils_1 = require("./utils");
class CollaborationService extends events_1.EventEmitter {
    constructor(serverUrl = 'http://localhost:3000') {
        super();
        this.socket = null;
        this.currentRoom = null;
        this.currentDocument = null;
        this.pendingOperations = new Map();
        this.operationQueue = [];
        this.isConnected = false;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.authToken = null;
        this.serverUrl = serverUrl;
        this.clientId = (0, utils_1.generateClientId)();
        // Create throttled methods
        this.throttledSendCursor = (0, utils_1.throttle)(this.sendCursorUpdate.bind(this), 100);
        this.debouncedSendOperation = (0, utils_1.debounce)(this.sendOperation.bind(this), 50);
        utils_1.logger.debug('CollaborationService initialized', { clientId: this.clientId });
    }
    /**
     * Initialize the collaboration service
     */
    async initialize(authToken) {
        try {
            this.authToken = authToken || null;
            await this.connect();
            utils_1.logger.info('CollaborationService initialized successfully');
        }
        catch (error) {
            utils_1.logger.error('Failed to initialize CollaborationService', error);
            throw error;
        }
    }
    /**
     * Connect to the collaboration server
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.socket = (0, socket_io_client_1.io)(this.serverUrl, {
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
                    utils_1.logger.info('Connected to collaboration server');
                    this.emit('connected');
                    resolve();
                });
                this.socket.on('connect_error', (error) => {
                    utils_1.logger.error('Connection error', error);
                    this.emit('error', error);
                    reject(error);
                });
            }
            catch (error) {
                utils_1.logger.error('Failed to create socket connection', error);
                reject(error);
            }
        });
    }
    /**
     * Setup socket event listeners
     */
    setupSocketListeners() {
        if (!this.socket)
            return;
        // Connection events
        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            utils_1.logger.warn('Disconnected from server', { reason });
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
            utils_1.logger.info('Reconnected to server', { attemptNumber });
            this.emit('connected');
        });
        this.socket.on('reconnect_attempt', (attemptNumber) => {
            this.isReconnecting = true;
            this.reconnectAttempts = attemptNumber;
            utils_1.logger.debug('Attempting to reconnect', { attemptNumber });
            this.emit('reconnecting', attemptNumber);
        });
        this.socket.on('reconnect_failed', () => {
            this.isReconnecting = false;
            utils_1.logger.error('Failed to reconnect after maximum attempts');
            this.emit('error', new Error('Failed to reconnect to server'));
        });
        // Room events
        this.socket.on('room-joined', (data) => {
            this.currentRoom = data.room;
            utils_1.logger.info('Joined room', { roomId: data.room.id });
            this.emit('room-joined', data.room);
        });
        this.socket.on('room-left', () => {
            this.currentRoom = null;
            this.currentDocument = null;
            utils_1.logger.info('Left room');
            this.emit('room-left');
        });
        this.socket.on('participant-joined', (data) => {
            utils_1.logger.info('Participant joined', { participantId: data.participant.id });
            this.emit('participant-joined', data.participant);
        });
        this.socket.on('participant-left', (data) => {
            utils_1.logger.info('Participant left', { participantId: data.participant.id });
            this.emit('participant-left', data.participant);
        });
        this.socket.on('participant-updated', (data) => {
            this.emit('participant-updated', data.participant);
        });
        // Document events
        this.socket.on('document-updated', (data) => {
            this.currentDocument = data.document;
            this.emit('document-updated', data.document);
        });
        this.socket.on('operation-received', (data) => {
            this.handleIncomingOperation(data.operation);
        });
        this.socket.on('cursor-updated', (data) => {
            this.emit('cursor-updated', data.cursor);
        });
        this.socket.on('selection-updated', (data) => {
            this.emit('selection-updated', data.selection);
        });
        // Sync events
        this.socket.on('sync-request', () => {
            this.handleSyncRequest();
        });
        this.socket.on('operation-acknowledged', (data) => {
            this.pendingOperations.delete(data.operationId);
        });
        // Error events
        this.socket.on('error', (error) => {
            utils_1.logger.error('Socket error', error);
            this.emit('error', error);
        });
    }
    /**
     * Join a collaboration room
     */
    async joinRoom(roomId, displayName) {
        if (!this.isConnected || !this.socket) {
            throw new Error('Not connected to collaboration server');
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Room join timeout'));
            }, 10000);
            this.socket.emit('join-room', {
                roomId,
                participant: {
                    id: this.clientId,
                    displayName,
                    color: (0, utils_1.generateParticipantColor)(),
                },
            }, (response) => {
                clearTimeout(timeout);
                if (response.success && response.room) {
                    this.currentRoom = response.room;
                    resolve(response.room);
                }
                else {
                    reject(new Error(response.error || 'Failed to join room'));
                }
            });
        });
    }
    /**
     * Leave the current room
     */
    async leaveRoom() {
        if (!this.socket || !this.currentRoom) {
            return;
        }
        return new Promise((resolve) => {
            this.socket.emit('leave-room', {
                roomId: this.currentRoom.id,
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
    async openDocument(filePath, content, language) {
        if (!this.socket || !this.currentRoom) {
            throw new Error('Not in a collaboration room');
        }
        return new Promise((resolve, reject) => {
            this.socket.emit('open-document', {
                roomId: this.currentRoom.id,
                filePath,
                content,
                language,
                participantId: this.clientId,
            }, (response) => {
                if (response.success && response.document) {
                    this.currentDocument = response.document;
                    resolve(response.document);
                }
                else {
                    reject(new Error(response.error || 'Failed to open document'));
                }
            });
        });
    }
    /**
     * Apply a text edit operation
     */
    applyTextEdit(documentId, oldText, newText, startLine, startCharacter) {
        if (!this.currentDocument || this.currentDocument.id !== documentId) {
            utils_1.logger.warn('Trying to apply edit to non-current document');
            return;
        }
        try {
            const operation = (0, operational_transform_1.createOperationFromDiff)(oldText, newText);
            const collaborationOp = {
                id: (0, utils_1.generateClientId)(),
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
            utils_1.logger.debug('Applied text edit', { operationId: collaborationOp.id });
        }
        catch (error) {
            utils_1.logger.error('Failed to apply text edit', error);
        }
    }
    /**
     * Update cursor position
     */
    updateCursor(line, character, selection) {
        if (!this.currentRoom)
            return;
        const cursor = {
            participantId: this.clientId,
            position: { line, character },
            selection,
            color: (0, utils_1.generateParticipantColor)(),
            displayName: 'You', // This should come from participant data
        };
        this.throttledSendCursor(cursor);
    }
    /**
     * Send operation to server
     */
    sendOperation(operation) {
        if (!this.socket || !this.isConnected) {
            this.operationQueue.push(operation);
            return;
        }
        this.socket.emit('operation', { operation });
    }
    /**
     * Send cursor update to server
     */
    sendCursorUpdate(cursor) {
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
    handleIncomingOperation(operation) {
        if (!this.currentDocument || operation.participantId === this.clientId) {
            return;
        }
        try {
            // Transform against pending operations
            let transformedOp = operation.operation;
            for (const pendingOp of this.pendingOperations.values()) {
                const [transformed] = (0, operational_transform_1.transformTextOperations)(transformedOp, pendingOp.operation);
                transformedOp = transformed;
            }
            // Apply the transformed operation
            this.applyOperation(transformedOp);
            // Update document version
            this.currentDocument.version = Math.max(this.currentDocument.version, operation.version);
            this.emit('operation-applied', operation);
            utils_1.logger.debug('Applied incoming operation', { operationId: operation.id });
        }
        catch (error) {
            utils_1.logger.error('Failed to handle incoming operation', error);
        }
    }
    /**
     * Apply an operation to the current document
     */
    applyOperation(operations) {
        if (!this.currentDocument)
            return;
        // This would integrate with VS Code's text editor
        // For now, we just update our internal state
        // In a real implementation, this would call VS Code's edit API
        utils_1.logger.debug('Operation applied to document', {
            documentId: this.currentDocument.id,
            operationCount: operations.length
        });
    }
    /**
     * Handle sync request from server
     */
    handleSyncRequest() {
        if (!this.socket || !this.currentDocument)
            return;
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
    handleReconnection() {
        if (this.isReconnecting)
            return;
        this.isReconnecting = true;
        (0, utils_1.retryWithBackoff)(async () => {
            if (this.socket?.connected) {
                return;
            }
            throw new Error('Still disconnected');
        }, this.maxReconnectAttempts, 1000).catch(() => {
            this.emit('error', new Error('Failed to reconnect after maximum attempts'));
        });
    }
    /**
     * Process queued operations after reconnection
     */
    processQueuedOperations() {
        if (!this.socket || !this.isConnected)
            return;
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
    getCurrentRoom() {
        return this.currentRoom;
    }
    /**
     * Get current document
     */
    getCurrentDocument() {
        return this.currentDocument;
    }
    /**
     * Check if connected
     */
    isConnectedToServer() {
        return this.isConnected;
    }
    /**
     * Get client ID
     */
    getClientId() {
        return this.clientId;
    }
    /**
     * Cleanup and disconnect
     */
    async dispose() {
        try {
            await this.leaveRoom();
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
            }
            this.pendingOperations.clear();
            this.operationQueue.length = 0;
            this.removeAllListeners();
            utils_1.logger.info('CollaborationService disposed');
        }
        catch (error) {
            utils_1.logger.error('Error during dispose', error);
        }
    }
}
exports.CollaborationService = CollaborationService;
// Export a singleton instance for use across VS Code
exports.collaborationService = new CollaborationService();
//# sourceMappingURL=collaboration-service.js.map