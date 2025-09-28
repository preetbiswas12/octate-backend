/**
 * Document synchronization service for handling version control and conflict resolution
 */

import { EventEmitter } from 'events';
import { supabase } from './supabase';
import {
	TextOperation,
	transformTextOperations,
	composeTextOperations,
	applyOperationToText,
	createOperationFromDiff
} from './operational-transform';
import { logger, debounce, throttle } from './utils';

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

export class DocumentSyncService extends EventEmitter {
	private syncStates = new Map<string, SyncState>();
	private syncQueue = new Map<string, Promise<SyncResult>>();
	private operationBuffer = new Map<string, SyncOperation[]>();
	private readonly maxBufferSize = 1000;
	private readonly syncInterval = 5000; // 5 seconds
	private syncTimer?: NodeJS.Timeout;

	constructor() {
		super();
		this.startPeriodicSync();
		logger.info('DocumentSyncService initialized');
	}

	/**
	 * Initialize synchronization for a document
	 */
	async initializeDocument(documentId: string): Promise<void> {
		try {
			// Get document from database
			const { data: document, error } = await supabase
				.from('documents')
				.select('*')
				.eq('id', documentId)
				.single();

			if (error || !document) {
				throw new Error(`Document not found: ${documentId}`);
			}

			// Initialize sync state
			const syncState: SyncState = {
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

			logger.info('Document sync initialized', { documentId, version: document.version });
		} catch (error) {
			logger.error('Failed to initialize document sync', error as Error);
			throw error;
		}
	}

	/**
	 * Queue an operation for synchronization
	 */
	queueOperation(operation: SyncOperation): void {
		const buffer = this.operationBuffer.get(operation.documentId);
		if (!buffer) {
			logger.warn('Document not initialized for sync', { documentId: operation.documentId });
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

		logger.debug('Operation queued for sync', {
			operationId: operation.id,
			documentId: operation.documentId,
			bufferSize: buffer.length,
		});
	}

	/**
	 * Synchronize a specific document
	 */
	async syncDocument(documentId: string): Promise<SyncResult> {
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
		} finally {
			this.syncQueue.delete(documentId);
		}
	}

	/**
	 * Perform the actual synchronization
	 */
	private async performSync(documentId: string): Promise<SyncResult> {
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
			logger.info('Starting document sync', { documentId });

			// Get current server state
			const { data: serverDocument, error: docError } = await supabase
				.from('documents')
				.select('*')
				.eq('id', documentId)
				.single();

			if (docError || !serverDocument) {
				throw new Error(`Failed to fetch server document: ${docError?.message}`);
			}

			// Get server operations since last sync
			const { data: serverOperations, error: opsError } = await supabase
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

				const transformedOps = await this.transformOperations(
					operations.map(op => ({
						id: op.id,
						documentId: op.document_id,
						participantId: op.participant_id,
						operation: [{
							type: op.operation_type as 'insert' | 'delete' | 'retain',
							count: op.length || undefined,
							text: op.content || undefined,
						}],
						version: op.server_sequence,
						clientId: op.client_id,
						clientSequence: op.client_sequence,
						serverSequence: op.server_sequence,
						timestamp: op.timestamp,
						applied: op.applied_at !== null,
					})),
					syncState.pendingOperations
				);

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
						const { error } = await supabase
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
							logger.error('Failed to send operation to server', error);
							// Keep operation in pending queue
							continue;
						}

						// Remove from pending operations
						const index = syncState.pendingOperations.indexOf(operation);
						if (index > -1) {
							syncState.pendingOperations.splice(index, 1);
						}

					} catch (error) {
						logger.error('Error sending operation to server', error as Error);
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
			const result: SyncResult = {
				success: true,
				documentId,
				oldVersion: syncState.localVersion,
				newVersion: serverDocument.version,
				operationsApplied,
				conflictsResolved,
				duration,
			};

			this.emit('sync-completed', documentId, result);
			logger.info('Document sync completed', { documentId, result });

			return result;

		} catch (error) {
			const duration = Date.now() - startTime;
			const result: SyncResult = {
				success: false,
				documentId,
				oldVersion: syncState.localVersion,
				newVersion: syncState.localVersion,
				operationsApplied: 0,
				conflictsResolved: 0,
				duration,
			};

			this.emit('sync-failed', documentId, error as Error);
			logger.error('Document sync failed', error as Error);

			return result;

		} finally {
			syncState.issyncing = false;
		}
	}

	/**
	 * Transform operations to resolve conflicts
	 */
	private async transformOperations(
		serverOperations: SyncOperation[],
		localOperations: SyncOperation[]
	): Promise<SyncOperation[]> {
		const transformedOperations: SyncOperation[] = [];

		for (const serverOp of serverOperations) {
			let transformedOp = serverOp;

			// Transform against all local operations
			for (const localOp of localOperations) {
				try {
					const [transformed] = transformTextOperations(
						transformedOp.operation,
						localOp.operation
					);

					transformedOp = {
						...transformedOp,
						operation: transformed,
					};

				} catch (error) {
					logger.warn('Operation transformation failed', error as Error);

					// Create conflict resolution
					const conflict: ConflictResolution = {
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
	private async resolveConflict(conflict: ConflictResolution): Promise<ConflictResolution> {
		logger.info('Resolving conflict', { conflictId: conflict.id, strategy: conflict.resolutionStrategy });

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
						const mergedOperation = this.mergeOperations(
							conflict.operation,
							conflictingOp
						);
						conflict.resolvedOperation = mergedOperation;
					}
				} catch (error) {
					logger.warn('Failed to merge operations, falling back to server-wins', error as Error);
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
	private mergeOperations(op1: SyncOperation, op2: SyncOperation): SyncOperation {
		// Simple merge strategy - compose operations
		try {
			const mergedOperation = composeTextOperations(op1.operation, op2.operation);

			return {
				...op1,
				id: `merged_${op1.id}_${op2.id}`,
				operation: mergedOperation,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			throw new Error(`Failed to merge operations: ${(error as Error).message}`);
		}
	}

	/**
	 * Start periodic synchronization
	 */
	private startPeriodicSync(): void {
		this.syncTimer = setInterval(() => {
			// Sync all documents with pending operations
			for (const [documentId, syncState] of this.syncStates) {
				if (syncState.pendingOperations.length > 0 && !syncState.issyncing) {
					this.syncDocument(documentId).catch(error => {
						logger.error('Periodic sync failed', error);
					});
				}
			}
		}, this.syncInterval);

		logger.info('Periodic sync started', { interval: this.syncInterval });
	}

	/**
	 * Get sync status for a document
	 */
	getSyncStatus(documentId: string): SyncState | null {
		return this.syncStates.get(documentId) || null;
	}

	/**
	 * Force sync all documents
	 */
	async syncAll(): Promise<SyncResult[]> {
		const results: SyncResult[] = [];

		for (const documentId of this.syncStates.keys()) {
			try {
				const result = await this.syncDocument(documentId);
				results.push(result);
			} catch (error) {
				logger.error('Failed to sync document', error as Error);
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
	dispose(): void {
		if (this.syncTimer) {
			clearInterval(this.syncTimer);
			this.syncTimer = undefined;
		}

		this.syncStates.clear();
		this.syncQueue.clear();
		this.operationBuffer.clear();
		this.removeAllListeners();

		logger.info('DocumentSyncService disposed');
	}
}

// Export singleton instance
export const documentSyncService = new DocumentSyncService();
