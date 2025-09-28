/**
 * Document synchronization service for handling version control and conflict resolution
 */
import { EventEmitter } from 'events';
import { TextOperation } from './operational-transform';
export interface DocumentVersion {
    id: string;
    version: number;
    content: string;
    checksum: string;
    timestamp: string;
    operations: SyncOperation[];
}
export interface SyncOperation {
    id: string;
    documentId: string;
    participantId: string;
    operation: TextOperation[];
    version: number;
    clientId: string;
    clientSequence: number;
    serverSequence: number;
    timestamp: string;
    applied: boolean;
}
export interface SyncState {
    documentId: string;
    localVersion: number;
    serverVersion: number;
    pendingOperations: SyncOperation[];
    issyncing: boolean;
    lastSyncTime: string;
    conflicts: ConflictResolution[];
}
export interface ConflictResolution {
    id: string;
    operation: SyncOperation;
    conflictingOperations: SyncOperation[];
    resolutionStrategy: 'client-wins' | 'server-wins' | 'merge' | 'manual';
    resolvedOperation?: SyncOperation;
    timestamp: string;
}
export interface SyncEvents {
    'sync-started': (documentId: string) => void;
    'sync-progress': (documentId: string, progress: number) => void;
    'sync-completed': (documentId: string, result: SyncResult) => void;
    'sync-failed': (documentId: string, error: Error) => void;
    'conflict-detected': (conflict: ConflictResolution) => void;
    'conflict-resolved': (conflict: ConflictResolution) => void;
    'document-updated': (document: DocumentVersion) => void;
    'operation-applied': (operation: SyncOperation) => void;
}
export interface SyncResult {
    success: boolean;
    documentId: string;
    oldVersion: number;
    newVersion: number;
    operationsApplied: number;
    conflictsResolved: number;
    duration: number;
}
export declare class DocumentSyncService extends EventEmitter {
    private syncStates;
    private syncQueue;
    private operationBuffer;
    private readonly maxBufferSize;
    private readonly syncInterval;
    private syncTimer?;
    constructor();
    /**
     * Initialize synchronization for a document
     */
    initializeDocument(documentId: string): Promise<void>;
    /**
     * Queue an operation for synchronization
     */
    queueOperation(operation: SyncOperation): void;
    /**
     * Synchronize a specific document
     */
    syncDocument(documentId: string): Promise<SyncResult>;
    /**
     * Perform the actual synchronization
     */
    private performSync;
    /**
     * Transform operations to resolve conflicts
     */
    private transformOperations;
    /**
     * Resolve a conflict using the specified strategy
     */
    private resolveConflict;
    /**
     * Merge two conflicting operations
     */
    private mergeOperations;
    /**
     * Start periodic synchronization
     */
    private startPeriodicSync;
    /**
     * Get sync status for a document
     */
    getSyncStatus(documentId: string): SyncState | null;
    /**
     * Force sync all documents
     */
    syncAll(): Promise<SyncResult[]>;
    /**
     * Cleanup and dispose resources
     */
    dispose(): void;
}
export declare const documentSyncService: DocumentSyncService;
//# sourceMappingURL=document-sync.d.ts.map