"use strict";
/**
 * Document synchronization service for handling version control and conflict resolution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentSyncService = exports.DocumentSyncService = void 0;
const events_1 = require("events");
const supabase_1 = require("./supabase");
const operational_transform_1 = require("./operational-transform");
const utils_1 = require("./utils");
class DocumentSyncService extends events_1.EventEmitter {
    constructor() {
        super();
        this.syncStates = new Map();
        this.syncQueue = new Map();
        this.operationBuffer = new Map();
        this.maxBufferSize = 1000;
        this.syncInterval = 5000; // 5 seconds
        this.startPeriodicSync();
        utils_1.logger.info('DocumentSyncService initialized');
    }
    /**
     * Initialize synchronization for a document
     */
    async initializeDocument(documentId) {
        try {
            // Get document from database
            const { data: document, error } = await supabase_1.supabase
                .from('documents')
                .select('*')
                .eq('id', documentId)
                .single();
            if (error || !document) {
                throw new Error(`Document not found: ${documentId}`);
            }
            // Initialize sync state
            const syncState = {
                documentId,
                localVersion: document.version,
                serverVersion: document.version,
                pendingOperations: [],
                issyncing: false,
                lastSyncTime: new Date().toISOString(),
                conflicts: [],
            };
            this.syncStates.set(documentId, syncState);
            this.operationBuffer.set(documentId, []);
            utils_1.logger.info('Document sync initialized', { documentId, version: document.version });
        }
        catch (error) {
            utils_1.logger.error('Failed to initialize document sync', error);
            throw error;
        }
    }
    /**
     * Queue an operation for synchronization
     */
    queueOperation(operation) {
        const buffer = this.operationBuffer.get(operation.documentId);
        if (!buffer) {
            utils_1.logger.warn('Document not initialized for sync', { documentId: operation.documentId });
            return;
        }
        // Add to buffer
        buffer.push(operation);
        // Prevent buffer overflow
        if (buffer.length > this.maxBufferSize) {
            buffer.shift(); // Remove oldest operation
        }
        // Update sync state
        const syncState = this.syncStates.get(operation.documentId);
        if (syncState) {
            syncState.pendingOperations.push(operation);
        }
        // Trigger immediate sync if buffer is large
        if (buffer.length > 10) {
            this.syncDocument(operation.documentId);
        }
        utils_1.logger.debug('Operation queued for sync', {
            operationId: operation.id,
            documentId: operation.documentId,
            bufferSize: buffer.length,
        });
    }
    /**
     * Synchronize a specific document
     */
    async syncDocument(documentId) {
        // Check if sync is already in progress
        const existingSync = this.syncQueue.get(documentId);
        if (existingSync) {
            return existingSync;
        }
        const syncPromise = this.performSync(documentId);
        this.syncQueue.set(documentId, syncPromise);
        try {
            const result = await syncPromise;
            return result;
        }
        finally {
            this.syncQueue.delete(documentId);
        }
    }
    /**
     * Perform the actual synchronization
     */
    async performSync(documentId) {
        const startTime = Date.now();
        const syncState = this.syncStates.get(documentId);
        if (!syncState) {
            throw new Error(`Document not initialized: ${documentId}`);
        }
        if (syncState.issyncing) {
            throw new Error(`Sync already in progress: ${documentId}`);
        }
        syncState.issyncing = true;
        this.emit('sync-started', documentId);
        try {
            utils_1.logger.info('Starting document sync', { documentId });
            // Get current server state
            const { data: serverDocument, error: docError } = await supabase_1.supabase
                .from('documents')
                .select('*')
                .eq('id', documentId)
                .single();
            if (docError || !serverDocument) {
                throw new Error(`Failed to fetch server document: ${docError?.message}`);
            }
            // Get server operations since last sync
            const { data: serverOperations, error: opsError } = await supabase_1.supabase
                .from('operations')
                .select('*')
                .eq('document_id', documentId)
                .gt('server_sequence', syncState.serverVersion)
                .order('server_sequence', { ascending: true });
            if (opsError) {
                throw new Error(`Failed to fetch server operations: ${opsError.message}`);
            }
            const operations = serverOperations || [];
            let operationsApplied = 0;
            let conflictsResolved = 0;
            // Transform and apply server operations
            if (operations.length > 0) {
                this.emit('sync-progress', documentId, 0.3);
                const transformedOps = await this.transformOperations(operations.map(op => ({
                    id: op.id,
                    documentId: op.document_id,
                    participantId: op.participant_id,
                    operation: [{
                            type: op.operation_type,
                            count: op.length || undefined,
                            text: op.content || undefined,
                        }],
                    version: op.server_sequence,
                    clientId: op.client_id,
                    clientSequence: op.client_sequence,
                    serverSequence: op.server_sequence,
                    timestamp: op.timestamp,
                    applied: op.applied_at !== null,
                })), syncState.pendingOperations);
                operationsApplied = transformedOps.length;
                // Apply operations to local state
                for (const op of transformedOps) {
                    this.emit('operation-applied', op);
                }
                this.emit('sync-progress', documentId, 0.6);
            }
            // Send pending operations to server
            if (syncState.pendingOperations.length > 0) {
                const pendingOps = syncState.pendingOperations.slice();
                for (const operation of pendingOps) {
                    try {
                        // Convert TextOperation[] back to database format
                        const firstOp = operation.operation[0];
                        const { error } = await supabase_1.supabase
                            .from('operations')
                            .insert({
                            document_id: operation.documentId,
                            participant_id: operation.participantId,
                            operation_type: firstOp?.type || 'retain',
                            position: 0, // Will be calculated based on operation
                            content: firstOp?.text || null,
                            length: firstOp?.count || 0,
                            client_id: operation.clientId,
                            client_sequence: operation.clientSequence,
                            timestamp: operation.timestamp,
                            vector_clock: {},
                            metadata: {},
                        });
                        if (error) {
                            utils_1.logger.error('Failed to send operation to server', error);
                            // Keep operation in pending queue
                            continue;
                        }
                        // Remove from pending operations
                        const index = syncState.pendingOperations.indexOf(operation);
                        if (index > -1) {
                            syncState.pendingOperations.splice(index, 1);
                        }
                    }
                    catch (error) {
                        utils_1.logger.error('Error sending operation to server', error);
                    }
                }
                this.emit('sync-progress', documentId, 0.9);
            }
            // Update sync state
            syncState.serverVersion = serverDocument.version;
            syncState.localVersion = serverDocument.version;
            syncState.lastSyncTime = new Date().toISOString();
            // Clear operation buffer
            this.operationBuffer.set(documentId, []);
            const duration = Date.now() - startTime;
            const result = {
                success: true,
                documentId,
                oldVersion: syncState.localVersion,
                newVersion: serverDocument.version,
                operationsApplied,
                conflictsResolved,
                duration,
            };
            this.emit('sync-completed', documentId, result);
            utils_1.logger.info('Document sync completed', { documentId, result });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const result = {
                success: false,
                documentId,
                oldVersion: syncState.localVersion,
                newVersion: syncState.localVersion,
                operationsApplied: 0,
                conflictsResolved: 0,
                duration,
            };
            this.emit('sync-failed', documentId, error);
            utils_1.logger.error('Document sync failed', error);
            return result;
        }
        finally {
            syncState.issyncing = false;
        }
    }
    /**
     * Transform operations to resolve conflicts
     */
    async transformOperations(serverOperations, localOperations) {
        const transformedOperations = [];
        for (const serverOp of serverOperations) {
            let transformedOp = serverOp;
            // Transform against all local operations
            for (const localOp of localOperations) {
                try {
                    const [transformed] = (0, operational_transform_1.transformTextOperations)(transformedOp.operation, localOp.operation);
                    transformedOp = {
                        ...transformedOp,
                        operation: transformed,
                    };
                }
                catch (error) {
                    utils_1.logger.warn('Operation transformation failed', error);
                    // Create conflict resolution
                    const conflict = {
                        id: `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        operation: serverOp,
                        conflictingOperations: [localOp],
                        resolutionStrategy: 'server-wins', // Default strategy
                        timestamp: new Date().toISOString(),
                    };
                    this.emit('conflict-detected', conflict);
                    // Apply resolution strategy
                    const resolved = await this.resolveConflict(conflict);
                    if (resolved.resolvedOperation) {
                        transformedOp = resolved.resolvedOperation;
                    }
                }
            }
            transformedOperations.push(transformedOp);
        }
        return transformedOperations;
    }
    /**
     * Resolve a conflict using the specified strategy
     */
    async resolveConflict(conflict) {
        utils_1.logger.info('Resolving conflict', { conflictId: conflict.id, strategy: conflict.resolutionStrategy });
        switch (conflict.resolutionStrategy) {
            case 'server-wins':
                conflict.resolvedOperation = conflict.operation;
                break;
            case 'client-wins':
                // Keep the original operation
                conflict.resolvedOperation = conflict.operation;
                break;
            case 'merge':
                // Attempt to merge operations
                try {
                    const conflictingOp = conflict.conflictingOperations[0];
                    if (conflictingOp) {
                        const mergedOperation = this.mergeOperations(conflict.operation, conflictingOp);
                        conflict.resolvedOperation = mergedOperation;
                    }
                }
                catch (error) {
                    utils_1.logger.warn('Failed to merge operations, falling back to server-wins', error);
                    conflict.resolvedOperation = conflict.operation;
                }
                break;
            case 'manual':
                // Manual resolution required - emit event and wait
                this.emit('conflict-detected', conflict);
                // For now, fall back to server-wins
                conflict.resolvedOperation = conflict.operation;
                break;
            default:
                conflict.resolvedOperation = conflict.operation;
        }
        this.emit('conflict-resolved', conflict);
        return conflict;
    }
    /**
     * Merge two conflicting operations
     */
    mergeOperations(op1, op2) {
        // Simple merge strategy - compose operations
        try {
            const mergedOperation = (0, operational_transform_1.composeTextOperations)(op1.operation, op2.operation);
            return {
                ...op1,
                id: `merged_${op1.id}_${op2.id}`,
                operation: mergedOperation,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            throw new Error(`Failed to merge operations: ${error.message}`);
        }
    }
    /**
     * Start periodic synchronization
     */
    startPeriodicSync() {
        this.syncTimer = setInterval(() => {
            // Sync all documents with pending operations
            for (const [documentId, syncState] of this.syncStates) {
                if (syncState.pendingOperations.length > 0 && !syncState.issyncing) {
                    this.syncDocument(documentId).catch(error => {
                        utils_1.logger.error('Periodic sync failed', error);
                    });
                }
            }
        }, this.syncInterval);
        utils_1.logger.info('Periodic sync started', { interval: this.syncInterval });
    }
    /**
     * Get sync status for a document
     */
    getSyncStatus(documentId) {
        return this.syncStates.get(documentId) || null;
    }
    /**
     * Force sync all documents
     */
    async syncAll() {
        const results = [];
        for (const documentId of this.syncStates.keys()) {
            try {
                const result = await this.syncDocument(documentId);
                results.push(result);
            }
            catch (error) {
                utils_1.logger.error('Failed to sync document', error);
                results.push({
                    success: false,
                    documentId,
                    oldVersion: 0,
                    newVersion: 0,
                    operationsApplied: 0,
                    conflictsResolved: 0,
                    duration: 0,
                });
            }
        }
        return results;
    }
    /**
     * Cleanup and dispose resources
     */
    dispose() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = undefined;
        }
        this.syncStates.clear();
        this.syncQueue.clear();
        this.operationBuffer.clear();
        this.removeAllListeners();
        utils_1.logger.info('DocumentSyncService disposed');
    }
}
exports.DocumentSyncService = DocumentSyncService;
// Export singleton instance
exports.documentSyncService = new DocumentSyncService();
//# sourceMappingURL=document-sync.js.map