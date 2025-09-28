import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase, CursorInsert } from '../../../lib/supabase';
import { z } from 'zod';

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

// CORS headers
const corsHeaders = {
	'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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
				return await handleGetCursors(req, res, roomId);
			case 'POST':
			case 'PUT':
				return await handleUpdateCursor(req, res, roomId);
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

async function handleGetCursors(req: VercelRequest, res: VercelResponse, roomId: string) {
	const user = await getAuthenticatedUser(req);
	await checkRoomAccess(user.id, roomId);

	const { documentId } = req.query;

	// Build query to get all cursors in the room
	let query = supabase
		.from('cursors')
		.select(`
      *,
      participant:participants!inner(
        id,
        display_name,
        color,
        presence_status,
        user_id
      ),
      document:documents!inner(
        id,
        file_path,
        room_id
      )
    `)
		.eq('document.room_id', roomId)
		.eq('participant.presence_status', 'online');

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
	const transformedCursors = cursors?.map(cursor => ({
		id: cursor.id,
		line: cursor.line,
		column: cursor.column,
		selectionStart: cursor.selection_start,
		selectionEnd: cursor.selection_end,
		updatedAt: cursor.updated_at,
		document: {
			id: cursor.document.id,
			filePath: cursor.document.file_path,
		},
		participant: {
			id: cursor.participant.id,
			displayName: cursor.participant.display_name,
			color: cursor.participant.color,
			userId: cursor.participant.user_id,
		},
	}));

	return res.status(200).json({ cursors: transformedCursors });
}

async function handleUpdateCursor(req: VercelRequest, res: VercelResponse, roomId: string) {
	const user = await getAuthenticatedUser(req);
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
      participant:participants!inner(
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
			id: cursor.participant.id,
			displayName: cursor.participant.display_name,
			color: cursor.participant.color,
			userId: cursor.participant.user_id,
		},
	};

	return res.status(200).json({ cursor: transformedCursor });
}
