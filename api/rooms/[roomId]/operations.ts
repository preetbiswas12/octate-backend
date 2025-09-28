import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, OperationInsert, OperationType } from '../../../lib/supabase';
import { z } from 'zod';

// Request validation schemas
const applyOperationSchema = z.object({
	documentId: z.string().uuid(),
	operations: z.array(z.object({
		type: z.enum(['insert', 'delete', 'retain', 'cursor_move', 'selection_change']),
		position: z.number().min(0),
		length: z.number().min(0).optional(),
		content: z.string().optional(),
		clientId: z.string().uuid(),
		clientSequence: z.number().min(0),
	})),
});

const getOperationsSchema = z.object({
	documentId: z.string().uuid(),
	since: z.number().optional(), // server sequence number
	limit: z.number().min(1).max(1000).default(100),
});

// CORS headers
const corsHeaders = {
	'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

class APIError extends Error {
	constructor(
		message: string,
		public statusCode: number = 500,
		public code?: string
	) {
		super(message);
		this.name = 'APIError';
	}
}

async function getAuthenticatedUser(req: VercelRequest) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new APIError('Missing or invalid authorization header', 401, 'UNAUTHORIZED');
	}

	const token = authHeader.substring(7);
	const { data: { user }, error } = await supabase.auth.getUser(token);

	if (error || !user) {
		throw new APIError('Invalid authentication token', 401, 'UNAUTHORIZED');
	}

	return user;
}

async function checkRoomAccess(userId: string, roomId: string) {
	const { data: participant, error } = await supabase
		.from('participants')
		.select('id, role')
		.eq('room_id', roomId)
		.eq('user_id', userId)
		.single();

	if (error || !participant) {
		throw new APIError('Access denied to this room', 403, 'ACCESS_DENIED');
	}

	return participant;
}

// Operational Transform helper functions
function transformOperation(op1: any, op2: any): any {
	// Simplified OT implementation
	// In production, use a proper OT library like ShareJS or Yjs

	if (op1.type === 'insert' && op2.type === 'insert') {
		if (op1.position <= op2.position) {
			return { ...op2, position: op2.position + (op1.content?.length || 0) };
		}
		return op2;
	}

	if (op1.type === 'delete' && op2.type === 'insert') {
		if (op1.position < op2.position) {
			return { ...op2, position: Math.max(op1.position, op2.position - (op1.length || 0)) };
		}
		return op2;
	}

	if (op1.type === 'insert' && op2.type === 'delete') {
		if (op1.position <= op2.position) {
			return { ...op2, position: op2.position + (op1.content?.length || 0) };
		}
		return op2;
	}

	if (op1.type === 'delete' && op2.type === 'delete') {
		if (op1.position <= op2.position) {
			return { ...op2, position: Math.max(op1.position, op2.position - (op1.length || 0)) };
		}
		return op2;
	}

	return op2;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	// Handle CORS
	if (req.method === 'OPTIONS') {
		Object.entries(corsHeaders).forEach(([key, value]) => {
			res.setHeader(key, value);
		});
		return res.status(200).end();
	}

	// Set CORS headers
	Object.entries(corsHeaders).forEach(([key, value]) => {
		res.setHeader(key, value);
	});

	try {
		const { roomId } = req.query;

		if (!roomId || typeof roomId !== 'string') {
			throw new APIError('Room ID is required', 400, 'MISSING_ROOM_ID');
		}

		switch (req.method) {
			case 'GET':
				return await handleGetOperations(req, res, roomId);
			case 'POST':
				return await handleApplyOperations(req, res, roomId);
			default:
				throw new APIError(`Method ${req.method} not allowed`, 405, 'METHOD_NOT_ALLOWED');
		}
	} catch (error) {
		console.error('API Error:', error);

		if (error instanceof APIError) {
			return res.status(error.statusCode).json({
				error: error.message,
				code: error.code,
			});
		}

		return res.status(500).json({
			error: 'Internal server error',
			code: 'INTERNAL_ERROR',
		});
	}
}

