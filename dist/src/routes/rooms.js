"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const supabase_1 = require("../../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Request validation schemas
const createRoomSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255),
    description: zod_1.z.string().optional(),
    maxParticipants: zod_1.z.number().min(1).max(50).default(10),
    allowAnonymous: zod_1.z.boolean().default(false),
    requireApproval: zod_1.z.boolean().default(false),
    expiresIn: zod_1.z.number().optional(), // hours
});
const updateRoomSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(255).optional(),
    description: zod_1.z.string().optional(),
    maxParticipants: zod_1.z.number().min(1).max(50).optional(),
    status: zod_1.z.enum(['active', 'inactive', 'archived']).optional(),
});
// Helper functions
async function checkRoomAccess(userId, roomId) {
    const { data: participant, error } = await supabase_1.supabase
        .from('participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .single();
    if (error || !participant) {
        throw new auth_1.APIError('Access denied or room not found', 403, 'ACCESS_DENIED');
    }
    return participant;
}
// GET /api/rooms - List user's rooms
router.get('/', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const { status, role } = req.query;
        let query = supabase_1.supabase
            .from('rooms')
            .select(`
				*,
				participants!inner(
					id,
					role,
					display_name,
					presence_status,
					joined_at
				)
			`)
            .eq('participants.user_id', userId);
        // Apply filters
        if (status && typeof status === 'string') {
            query = query.eq('status', status);
        }
        if (role && typeof role === 'string') {
            query = query.eq('participants.role', role);
        }
        const { data: rooms, error } = await query
            .order('updated_at', { ascending: false });
        if (error) {
            throw new auth_1.APIError('Failed to fetch rooms', 500, 'DATABASE_ERROR');
        }
        res.json({ rooms });
    }
    catch (error) {
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Error fetching rooms:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/rooms - Create new room
router.post('/', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user.id;
        const validatedData = createRoomSchema.parse(req.body);
        // Calculate expiry if specified
        let expiresAt = null;
        if (validatedData.expiresIn) {
            const expiry = new Date();
            expiry.setHours(expiry.getHours() + validatedData.expiresIn);
            expiresAt = expiry.toISOString();
        }
        // Create room
        const roomData = {
            name: validatedData.name,
            description: validatedData.description,
            owner_id: userId,
            max_participants: validatedData.maxParticipants,
            allow_anonymous: validatedData.allowAnonymous,
            require_approval: validatedData.requireApproval,
            expires_at: expiresAt,
            status: 'active',
            metadata: {},
        };
        const { data: room, error: roomError } = await supabase_1.supabase
            .from('rooms')
            .insert(roomData)
            .select()
            .single();
        if (roomError) {
            throw new auth_1.APIError('Failed to create room', 500, 'DATABASE_ERROR');
        }
        // Add creator as owner participant
        const participantData = {
            room_id: room.id,
            user_id: userId,
            role: 'owner',
            presence_status: 'online',
            display_name: req.user.user_metadata?.full_name || req.user.email || 'Anonymous',
            joined_at: new Date().toISOString(),
            metadata: {},
        };
        const { error: participantError } = await supabase_1.supabase
            .from('participants')
            .insert(participantData);
        if (participantError) {
            // Rollback room creation
            await supabase_1.supabase.from('rooms').delete().eq('id', room.id);
            throw new auth_1.APIError('Failed to create room participant', 500, 'DATABASE_ERROR');
        }
        res.status(201).json({ room });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid request data', details: error.errors });
        }
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/rooms/:roomId - Get room details
router.get('/:roomId', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        // Check if user has access to this room
        await checkRoomAccess(userId, roomId);
        // Fetch room with participants and documents
        const { data: room, error } = await supabase_1.supabase
            .from('rooms')
            .select(`
				*,
				participants(
					id,
					user_id,
					role,
					presence_status,
					display_name,
					avatar_url,
					color,
					last_seen,
					joined_at
				),
				documents(
					id,
					file_path,
					language,
					version,
					size_bytes,
					line_count,
					created_at,
					updated_at
				)
			`)
            .eq('id', roomId)
            .single();
        if (error) {
            throw new auth_1.APIError('Room not found', 404, 'ROOM_NOT_FOUND');
        }
        res.json({ room });
    }
    catch (error) {
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Error fetching room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PUT /api/rooms/:roomId - Update room
router.put('/:roomId', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        const validatedData = updateRoomSchema.parse(req.body);
        // Check if user is owner
        const participant = await checkRoomAccess(userId, roomId);
        if (participant.role !== 'owner') {
            throw new auth_1.APIError('Only room owners can update room settings', 403, 'ACCESS_DENIED');
        }
        const { data: room, error } = await supabase_1.supabase
            .from('rooms')
            .update({
            ...validatedData,
            updated_at: new Date().toISOString(),
        })
            .eq('id', roomId)
            .select()
            .single();
        if (error) {
            throw new auth_1.APIError('Failed to update room', 500, 'DATABASE_ERROR');
        }
        res.json({ room });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid request data', details: error.errors });
        }
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Error updating room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/rooms/:roomId - Delete room
router.delete('/:roomId', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        // Check if user is owner
        const participant = await checkRoomAccess(userId, roomId);
        if (participant.role !== 'owner') {
            throw new auth_1.APIError('Only room owners can delete rooms', 403, 'ACCESS_DENIED');
        }
        // Delete room (cascading deletes will handle related records)
        const { error } = await supabase_1.supabase
            .from('rooms')
            .delete()
            .eq('id', roomId);
        if (error) {
            throw new auth_1.APIError('Failed to delete room', 500, 'DATABASE_ERROR');
        }
        res.status(204).send();
    }
    catch (error) {
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Error deleting room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/rooms/:roomId/join - Join room
router.post('/:roomId/join', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        // Check if room exists and is active
        const { data: room, error: roomError } = await supabase_1.supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .eq('status', 'active')
            .single();
        if (roomError || !room) {
            throw new auth_1.APIError('Room not found or inactive', 404, 'ROOM_NOT_FOUND');
        }
        // Check if user is already a participant
        const { data: existingParticipant } = await supabase_1.supabase
            .from('participants')
            .select('id')
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .single();
        if (existingParticipant) {
            throw new auth_1.APIError('Already a participant in this room', 409, 'ALREADY_PARTICIPANT');
        }
        // Check room capacity
        const { count: participantCount } = await supabase_1.supabase
            .from('participants')
            .select('id', { count: 'exact' })
            .eq('room_id', roomId);
        if (participantCount && participantCount >= room.max_participants) {
            throw new auth_1.APIError('Room is full', 409, 'ROOM_FULL');
        }
        // Add participant
        const participantData = {
            room_id: roomId,
            user_id: userId,
            role: 'editor',
            presence_status: 'online',
            display_name: req.user.user_metadata?.full_name || req.user.email || 'Anonymous',
            joined_at: new Date().toISOString(),
            metadata: {},
        };
        const { data: participant, error: participantError } = await supabase_1.supabase
            .from('participants')
            .insert(participantData)
            .select()
            .single();
        if (participantError) {
            throw new auth_1.APIError('Failed to join room', 500, 'DATABASE_ERROR');
        }
        res.status(201).json({ participant });
    }
    catch (error) {
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Error joining room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/rooms/:roomId/leave - Leave room
router.post('/:roomId/leave', auth_1.authenticateUser, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        // Get participant info
        const participant = await checkRoomAccess(userId, roomId);
        // If user is owner, check if there are other participants
        if (participant.role === 'owner') {
            const { count: otherParticipants } = await supabase_1.supabase
                .from('participants')
                .select('id', { count: 'exact' })
                .eq('room_id', roomId)
                .neq('user_id', userId);
            if (otherParticipants && otherParticipants > 0) {
                throw new auth_1.APIError('Room owner cannot leave while other participants are present. Transfer ownership or delete the room.', 409, 'OWNER_CANNOT_LEAVE');
            }
        }
        // Remove participant
        const { error } = await supabase_1.supabase
            .from('participants')
            .delete()
            .eq('id', participant.id);
        if (error) {
            throw new auth_1.APIError('Failed to leave room', 500, 'DATABASE_ERROR');
        }
        res.status(204).send();
    }
    catch (error) {
        if (error instanceof auth_1.APIError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('Error leaving room:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=rooms.js.map