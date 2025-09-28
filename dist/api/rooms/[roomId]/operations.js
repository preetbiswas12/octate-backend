"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_1 = require("../../../lib/supabase");
const zod_1 = require("zod");
// Request validation schemas
const applyOperationSchema = zod_1.z.object({
    documentId: zod_1.z.string().uuid(),
    operations: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.enum(['insert', 'delete', 'retain', 'cursor_move', 'selection_change']),
        position: zod_1.z.number().min(0),
        length: zod_1.z.number().min(0).optional(),
        content: zod_1.z.string().optional(),
        clientId: zod_1.z.string().uuid(),
        clientSequence: zod_1.z.number().min(0),
    })),
});
const getOperationsSchema = zod_1.z.object({
    documentId: zod_1.z.string().uuid(),
    since: zod_1.z.number().optional(), // server sequence number
    limit: zod_1.z.number().min(1).max(1000).default(100),
});
// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
// Operational Transform helper functions
function transformOperation(op1, op2) {
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
                return await handleGetOperations(req, res, roomId);
            case 'POST':
                return await handleApplyOperations(req, res, roomId);
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
async function handleGetOperations(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    await checkRoomAccess(user.id, roomId);
    const validatedData = getOperationsSchema.parse(req.query);
    // Build query
    let query = supabase_1.supabase
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
async function handleApplyOperations(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    const participant = await checkRoomAccess(user.id, roomId);
    // Check if user has edit permissions
    if (participant.role === 'viewer') {
        throw new APIError('Viewers cannot apply operations', 403, 'INSUFFICIENT_PERMISSIONS');
    }
    const validatedData = applyOperationSchema.parse(req.body);
    // Verify document exists in the room
    const { data: document, error: docError } = await supabase_1.supabase
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
    const { data: concurrentOps, error: opsError } = await supabase_1.supabase
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
        transformedOperations = transformedOperations.map(op => transformOperation(concurrentOp, op));
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
        }
        else if (operation.type === 'delete') {
            currentContent =
                currentContent.slice(0, operation.position) +
                    currentContent.slice(operation.position + (operation.length || 0));
        }
        // Store operation in database
        const operationData = {
            document_id: validatedData.documentId,
            participant_id: participant.id,
            operation_type: operation.type,
            position: operation.position,
            length: operation.length,
            content: operation.content,
            client_id: operation.clientId,
            client_sequence: operation.clientSequence,
        };
        const { data: storedOperation, error: storeError } = await supabase_1.supabase
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
    const { data: updatedDocument, error: updateError } = await supabase_1.supabase
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
//# sourceMappingURL=operations.js.map