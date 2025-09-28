/**
 * Document operations API endpoint for applying collaborative edits
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import { z } from 'zod';
import { logger, createErrorResponse, createSuccessResponse } from '../../lib/utils';
import {
	TextOperation,
	transformTextOperations,
	composeTextOperations,
	applyOperationToText
} from '../../lib/operational-transform';

// Validation schemas
const operationSchema = z.object({
	type: z.enum(['insert', 'delete', 'retain']),
	position: z.number().min(0),
	content: z.string().optional(),
	length: z.number().min(0),
});

const applyOperationsSchema = z.object({
	documentId: z.string().uuid(),
	operations: z.array(operationSchema).min(1),
	clientId: z.string(),
	clientSequence: z.number().min(0),
	baseVersion: z.number().min(0),
});

const getOperationsSchema = z.object({
	documentId: z.string().uuid(),
	fromVersion: z.coerce.number().min(0).optional(),
	limit: z.coerce.number().min(1).max(100).default(50),
});

export default async function operationsHandler(
	req: VercelRequest,
	res: VercelResponse
) {
	// Set CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

	if (req.method === 'OPTIONS') {
		return res.status(200).end();
	}

	try {
		// Extract auth token
		const authHeader = req.headers.authorization;
		const token = authHeader?.replace('Bearer ', '');

		if (!token) {
			return res.status(401).json(
				createErrorResponse('Authentication required', 'AUTH_REQUIRED', 401)
			);
		}

		// Get user from token
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);

		if (authError || !user) {
			return res.status(401).json(
				createErrorResponse('Invalid authentication token', 'INVALID_TOKEN', 401)
			);
		}

		const userId = user.id;

		switch (req.method) {
			case 'GET':
				return await getOperations(req, res, userId);
			case 'POST':
				return await applyOperations(req, res, userId);
			default:
				return res.status(405).json(
					createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405)
				);
		}
	} catch (error) {
		logger.error('Operations API error', error as Error);
		return res.status(500).json(
			createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500)
		);
	}
}

async function getOperations(req: VercelRequest, res: VercelResponse, userId: string) {
	try {
		const { documentId, fromVersion, limit } = getOperationsSchema.parse(req.query);

		// Check if user has access to the document
		const { data: document, error: docError } = await supabase
			.from('documents')
			.select(`
        *,
        room:rooms!inner(
          id,
          owner_id,
          participants!inner(user_id)
        )
      `)
			.eq('id', documentId)
			.single();

		if (docError || !document) {
			return res.status(404).json(
				createErrorResponse('Document not found', 'NOT_FOUND', 404)
			);
		}

		// Check access permissions
		const hasAccess = document.room.owner_id === userId ||
			document.room.participants.some((p: any) => p.user_id === userId);

		if (!hasAccess) {
			return res.status(403).json(
				createErrorResponse('Access denied', 'ACCESS_DENIED', 403)
			);
		}

		// Get operations
		let query = supabase
			.from('operations')
			.select('*')
			.eq('document_id', documentId)
			.order('server_sequence', { ascending: true })
			.limit(limit);

		if (fromVersion !== undefined) {
			query = query.gte('server_sequence', fromVersion);
		}

		const { data: operations, error } = await query;

		if (error) {
			logger.error('Failed to fetch operations', error);
			return res.status(500).json(
				createErrorResponse('Failed to fetch operations', 'FETCH_ERROR', 500)
			);
		}

		return res.status(200).json(
			createSuccessResponse({
				operations: operations || [],
				documentVersion: document.version,
				documentId,
			})
		);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json(
				createErrorResponse('Invalid query parameters', 'VALIDATION_ERROR', 400)
			);
		}
		throw error;
	}
}

async function applyOperations(req: VercelRequest, res: VercelResponse, userId: string) {
	try {
		const { documentId, operations, clientId, clientSequence, baseVersion } =
			applyOperationsSchema.parse(req.body);

		// Get participant info
		const { data: participant, error: participantError } = await supabase
			.from('participants')
			.select(`
        id,
        role,
        room:rooms!inner(
          id,
          documents!inner(id, content, version)
        )
      `)
			.eq('user_id', userId)
			.eq('room.documents.id', documentId)
			.single();

		if (participantError || !participant) {
			return res.status(403).json(
				createErrorResponse('Access denied to document', 'ACCESS_DENIED', 403)
			);
		}

		// Check if user can edit (not viewer)
		if (participant.role === 'viewer') {
			return res.status(403).json(
				createErrorResponse('Read-only access', 'READ_ONLY', 403)
			);
		}

		const document = participant.room.documents[0];
		const currentVersion = document!.version;

		// Check if base version is too old
		if (baseVersion < currentVersion - 100) { // Allow some lag
			return res.status(409).json(
				createErrorResponse('Base version too old, sync required', 'SYNC_REQUIRED', 409)
			);
		}

		// Start transaction-like operation
		const results = [];

		try {
			// Get operations since base version for transformation
			const { data: serverOps, error: opsError } = await supabase
				.from('operations')
				.select('*')
				.eq('document_id', documentId)
				.gt('server_sequence', baseVersion)
				.order('server_sequence', { ascending: true });

			if (opsError) {
				throw new Error('Failed to fetch server operations');
			}

			// Convert operations to TextOperation format for transformation
			const clientOperations: TextOperation[] = operations.map(op => ({
				type: op.type as 'insert' | 'delete' | 'retain',
				count: op.type === 'retain' || op.type === 'delete' ? op.length : undefined,
				text: op.type === 'insert' ? op.content : undefined,
			}));

			// Transform against server operations
			let transformedOps = clientOperations;
			for (const serverOp of serverOps || []) {
				const serverOperation: TextOperation[] = [{
					type: serverOp.operation_type as 'insert' | 'delete' | 'retain',
					count: serverOp.operation_type === 'retain' || serverOp.operation_type === 'delete' ? serverOp.length || 0 : undefined,
					text: serverOp.operation_type === 'insert' ? serverOp.content || '' : undefined,
				}];

				const [transformed] = transformTextOperations(transformedOps, serverOperation);
				transformedOps = transformed;
			}

			// Apply operations to document content
			const newContent = applyOperationToText(document!.content, transformedOps);

			// Store original operations in database (not transformed ones)
			for (let i = 0; i < operations.length; i++) {
				const op = operations[i];
				if (!op) continue;

				const { data: storedOp, error: storeError } = await supabase
					.from('operations')
					.insert({
						document_id: documentId,
						participant_id: participant.id,
						operation_type: op.type,
						position: op.position,
						content: op.content || null,
						length: op.length,
						client_id: clientId,
						client_sequence: clientSequence + i,
						server_sequence: currentVersion + i + 1,
						timestamp: new Date().toISOString(),
						applied_at: new Date().toISOString(),
						vector_clock: {},
						metadata: {},
					})
					.select()
					.single();

				if (storeError) {
					throw new Error(`Failed to store operation ${i}: ${storeError.message}`);
				}

				results.push(storedOp);
			}

			// Update document
			const newVersion = currentVersion + transformedOps.length;
			const { error: updateError } = await supabase
				.from('documents')
				.update({
					content: newContent,
					version: newVersion,
					size_bytes: Buffer.byteLength(newContent, 'utf8'),
					line_count: newContent.split('\n').length,
					last_operation_timestamp: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.eq('id', documentId);

			if (updateError) {
				throw new Error(`Failed to update document: ${updateError.message}`);
			}

			logger.info('Operations applied successfully', {
				documentId,
				operationsCount: transformedOps.length,
				newVersion,
				participantId: participant.id,
			});

			return res.status(200).json(
				createSuccessResponse({
					operations: results,
					newVersion,
					documentId,
					transformed: transformedOps.length !== operations.length,
				}, 'Operations applied successfully')
			);

		} catch (operationError) {
			logger.error('Failed to apply operations', operationError as Error);
			return res.status(500).json(
				createErrorResponse('Failed to apply operations', 'OPERATION_ERROR', 500)
			);
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json(
				createErrorResponse('Invalid request body', 'VALIDATION_ERROR', 400)
			);
		}
		throw error;
	}
}
