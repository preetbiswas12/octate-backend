/**
 * Documents API endpoint for managing collaborative documents
 */

import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, supabaseAdmin } from '../../lib/supabase';
import { z } from 'zod';
import { logger, createErrorResponse, createSuccessResponse } from '../../lib/utils';

// Validation schemas
const createDocumentSchema = z.object({
	roomId: z.string().uuid(),
	filePath: z.string().min(1),
	content: z.string(),
	language: z.string().optional().default('plaintext'),
});

const updateDocumentSchema = z.object({
	content: z.string().optional(),
	language: z.string().optional(),
});

const querySchema = z.object({
	roomId: z.string().uuid().optional(),
	page: z.coerce.number().min(1).default(1),
	limit: z.coerce.number().min(1).max(100).default(20),
});

export default async function documentsHandler(
	req: VercelRequest,
	res: VercelResponse
) {
	// Set CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
				return await getDocuments(req, res, userId);
			case 'POST':
				return await createDocument(req, res, userId);
			case 'PUT':
				return await updateDocument(req, res, userId);
			case 'DELETE':
				return await deleteDocument(req, res, userId);
			default:
				return res.status(405).json(
					createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED', 405)
				);
		}
	} catch (error) {
		logger.error('Documents API error', error as Error);
		return res.status(500).json(
			createErrorResponse('Internal server error', 'INTERNAL_ERROR', 500)
		);
	}
}

