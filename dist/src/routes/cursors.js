"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supabase_1 = require("../../lib/supabase");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
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
async function checkRoomAccess(userId, roomId) {
    const { data: participant, error } = await supabase_1.supabase
        .from('participants')
        .select('id, role')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single();
    if (error || !participant) {
        throw new auth_1.APIError('Access denied to this room', 403, 'ACCESS_DENIED');
    }
    return participant;
}
// GET /api/rooms/:roomId/cursors - Get all cursors in a room
router.get('/:roomId/cursors', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        await handleGetCursors(req, res, roomId);
    }
    catch (error) {
        console.error('API Error:', error);
        if (error instanceof auth_1.APIError) {
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
router.post('/:roomId/cursors', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        await handleUpdateCursor(req, res, roomId);
    }
    catch (error) {
        console.error('API Error:', error);
        if (error instanceof auth_1.APIError) {
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
router.put('/:roomId/cursors', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        await handleUpdateCursor(req, res, roomId);
    }
    catch (error) {
        console.error('API Error:', error);
        if (error instanceof auth_1.APIError) {
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
async function handleGetCursors(req, res, roomId) {
    const user = req.user;
    await checkRoomAccess(user.id, roomId);
    const { documentId } = req.query;
    // Build query to get all cursors in the room
    let query = supabase_1.supabase
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
        throw new auth_1.APIError('Failed to fetch cursors', 500, 'DATABASE_ERROR');
    }
    // Transform the data to include participant info at the top level
    const transformedCursors = cursors?.map((cursor) => ({
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
async function handleUpdateCursor(req, res, roomId) {
    const user = req.user;
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
            throw new auth_1.APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }
        throw new auth_1.APIError('Failed to fetch document', 500, 'DATABASE_ERROR');
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
        throw new auth_1.APIError('Failed to update cursor position', 500, 'DATABASE_ERROR');
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
            id: cursor.participants?.id,
            displayName: cursor.participants?.display_name,
            color: cursor.participants?.color,
            userId: cursor.participants?.user_id,
        },
    };
    return res.status(200).json({ cursor: transformedCursor });
}
exports.default = router;
//# sourceMappingURL=cursors.js.map