"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_1 = require("../../../lib/supabase");
const zod_1 = require("zod");
// Request validation schemas
const updateCursorSchema = zod_1.z.object({
    documentId: zod_1.z.string().uuid(),
    line: zod_1.z.number().min(0),
    column: zod_1.z.number().min(0),
    selectionStart: zod_1.z.object({
        line: zod_1.z.number().min(0),
        column: zod_1.z.number().min(0),
    }).optional(),
    selectionEnd: zod_1.z.object({
        line: zod_1.z.number().min(0),
        column: zod_1.z.number().min(0),
    }).optional(),
});
// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
class APIError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'APIError';
    }
}
async function getAuthenticatedUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new APIError('Missing or invalid authorization header', 401, 'UNAUTHORIZED');
    }
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase_1.supabase.auth.getUser(token);
    if (error || !user) {
        throw new APIError('Invalid authentication token', 401, 'UNAUTHORIZED');
    }
    return user;
}
async function checkRoomAccess(userId, roomId) {
    const { data: participant, error } = await supabase_1.supabase
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
async function handler(req, res) {
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
    }
    catch (error) {
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
async function handleGetCursors(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    await checkRoomAccess(user.id, roomId);
    const { documentId } = req.query;
    // Build query to get all cursors in the room
    let query = supabase_1.supabase
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
async function handleUpdateCursor(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    const participant = await checkRoomAccess(user.id, roomId);
    const validatedData = updateCursorSchema.parse(req.body);
    // Verify document exists in the room
    const { data: document, error: docError } = await supabase_1.supabase
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
    const cursorData = {
        participant_id: participant.id,
        document_id: validatedData.documentId,
        line: validatedData.line,
        column: validatedData.column,
        selection_start: validatedData.selectionStart || null,
        selection_end: validatedData.selectionEnd || null,
    };
    const { data: cursor, error: cursorError } = await supabase_1.supabase
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
    await supabase_1.supabase
        .from('participants')
        .update({
        last_seen: new Date().toISOString(),
    })
        .eq('id', participant.id);
    // Update presence activity
    await supabase_1.supabase
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
//# sourceMappingURL=cursors.js.map