async function getDocuments(req: VercelRequest, res: VercelResponse, userId: string) {
	try {
		const { roomId, page, limit } = querySchema.parse(req.query);
		const offset = (page - 1) * limit;

		let query = supabase
			.from('documents')
			.select(`
        *,
        room:rooms!inner(
          id,
          name,
          owner_id,
          participants!inner(user_id)
        )
      `)
			.range(offset, offset + limit - 1)
			.order('updated_at', { ascending: false });

		// Filter by room if specified
		if (roomId) {
			query = query.eq('room_id', roomId);
		}

		// Ensure user has access to the room
		query = query.or(`room.owner_id.eq.${userId},room.participants.user_id.eq.${userId}`);

		const { data: documents, error, count } = await query;

		if (error) {
			logger.error('Failed to fetch documents', error);
			return res.status(500).json(
				createErrorResponse('Failed to fetch documents', 'FETCH_ERROR', 500)
			);
		}

		const totalPages = Math.ceil((count || 0) / limit);

		return res.status(200).json(
			createSuccessResponse({
				documents: documents || [],
				pagination: {
					page,
					limit,
					total: count || 0,
					totalPages,
					hasNext: page < totalPages,
					hasPrev: page > 1,
				},
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

async function createDocument(req: VercelRequest, res: VercelResponse, userId: string) {
	try {
		const { roomId, filePath, content, language } = createDocumentSchema.parse(req.body);

		// Check if user is in the room
		const { data: participant, error: participantError } = await supabase
			.from('participants')
			.select('id, role')
			.eq('room_id', roomId)
			.eq('user_id', userId)
			.single();

		if (participantError || !participant) {
			return res.status(403).json(
				createErrorResponse('Access denied to room', 'ACCESS_DENIED', 403)
			);
		}

		// Check if document already exists
		const { data: existingDoc } = await supabase
			.from('documents')
			.select('id')
			.eq('room_id', roomId)
			.eq('file_path', filePath)
			.single();

		if (existingDoc) {
			return res.status(409).json(
				createErrorResponse('Document already exists', 'DOCUMENT_EXISTS', 409)
			);
		}

		// Create document
		const { data: document, error } = await supabase
			.from('documents')
			.insert({
				room_id: roomId,
				file_path: filePath,
				content,
				language,
				version: 1,
				size_bytes: Buffer.byteLength(content, 'utf8'),
				line_count: content.split('\n').length,
				last_operation_timestamp: new Date().toISOString(),
				metadata: {},
			})
			.select()
			.single();

		if (error) {
			logger.error('Failed to create document', error);
			return res.status(500).json(
				createErrorResponse('Failed to create document', 'CREATE_ERROR', 500)
			);
		}

		logger.info('Document created', { documentId: document.id, roomId, filePath });

		return res.status(201).json(createSuccessResponse(document, 'Document created successfully'));
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json(
				createErrorResponse('Invalid request body', 'VALIDATION_ERROR', 400)
			);
		}
		throw error;
	}
}

async function updateDocument(req: VercelRequest, res: VercelResponse, userId: string) {
	try {
		const documentId = req.query.id as string;

		if (!documentId) {
			return res.status(400).json(
				createErrorResponse('Document ID is required', 'MISSING_ID', 400)
			);
		}

		const { content, language } = updateDocumentSchema.parse(req.body);

		// Check if user has access to the document
		const { data: document, error: docError } = await supabase
			.from('documents')
			.select(`
        *,
        room:rooms!inner(
          id,
          owner_id,
          participants!inner(user_id, role)
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
			document.room.participants.some((p: any) => p.user_id === userId && p.role !== 'viewer');

		if (!hasAccess) {
			return res.status(403).json(
				createErrorResponse('Access denied', 'ACCESS_DENIED', 403)
			);
		}

		// Update document
		const updateData: any = {
			updated_at: new Date().toISOString(),
			last_operation_timestamp: new Date().toISOString(),
		};

		if (content !== undefined) {
			updateData.content = content;
			updateData.size_bytes = Buffer.byteLength(content, 'utf8');
			updateData.line_count = content.split('\n').length;
			updateData.version = document.version + 1;
		}

		if (language !== undefined) {
			updateData.language = language;
		}

		const { data: updatedDocument, error } = await supabase
			.from('documents')
			.update(updateData)
			.eq('id', documentId)
			.select()
			.single();

		if (error) {
			logger.error('Failed to update document', error);
			return res.status(500).json(
				createErrorResponse('Failed to update document', 'UPDATE_ERROR', 500)
			);
		}

		logger.info('Document updated', { documentId, roomId: document.room_id });

		return res.status(200).json(
			createSuccessResponse(updatedDocument, 'Document updated successfully')
		);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json(
				createErrorResponse('Invalid request body', 'VALIDATION_ERROR', 400)
			);
		}
		throw error;
	}
}

async function deleteDocument(req: VercelRequest, res: VercelResponse, userId: string) {
	try {
		const documentId = req.query.id as string;

		if (!documentId) {
			return res.status(400).json(
				createErrorResponse('Document ID is required', 'MISSING_ID', 400)
			);
		}

		// Check if user has access to delete the document
		const { data: document, error: docError } = await supabase
			.from('documents')
			.select(`
        *,
        room:rooms!inner(
          id,
          owner_id,
          participants!inner(user_id, role)
        )
      `)
			.eq('id', documentId)
			.single();

		if (docError || !document) {
			return res.status(404).json(
				createErrorResponse('Document not found', 'NOT_FOUND', 404)
			);
		}

		// Only room owner or document creator can delete
		const canDelete = document.room.owner_id === userId ||
			document.room.participants.some((p: any) => p.user_id === userId && p.role === 'owner');

		if (!canDelete) {
			return res.status(403).json(
				createErrorResponse('Access denied', 'ACCESS_DENIED', 403)
			);
		}

		// Delete related records first (due to foreign key constraints)
		await Promise.all([
			supabase.from('cursors').delete().eq('document_id', documentId),
			supabase.from('operations').delete().eq('document_id', documentId),
		]);

		// Delete document
		const { error } = await supabase
			.from('documents')
			.delete()
			.eq('id', documentId);

		if (error) {
			logger.error('Failed to delete document', error);
			return res.status(500).json(
				createErrorResponse('Failed to delete document', 'DELETE_ERROR', 500)
			);
		}

		logger.info('Document deleted', { documentId, roomId: document.room_id });

		return res.status(200).json(
			createSuccessResponse(null, 'Document deleted successfully')
		);
	} catch (error) {
		throw error;
	}
}
