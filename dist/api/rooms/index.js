"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_1 = require("../../lib/supabase");
const zod_1 = require("zod");
// Request validation schemas
const createRoomSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().optional(),
    maxParticipants: zod_1.z.number().min(1).max(50).default(10),
    allowAnonymous: zod_1.z.boolean().default(false),
    requireApproval: zod_1.z.boolean().default(false),
    expiresIn: zod_1.z.number().optional(), // hours
});
const getRoomSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
});
// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
};
// Error handling
class APIError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'APIError';
    }
}
// Auth helper
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
// Rate limiting (basic implementation)
const rateLimitMap = new Map();
function checkRateLimit(ip, limit = 100, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const clientData = rateLimitMap.get(ip);
    if (!clientData || now > clientData.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
        return true;
    }
    if (clientData.count >= limit) {
        return false;
    }
    clientData.count++;
    return true;
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
        // Rate limiting
        const clientIp = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
        if (!checkRateLimit(clientIp)) {
            throw new APIError('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
        }
        switch (req.method) {
            case 'GET':
                return await handleGetRoom(req, res);
            case 'POST':
                return await handleCreateRoom(req, res);
            case 'PUT':
                return await handleUpdateRoom(req, res);
            case 'DELETE':
                return await handleDeleteRoom(req, res);
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
async function handleGetRoom(req, res) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        throw new APIError('Room ID is required', 400, 'MISSING_ROOM_ID');
    }
    const user = await getAuthenticatedUser(req);
    // Get room with participant check
    const { data: room, error: roomError } = await supabase_1.supabase
        .from('rooms')
        .select(`
      *,
      participants (
        id,
        user_id,
        role,
        display_name,
        avatar_url,
        color,
        presence_status,
        last_seen,
        joined_at
      ),
      documents (
        id,
        file_path,
        language,
        version,
        updated_at
      )
    `)
        .eq('id', id)
        .single();
    if (roomError) {
        if (roomError.code === 'PGRST116') {
            throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
        }
        throw new APIError('Failed to fetch room', 500, 'DATABASE_ERROR');
    }
    // Check if user has access to this room
    const hasAccess = room.participants?.some((p) => p.user_id === user.id) || room.owner_id === user.id;
    if (!hasAccess) {
        throw new APIError('Access denied to this room', 403, 'ACCESS_DENIED');
    }
    return res.status(200).json({ room });
}
async function handleCreateRoom(req, res) {
    const user = await getAuthenticatedUser(req);
    const validatedData = createRoomSchema.parse(req.body);
    const roomData = {
        name: validatedData.name,
        description: validatedData.description,
        max_participants: validatedData.maxParticipants,
        allow_anonymous: validatedData.allowAnonymous,
        require_approval: validatedData.requireApproval,
        owner_id: user.id,
        status: 'active',
    };
    // Set expiration if provided
    if (validatedData.expiresIn) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + validatedData.expiresIn);
        roomData.expires_at = expiresAt.toISOString();
    }
    // Create room
    const { data: room, error: roomError } = await supabase_1.supabase
        .from('rooms')
        .insert(roomData)
        .select()
        .single();
    if (roomError) {
        console.error('Room creation error:', roomError);
        throw new APIError('Failed to create room', 500, 'DATABASE_ERROR');
    }
    // Add creator as owner participant
    const { error: participantError } = await supabase_1.supabase
        .from('participants')
        .insert({
        room_id: room.id,
        user_id: user.id,
        role: 'owner',
        display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'Anonymous',
        avatar_url: user.user_metadata?.avatar_url,
    });
    if (participantError) {
        console.error('Participant creation error:', participantError);
        // Try to clean up the room if participant creation fails
        await supabase_1.supabase.from('rooms').delete().eq('id', room.id);
        throw new APIError('Failed to set up room ownership', 500, 'DATABASE_ERROR');
    }
    return res.status(201).json({ room });
}
async function handleUpdateRoom(req, res) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        throw new APIError('Room ID is required', 400, 'MISSING_ROOM_ID');
    }
    const user = await getAuthenticatedUser(req);
    // Validate update data
    const updateSchema = createRoomSchema.partial();
    const validatedData = updateSchema.parse(req.body);
    // Check if user is the room owner
    const { data: room, error: roomError } = await supabase_1.supabase
        .from('rooms')
        .select('owner_id')
        .eq('id', id)
        .single();
    if (roomError) {
        if (roomError.code === 'PGRST116') {
            throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
        }
        throw new APIError('Failed to fetch room', 500, 'DATABASE_ERROR');
    }
    if (room.owner_id !== user.id) {
        throw new APIError('Only room owners can update room settings', 403, 'ACCESS_DENIED');
    }
    // Update room
    const { data: updatedRoom, error: updateError } = await supabase_1.supabase
        .from('rooms')
        .update({
        name: validatedData.name,
        description: validatedData.description,
        max_participants: validatedData.maxParticipants,
        allow_anonymous: validatedData.allowAnonymous,
        require_approval: validatedData.requireApproval,
    })
        .eq('id', id)
        .select()
        .single();
    if (updateError) {
        console.error('Room update error:', updateError);
        throw new APIError('Failed to update room', 500, 'DATABASE_ERROR');
    }
    return res.status(200).json({ room: updatedRoom });
}
async function handleDeleteRoom(req, res) {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        throw new APIError('Room ID is required', 400, 'MISSING_ROOM_ID');
    }
    const user = await getAuthenticatedUser(req);
    // Check if user is the room owner
    const { data: room, error: roomError } = await supabase_1.supabase
        .from('rooms')
        .select('owner_id')
        .eq('id', id)
        .single();
    if (roomError) {
        if (roomError.code === 'PGRST116') {
            throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
        }
        throw new APIError('Failed to fetch room', 500, 'DATABASE_ERROR');
    }
    if (room.owner_id !== user.id) {
        throw new APIError('Only room owners can delete rooms', 403, 'ACCESS_DENIED');
    }
    // Delete room (cascading will handle related records)
    const { error: deleteError } = await supabase_1.supabase
        .from('rooms')
        .delete()
        .eq('id', id);
    if (deleteError) {
        console.error('Room deletion error:', deleteError);
        throw new APIError('Failed to delete room', 500, 'DATABASE_ERROR');
    }
    return res.status(200).json({ success: true });
}
//# sourceMappingURL=index.js.map