async function handleGetOperations(req: VercelRequest, res: VercelResponse, roomId: string) {
	const user = await getAuthenticatedUser(req);
	await checkRoomAccess(user.id, roomId);

	const validatedData = getOperationsSchema.parse(req.query);

	// Build query
	let query = supabase
		.from('operations')
		.select(`
      *,
      document:documents!inner(id, room_id),
      participant:participants!inner(id, display_name, color)
    `)
		.eq('document.room_id', roomId)
		.order('server_sequence', { ascending: true })
		.limit(validatedData.limit);

	if (validatedData.since) {
		query = query.gt('server_sequence', validatedData.since);
	}

	if (validatedData.documentId) {
		query = query.eq('document_id', validatedData.documentId);
	}

	const { data: operations, error } = await query;

	if (error) {
		console.error('Failed to fetch operations:', error);
		throw new APIError('Failed to fetch operations', 500, 'DATABASE_ERROR');
	}

	return res.status(200).json({ operations });
}

async function handleApplyOperations(req: VercelRequest, res: VercelResponse, roomId: string) {
	const user = await getAuthenticatedUser(req);
	const participant = await checkRoomAccess(user.id, roomId);

	// Check if user has edit permissions
	if (participant.role === 'viewer') {
		throw new APIError('Viewers cannot apply operations', 403, 'INSUFFICIENT_PERMISSIONS');
	}

	const validatedData = applyOperationSchema.parse(req.body);

	// Verify document exists in the room
	const { data: document, error: docError } = await supabase
		.from('documents')
		.select('id, room_id, content, version')
		.eq('id', validatedData.documentId)
		.eq('room_id', roomId)
		.single();

	if (docError) {
		if (docError.code === 'PGRST116') {
			throw new APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
		}
		throw new APIError('Failed to fetch document', 500, 'DATABASE_ERROR');
	}

	// Get concurrent operations that might conflict
	const { data: concurrentOps, error: opsError } = await supabase
		.from('operations')
		.select('*')
		.eq('document_id', validatedData.documentId)
		.gte('server_sequence', validatedData.operations[0]?.clientSequence || 0)
		.order('server_sequence', { ascending: true });

	if (opsError) {
		console.error('Failed to fetch concurrent operations:', opsError);
		throw new APIError('Failed to check for conflicts', 500, 'DATABASE_ERROR');
	}

	// Transform operations to resolve conflicts
	let transformedOperations = validatedData.operations;

	for (const concurrentOp of concurrentOps || []) {
		transformedOperations = transformedOperations.map(op =>
			transformOperation(concurrentOp, op)
		);
	}

	// Apply operations to document and store them
	let currentContent = document.content;
	const appliedOperations = [];

	for (const operation of transformedOperations) {
		// Apply operation to content
		if (operation.type === 'insert') {
			currentContent =
				currentContent.slice(0, operation.position) +
				(operation.content || '') +
				currentContent.slice(operation.position);
		} else if (operation.type === 'delete') {
			currentContent =
				currentContent.slice(0, operation.position) +
				currentContent.slice(operation.position + (operation.length || 0));
		}

		// Store operation in database
		const operationData: OperationInsert = {
			document_id: validatedData.documentId,
			participant_id: participant.id,
			operation_type: operation.type as OperationType,
			position: operation.position,
			length: operation.length,
			content: operation.content,
			client_id: operation.clientId,
			client_sequence: operation.clientSequence,
		};

		const { data: storedOperation, error: storeError } = await supabase
			.from('operations')
			.insert(operationData)
			.select()
			.single();

		if (storeError) {
			console.error('Failed to store operation:', storeError);
			throw new APIError('Failed to store operation', 500, 'DATABASE_ERROR');
		}

		appliedOperations.push(storedOperation);
	}

	// Update document content and version
	const { data: updatedDocument, error: updateError } = await supabase
		.from('documents')
		.update({
			content: currentContent,
			version: document.version + transformedOperations.length,
			size_bytes: currentContent.length,
			line_count: Math.max(1, currentContent.split('\n').length),
		})
		.eq('id', validatedData.documentId)
		.select()
		.single();

	if (updateError) {
		console.error('Failed to update document:', updateError);
		throw new APIError('Failed to update document', 500, 'DATABASE_ERROR');
	}

	return res.status(200).json({
		operations: appliedOperations,
		document: updatedDocument,
		applied: true,
	});
}
