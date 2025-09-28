import express, { Request, Response } from 'express';
import { supabase, CursorInsert } from '../../lib/supabase';
import { z } from 'zod';
import { authenticateUser, AuthenticatedRequest, APIError } from '../middleware/auth';

const router = express.Router();

// Request validation schemas
const updateCursorSchema = z.object({
	documentId: z.string().uuid(),
	line: z.number().min(0),
	column: z.number().min(0),
	selectionStart: z.object({
		line: z.number().min(0),
		column: z.number().min(0),
	}).optional(),
	selectionEnd: z.object({
		line: z.number().min(0),
		column: z.number().min(0),
	}).optional(),
});

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

// GET /api/rooms/:roomId/cursors - Get all cursors in a room
router.get('/:roomId/cursors', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { roomId } = req.params;
		await handleGetCursors(req, res, roomId);
	} catch (error) {
		console.error('API Error:', error);
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({
				error: error.message,
				code: error.code,
			});
		}
		res.status(500).json({
			error: 'Internal server error',
			code: 'INTERNAL_ERROR',
		});
	}
});

// POST/PUT /api/rooms/:roomId/cursors - Update cursor position
router.post('/:roomId/cursors', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { roomId } = req.params;
		await handleUpdateCursor(req, res, roomId);
	} catch (error) {
		console.error('API Error:', error);
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({
				error: error.message,
				code: error.code,
			});
		}
		res.status(500).json({
			error: 'Internal server error',
			code: 'INTERNAL_ERROR',
		});
	}
});

router.put('/:roomId/cursors', authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
	try {
		const { roomId } = req.params;
		await handleUpdateCursor(req, res, roomId);
	} catch (error) {
		console.error('API Error:', error);
		if (error instanceof APIError) {
			return res.status(error.statusCode).json({
				error: error.message,
				code: error.code,
			});
		}
		res.status(500).json({
			error: 'Internal server error',
			code: 'INTERNAL_ERROR',
		});
	}
});

async function handleGetCursors(req: AuthenticatedRequest, res: Response, roomId: string) {
	const user = req.user!;
	await checkRoomAccess(user.id, roomId);

	const { documentId } = req.query;

	// Build query to get all cursors in the room
	let query = supabase
		.from('cursors')
		.select(`
      *,
      participants!inner(
        id,
        display_name,
        color,
        presence_status,
        user_id,
        room_id
      ),
      documents!inner(
        id,
        file_path,
        room_id
      )
    `)
		.eq('documents.room_id', roomId)
		.eq('participants.presence_status', 'online');

	// Filter by document if specified
	if (documentId && typeof documentId === 'string') {
		query = query.eq('document_id', documentId);
	}

	const { data: cursors, error } = await query;

	if (error) {
		console.error('Failed to fetch cursors:', error);
		throw new APIError('Failed to fetch cursors', 500, 'DATABASE_ERROR');
	}

	// Transform the data to include participant info at the top level
	const transformedCursors = cursors?.map((cursor: any) => ({
		id: cursor.id,
		line: cursor.line,
		column: cursor.column,
		selectionStart: cursor.selection_start,
		selectionEnd: cursor.selection_end,
		updatedAt: cursor.updated_at,
		document: {
			id: cursor.documents?.id,
			filePath: cursor.documents?.file_path,
		},
		participant: {
			id: cursor.participants?.id,
			displayName: cursor.participants?.display_name,
			color: cursor.participants?.color,
			userId: cursor.participants?.user_id,
		},
	}));

	return res.status(200).json({ cursors: transformedCursors });
}

async function handleUpdateCursor(req: AuthenticatedRequest, res: Response, roomId: string) {
	const user = req.user!;
	const participant = await checkRoomAccess(user.id, roomId);

	const validatedData = updateCursorSchema.parse(req.body);

	// Verify document exists in the room
	const { data: document, error: docError } = await supabase
		.from('documents')
		.select('id, room_id')
		.eq('id', validatedData.documentId)
		.eq('room_id', roomId)
		.single();

	if (docError) {
		if (docError.code === 'PGRST116') {
			throw new APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
		}
		throw new APIError('Failed to fetch document', 500, 'DATABASE_ERROR');
	}

	// Update cursor position using upsert
	const cursorData: CursorInsert = {
		participant_id: participant.id,
		document_id: validatedData.documentId,
		line: validatedData.line,
		column: validatedData.column,
		selection_start: validatedData.selectionStart || null,
		selection_end: validatedData.selectionEnd || null,
	};

	const { data: cursor, error: cursorError } = await supabase
		.from('cursors')
		.upsert(cursorData, {
			onConflict: 'participant_id,document_id',
		})
		.select(`
      *,
      participants!inner(
        id,
        display_name,
        color,
        user_id
      )
    `)
		.single();

	if (cursorError) {
		console.error('Failed to update cursor:', cursorError);
		throw new APIError('Failed to update cursor position', 500, 'DATABASE_ERROR');
	}

	// Update participant's last activity
	await supabase
		.from('participants')
		.update({
			last_seen: new Date().toISOString(),
		})
		.eq('id', participant.id);

	// Update presence activity
	await supabase
		.from('presence')
		.upsert({
			participant_id: participant.id,
			room_id: roomId,
			status: 'online',
			current_document_id: validatedData.documentId,
			activity_type: 'editing',
			last_activity: new Date().toISOString(),
		}, {
			onConflict: 'participant_id,room_id',
		});

	// Transform response
	const transformedCursor = {
		id: cursor.id,
		line: cursor.line,
		column: cursor.column,
		selectionStart: cursor.selection_start,
		selectionEnd: cursor.selection_end,
		updatedAt: cursor.updated_at,
		participant: {
			id: cursor.participants?.id,
			displayName: cursor.participants?.display_name,
			color: cursor.participants?.color,
			userId: cursor.participants?.user_id,
		},
	};

	return res.status(200).json({ cursor: transformedCursor });
}

export default router;
