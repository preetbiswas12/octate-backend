"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_1 = require("../../../lib/supabase");
const zod_1 = require("zod");
// Request validation schemas
const joinRoomSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1).max(100).optional(),
    role: zod_1.z.enum(['owner', 'editor', 'viewer']).default('editor'),
});
// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
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
            case 'POST':
                return await handleJoinRoom(req, res, roomId);
            case 'DELETE':
                return await handleLeaveRoom(req, res, roomId);
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
async function handleJoinRoom(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    const validatedData = joinRoomSchema.parse(req.body);
    // Check if room exists and user can join
    const { data: room, error: roomError } = await supabase_1.supabase
        .from('rooms')
        .select('id, name, status, max_participants, allow_anonymous, require_approval, participants(id)')
        .eq('id', roomId)
        .single();
    if (roomError) {
        if (roomError.code === 'PGRST116') {
            throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
        }
        throw new APIError('Failed to fetch room', 500, 'DATABASE_ERROR');
    }
    if (room.status !== 'active') {
        throw new APIError('Room is not active', 403, 'ROOM_INACTIVE');
    }
    // Check if room is full
    const currentParticipants = Array.isArray(room.participants) ? room.participants.length : 0;
    if (currentParticipants >= room.max_participants) {
        throw new APIError('Room is full', 403, 'ROOM_FULL');
    }
    // Check if user is already in the room
    const { data: existingParticipant } = await supabase_1.supabase
        .from('participants')
        .select('id, role, presence_status')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();
    if (existingParticipant) {
        // Update existing participant status to online
        const { data: updatedParticipant, error: updateError } = await supabase_1.supabase
            .from('participants')
            .update({
            presence_status: 'online',
            last_seen: new Date().toISOString(),
        })
            .eq('id', existingParticipant.id)
            .select()
            .single();
        if (updateError) {
            console.error('Failed to update participant status:', updateError);
            throw new APIError('Failed to rejoin room', 500, 'DATABASE_ERROR');
        }
        return res.status(200).json({
            participant: updatedParticipant,
            rejoined: true,
        });
    }
    // Create new participant
    const participantData = {
        room_id: roomId,
        user_id: user.id,
        role: validatedData.role,
        display_name: validatedData.displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'Anonymous',
        avatar_url: user.user_metadata?.avatar_url,
        presence_status: 'online',
    };
    const { data: participant, error: participantError } = await supabase_1.supabase
        .from('participants')
        .insert(participantData)
        .select()
        .single();
    if (participantError) {
        console.error('Failed to create participant:', participantError);
        if (participantError.code === '23505') { // Unique constraint violation
            throw new APIError('User is already in this room', 409, 'ALREADY_JOINED');
        }
        throw new APIError('Failed to join room', 500, 'DATABASE_ERROR');
    }
    // Create initial presence record
    const { error: presenceError } = await supabase_1.supabase
        .from('presence')
        .insert({
        participant_id: participant.id,
        room_id: roomId,
        status: 'online',
        activity_type: 'joined',
    });
    if (presenceError) {
        console.error('Failed to create presence record:', presenceError);
        // Non-critical error, don't fail the request
    }
    return res.status(201).json({
        participant,
        room: {
            id: room.id,
            name: room.name,
        },
        joined: true,
    });
}
async function handleLeaveRoom(req, res, roomId) {
    const user = await getAuthenticatedUser(req);
    // Find participant record
    const { data: participant, error: participantError } = await supabase_1.supabase
        .from('participants')
        .select('id, role')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();
    if (participantError) {
        if (participantError.code === 'PGRST116') {
            throw new APIError('User is not in this room', 404, 'NOT_IN_ROOM');
        }
        throw new APIError('Failed to find participant', 500, 'DATABASE_ERROR');
    }
    // Update presence to offline instead of deleting (for history)
    const { error: presenceError } = await supabase_1.supabase
        .from('presence')
        .update({
        status: 'offline',
        activity_type: 'left',
    })
        .eq('participant_id', participant.id);
    if (presenceError) {
        console.error('Failed to update presence:', presenceError);
    }
    // Update participant status to offline
    const { error: updateError } = await supabase_1.supabase
        .from('participants')
        .update({
        presence_status: 'offline',
        last_seen: new Date().toISOString(),
    })
        .eq('id', participant.id);
    if (updateError) {
        console.error('Failed to update participant:', updateError);
        throw new APIError('Failed to leave room', 500, 'DATABASE_ERROR');
    }
    // If the leaving user is the owner, we might want to transfer ownership
    // or mark the room as inactive. For now, we'll just leave it as is.
    return res.status(200).json({
        success: true,
        left: true,
    });
}
//# sourceMappingURL=join.js.map