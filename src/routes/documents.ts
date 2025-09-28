import express from 'express';
import { z } from 'zod';
import { supabase, Document, DocumentInsert, Participant } from '../../lib/supabase';
import { authenticateUser, AuthenticatedRequest, APIError } from '../middleware/auth';

const router = express.Router();

// Request validation schemas
const createDocumentSchema = z.object({
	roomId: z.string().uuid(),
	filePath: z.string().min(1),
	content: z.string().default(''),
	language: z.string().optional(),
});

const updateDocumentSchema = z.object({
	content: z.string().optional(),
	language: z.string().optional(),
});

// Helper functions
async function checkRoomAccess(userId: string, roomId: string): Promise<Participant> {
	const { data: participant, error } = await supabase
		.from('participants')
		.select('*')
		.eq('room_id', roomId)
		.eq('user_id', userId)
		.single();

	if (error || !participant) {
		throw new APIError('Access denied or room not found', 403, 'ACCESS_DENIED');
	}

	return participant;
}

async function checkDocumentAccess(userId: string, documentId: string): Promise<{ document: Document; participant: Participant }> {
	const { data: document, error: docError } = await supabase
		.from('documents')
		.select(`
			*,
			rooms!inner(
				id,
				status
			)
		`)
		.eq('id', documentId)
		.single();

	if (docError || !document) {
		throw new APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
	}

	const participant = await checkRoomAccess(userId, document.room_id);
	return { document, participant };
}

