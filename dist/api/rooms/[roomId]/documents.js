"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_1 = require("../../../lib/supabase");
const zod_1 = require("zod");
// Request validation schemas
const createDocumentSchema = zod_1.z.object({
    filePath: zod_1.z.string().min(1),
    content: zod_1.z.string().default(''),
    language: zod_1.z.string().optional(),
});
const updateDocumentSchema = zod_1.z.object({
    content: zod_1.z.string().optional(),
    language: zod_1.z.string().optional(),
});
// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
                return await handleGetDocuments(req, res, roomId);
            case 'POST':
                return await handleCreateDocument(req, res, roomId);
            case 'PUT':
                return await handleUpdateDocument(req, res, roomId);
            case 'DELETE':
                return await handleDeleteDocument(req, res, roomId);
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
async function handleGetDocuments(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    await checkRoomAccess(user.id, roomId);
    const { data: documents, error } = await supabase_1.supabase
        .from('documents')
        .select('*')
        .eq('room_id', roomId)
        .order('updated_at', { ascending: false });
    if (error) {
        console.error('Failed to fetch documents:', error);
        throw new APIError('Failed to fetch documents', 500, 'DATABASE_ERROR');
    }
    return res.status(200).json({ documents });
}
async function handleCreateDocument(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    const participant = await checkRoomAccess(user.id, roomId);
    // Check if user has edit permissions
    if (participant.role === 'viewer') {
        throw new APIError('Viewers cannot create documents', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    const validatedData = createDocumentSchema.parse(req.body);
    // Check if document already exists
    const { data: existingDoc } = await supabase_1.supabase
        .from('documents')
        .select('id')
        .eq('room_id', roomId)
        .eq('file_path', validatedData.filePath)
        .single();
    if (existingDoc) {
        throw new APIError('Document with this file path already exists', 409, 'DOCUMENT_EXISTS');
    }
    const documentData = {
        room_id: roomId,
        file_path: validatedData.filePath,
        content: validatedData.content,
        language: validatedData.language,
        size_bytes: validatedData.content.length,
        line_count: Math.max(1, validatedData.content.split('\n').length),
    };
    const { data: document, error } = await supabase_1.supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single();
    if (error) {
        console.error('Failed to create document:', error);
        throw new APIError('Failed to create document', 500, 'DATABASE_ERROR');
    }
    return res.status(201).json({ document });
}
async function handleUpdateDocument(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    const participant = await checkRoomAccess(user.id, roomId);
    // Check if user has edit permissions
    if (participant.role === 'viewer') {
        throw new APIError('Viewers cannot update documents', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    const { documentId } = req.query;
    if (!documentId || typeof documentId !== 'string') {
        throw new APIError('Document ID is required', 400, 'MISSING_DOCUMENT_ID');
    }
    const validatedData = updateDocumentSchema.parse(req.body);
    // Verify document exists in the room
    const { data: existingDoc, error: fetchError } = await supabase_1.supabase
        .from('documents')
        .select('id, content, version')
        .eq('id', documentId)
        .eq('room_id', roomId)
        .single();
    if (fetchError) {
        if (fetchError.code === 'PGRST116') {
            throw new APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }
        throw new APIError('Failed to fetch document', 500, 'DATABASE_ERROR');
    }
    const updateData = {};
    if (validatedData.content !== undefined) {
        updateData.content = validatedData.content;
        updateData.size_bytes = validatedData.content.length;
        updateData.line_count = Math.max(1, validatedData.content.split('\n').length);
        updateData.version = existingDoc.version + 1;
    }
    if (validatedData.language !== undefined) {
        updateData.language = validatedData.language;
    }
    const { data: document, error: updateError } = await supabase_1.supabase
        .from('documents')
        .update(updateData)
        .eq('id', documentId)
        .select()
        .single();
    if (updateError) {
        console.error('Failed to update document:', updateError);
        throw new APIError('Failed to update document', 500, 'DATABASE_ERROR');
    }
    return res.status(200).json({ document });
}
async function handleDeleteDocument(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    const participant = await checkRoomAccess(user.id, roomId);
    // Check if user has edit permissions
    if (participant.role === 'viewer') {
        throw new APIError('Viewers cannot delete documents', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    const { documentId } = req.query;
    if (!documentId || typeof documentId !== 'string') {
        throw new APIError('Document ID is required', 400, 'MISSING_DOCUMENT_ID');
    }
    // Verify document exists in the room
    const { data: existingDoc, error: fetchError } = await supabase_1.supabase
        .from('documents')
        .select('id')
        .eq('id', documentId)
        .eq('room_id', roomId)
        .single();
    if (fetchError) {
        if (fetchError.code === 'PGRST116') {
            throw new APIError('Document not found', 404, 'DOCUMENT_NOT_FOUND');
        }
        throw new APIError('Failed to fetch document', 500, 'DATABASE_ERROR');
    }
    const { error: deleteError } = await supabase_1.supabase
        .from('documents')
        .delete()
        .eq('id', documentId);
    if (deleteError) {
        console.error('Failed to delete document:', deleteError);
        throw new APIError('Failed to delete document', 500, 'DATABASE_ERROR');
    }
    return res.status(200).json({ success: true });
}
//# sourceMappingURL=documents.js.map