// GET /api/documents - List user's documents
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
	try {
		const userId = req.user!.id;
		const { roomId, search, language } = req.query;

		let query = supabase
			.from('documents')
			.select(`
				*,
				rooms!inner(
					id,
					name,
					status
				)
			`);

		// Filter by rooms user has access to
		const { data: userRooms } = await supabase
			.from('participants')
			.select('room_id')
			.eq('user_id', userId);

		if (!userRooms || userRooms.length === 0) {
			return res.json({ documents: [] });
		}

		const roomIds = userRooms.map(p => p.room_id);
		query = query.in('room_id', roomIds);

		// Apply filters
		if (roomId && typeof roomId === 'string') {
			query = query.eq('room_id', roomId);
		}

		if (search && typeof search === 'string') {
			query = query.or(`file_path.ilike.%${search}%,content.ilike.%${search}%`);
		}

		if (language && typeof language === 'string') {
			query = query.eq('language', language);
		}

		const { data: documents, error } = await query
			.order('updated_at', { ascending: false });

		if (error) {
			throw new APIError('Failed to fetch documents', 500, 'DATABASE_ERROR');
		}

		res.json({ documents });
	} catch (error) {
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({ error: error.message, code: error.code });
		}
		console.error('Error fetching documents:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/documents - Create new document
router.post('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
	try {
		const userId = req.user!.id;
		const validatedData = createDocumentSchema.parse(req.body);

		// Check room access
		await checkRoomAccess(userId, validatedData.roomId);

		// Check if document with same file path already exists in room
		const { data: existingDoc } = await supabase
			.from('documents')
			.select('id')
			.eq('room_id', validatedData.roomId)
			.eq('file_path', validatedData.filePath)
			.single();

		if (existingDoc) {
			throw new APIError('Document with this file path already exists in the room', 409, 'DOCUMENT_EXISTS');
		}

		// Create document
		const documentData: DocumentInsert = {
			room_id: validatedData.roomId,
			file_path: validatedData.filePath,
			content: validatedData.content,
			language: validatedData.language,
			version: 1,
			size_bytes: Buffer.byteLength(validatedData.content, 'utf8'),
			line_count: Math.max(1, validatedData.content.split('\n').length),
			last_operation_timestamp: new Date().toISOString(),
			metadata: {},
		};

		const { data: document, error } = await supabase
			.from('documents')
			.insert(documentData)
			.select()
			.single();

		if (error) {
			throw new APIError('Failed to create document', 500, 'DATABASE_ERROR');
		}

		res.status(201).json({ document });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json({ error: 'Invalid request data', details: error.errors });
		}
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({ error: error.message, code: error.code });
		}
		console.error('Error creating document:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// GET /api/documents/:documentId - Get document
router.get('/:documentId', authenticateUser, async (req: AuthenticatedRequest, res) => {
	try {
		const { documentId } = req.params;
		const userId = req.user!.id;

		if (!documentId) {
			throw new APIError('Document ID required', 400, 'MISSING_DOCUMENT_ID');
		}

		const { document } = await checkDocumentAccess(userId, documentId);

		res.json({ document });
	} catch (error) {
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({ error: error.message, code: error.code });
		}
		console.error('Error fetching document:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// PUT /api/documents/:documentId - Update document
router.put('/:documentId', authenticateUser, async (req: AuthenticatedRequest, res) => {
	try {
		const { documentId } = req.params;
		const userId = req.user!.id;
		const validatedData = updateDocumentSchema.parse(req.body);

		if (!documentId) {
			throw new APIError('Document ID required', 400, 'MISSING_DOCUMENT_ID');
		}

		const { document, participant } = await checkDocumentAccess(userId, documentId);

		// Check if user has edit permissions
		if (participant.role === 'viewer') {
			throw new APIError('Insufficient permissions to edit document', 403, 'ACCESS_DENIED');
		}

		const updateData: any = {
			updated_at: new Date().toISOString(),
		};

		if (validatedData.content !== undefined) {
			updateData.content = validatedData.content;
			updateData.size_bytes = Buffer.byteLength(validatedData.content, 'utf8');
			updateData.line_count = Math.max(1, validatedData.content.split('\n').length);
			updateData.version = document.version + 1;
			updateData.last_operation_timestamp = new Date().toISOString();
		}

		if (validatedData.language !== undefined) {
			updateData.language = validatedData.language;
		}

		const { data: updatedDocument, error } = await supabase
			.from('documents')
			.update(updateData)
			.eq('id', documentId)
			.select()
			.single();

		if (error) {
			throw new APIError('Failed to update document', 500, 'DATABASE_ERROR');
		}

		res.json({ document: updatedDocument });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return res.status(400).json({ error: 'Invalid request data', details: error.errors });
		}
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({ error: error.message, code: error.code });
		}
		console.error('Error updating document:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// DELETE /api/documents/:documentId - Delete document
router.delete('/:documentId', authenticateUser, async (req: AuthenticatedRequest, res) => {
	try {
		const { documentId } = req.params;
		const userId = req.user!.id;

		if (!documentId) {
			throw new APIError('Document ID required', 400, 'MISSING_DOCUMENT_ID');
		}

		const { participant } = await checkDocumentAccess(userId, documentId);

		// Check if user has sufficient permissions (only editors and owners can delete)
		if (participant.role === 'viewer') {
			throw new APIError('Insufficient permissions to delete document', 403, 'ACCESS_DENIED');
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
			throw new APIError('Failed to delete document', 500, 'DATABASE_ERROR');
		}

		res.status(204).send();
	} catch (error) {
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({ error: error.message, code: error.code });
		}
		console.error('Error deleting document:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// GET /api/documents/:documentId/operations - Get document operations
router.get('/:documentId/operations', authenticateUser, async (req: AuthenticatedRequest, res) => {
	try {
		const { documentId } = req.params;
		const userId = req.user!.id;
		const { since, limit = '50' } = req.query;

		if (!documentId) {
			throw new APIError('Document ID required', 400, 'MISSING_DOCUMENT_ID');
		}

		await checkDocumentAccess(userId, documentId);

		let query = supabase
			.from('operations')
			.select(`
				*,
				participants(
					id,
					display_name,
					color
				)
			`)
			.eq('document_id', documentId)
			.order('server_sequence', { ascending: true });

		if (since && typeof since === 'string') {
			query = query.gt('server_sequence', parseInt(since));
		}

		if (limit && typeof limit === 'string') {
			query = query.limit(parseInt(limit));
		}

		const { data: operations, error } = await query;

		if (error) {
			throw new APIError('Failed to fetch operations', 500, 'DATABASE_ERROR');
		}

		res.json({ operations });
	} catch (error) {
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({ error: error.message, code: error.code });
		}
		console.error('Error fetching operations:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

// GET /api/documents/:documentId/cursors - Get document cursors
router.get('/:documentId/cursors', authenticateUser, async (req: AuthenticatedRequest, res) => {
	try {
		const { documentId } = req.params;
		const userId = req.user!.id;

		if (!documentId) {
			throw new APIError('Document ID required', 400, 'MISSING_DOCUMENT_ID');
		}

		await checkDocumentAccess(userId, documentId);

		const { data: cursors, error } = await supabase
			.from('cursors')
			.select(`
				*,
				participants(
					id,
					display_name,
					color,
					user_id
				)
			`)
			.eq('document_id', documentId);

		if (error) {
			throw new APIError('Failed to fetch cursors', 500, 'DATABASE_ERROR');
		}

		res.json({ cursors });
	} catch (error) {
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({ error: error.message, code: error.code });
		}
		console.error('Error fetching cursors:', error);
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
