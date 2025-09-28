import { VercelRequest, VercelResponse } from '@vercel/node';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { supabase, createRoomSubscription, createPresenceSubscription } from '../lib/supabase';
import { z } from 'zod';

// WebSocket event schemas
const joinRoomEventSchema = z.object({
	roomId: z.string().uuid(),
	token: z.string(),
});

const cursorUpdateEventSchema = z.object({
	roomId: z.string().uuid(),
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

const operationEventSchema = z.object({
	roomId: z.string().uuid(),
	documentId: z.string().uuid(),
	operations: z.array(z.object({
		type: z.enum(['insert', 'delete', 'retain', 'cursor_move', 'selection_change']),
		position: z.number().min(0),
		length: z.number().min(0).optional(),
		content: z.string().optional(),
		clientId: z.string().uuid(),
		clientSequence: z.number().min(0),
	})),
});

// Connection management
const roomConnections = new Map<string, Set<string>>(); // roomId -> Set<socketId>
const userConnections = new Map<string, string>(); // userId -> socketId
const socketUsers = new Map<string, { userId: string; participantId: string }>(); // socketId -> user info

// Rate limiting
const rateLimits = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(socketId: string, limit: number = 100, windowMs: number = 60000): boolean {
	const now = Date.now();
	const clientData = rateLimits.get(socketId);

	if (!clientData || now > clientData.resetTime) {
		rateLimits.set(socketId, { count: 1, resetTime: now + windowMs });
		return true;
	}

	if (clientData.count >= limit) {
		return false;
	}

	clientData.count++;
	return true;
}

// Authentication helper
async function authenticateSocket(token: string) {
	const { data: { user }, error } = await supabase.auth.getUser(token);

	if (error || !user) {
		throw new Error('Invalid authentication token');
	}

	return user;
}

// Room access check
async function checkRoomAccess(userId: string, roomId: string) {
	const { data: participant, error } = await supabase
		.from('participants')
		.select('id, role, presence_status')
		.eq('room_id', roomId)
		.eq('user_id', userId)
		.single();

	if (error || !participant) {
		throw new Error('Access denied to this room');
	}

	return participant;
}

// Operational Transform (simplified)
function transformOperation(op1: any, op2: any) {
	// This is a simplified OT implementation
	// In production, use a proper library like ShareJS or Yjs

	if (op1.type === 'insert' && op2.type === 'insert') {
		if (op1.position <= op2.position) {
			return { ...op2, position: op2.position + (op1.content?.length || 0) };
		}
	} else if (op1.type === 'delete' && op2.type === 'insert') {
		if (op1.position < op2.position) {
			return { ...op2, position: Math.max(op1.position, op2.position - (op1.length || 0)) };
		}
	} else if (op1.type === 'insert' && op2.type === 'delete') {
		if (op1.position <= op2.position) {
			return { ...op2, position: op2.position + (op1.content?.length || 0) };
		}
	} else if (op1.type === 'delete' && op2.type === 'delete') {
		if (op1.position <= op2.position) {
			return { ...op2, position: Math.max(op1.position, op2.position - (op1.length || 0)) };
		}
	}

	return op2;
}

// In-memory server instance (Vercel limitations)
let io: SocketIOServer;

export default function handler(req: VercelRequest, res: VercelResponse) {
	const socket = res.socket as any;
	if (!socket?.server?.io) {
		console.log('Setting up Socket.IO server...');

		const httpServer = createServer();
		io = new SocketIOServer(httpServer, {
			cors: {
				origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
				methods: ['GET', 'POST'],
				credentials: true,
			},
			transports: ['websocket', 'polling'],
			pingTimeout: 60000,
			pingInterval: 25000,
		});

		// Socket.IO event handlers
		io.on('connection', (socket) => {
			console.log(`Client connected: ${socket.id}`);

			// Handle authentication and room joining
			socket.on('join-room', async (data) => {
				try {
					if (!checkRateLimit(socket.id, 10, 60000)) {
						socket.emit('error', { message: 'Rate limit exceeded', code: 'RATE_LIMIT' });
						return;
					}

					const validatedData = joinRoomEventSchema.parse(data);

					// Authenticate user
					const user = await authenticateSocket(validatedData.token);

					// Check room access
					const participant = await checkRoomAccess(user.id, validatedData.roomId);

					// Store user info
					socketUsers.set(socket.id, {
						userId: user.id,
						participantId: participant.id
					});

					// Join room
					socket.join(validatedData.roomId);

					// Track connection
					if (!roomConnections.has(validatedData.roomId)) {
						roomConnections.set(validatedData.roomId, new Set());
					}
					roomConnections.get(validatedData.roomId)!.add(socket.id);
					userConnections.set(user.id, socket.id);

					// Update participant presence
					await supabase
						.from('participants')
						.update({
							presence_status: 'online',
							last_seen: new Date().toISOString(),
						})
						.eq('id', participant.id);

					// Set up real-time subscriptions for this room
					const roomSubscription = createRoomSubscription(validatedData.roomId, (payload: any) => {
						socket.to(validatedData.roomId).emit('room-update', payload);
					});

					const presenceSubscription = createPresenceSubscription(validatedData.roomId, (payload: any) => {
						socket.to(validatedData.roomId).emit('presence-update', payload);
					});

					// Clean up subscriptions on disconnect
					socket.on('disconnect', () => {
						roomSubscription.unsubscribe();
						presenceSubscription.unsubscribe();
					});

					socket.emit('joined-room', {
						roomId: validatedData.roomId,
						participantId: participant.id,
						success: true
					});

					// Notify others
					socket.to(validatedData.roomId).emit('participant-joined', {
						participantId: participant.id,
						userId: user.id,
					});

				} catch (error) {
					console.error('Join room error:', error);
					socket.emit('error', {
						message: error instanceof Error ? error.message : 'Failed to join room',
						code: 'JOIN_ROOM_ERROR'
					});
				}
			});

			// Handle cursor updates
			socket.on('cursor-update', async (data) => {
				try {
					if (!checkRateLimit(socket.id, 50, 1000)) {
						return; // Silently ignore excessive cursor updates
					}

					const validatedData = cursorUpdateEventSchema.parse(data);
					const userInfo = socketUsers.get(socket.id);

					if (!userInfo) {
						socket.emit('error', { message: 'Not authenticated', code: 'UNAUTHORIZED' });
						return;
					}

					// Update cursor in database
					await supabase
						.from('cursors')
						.upsert({
							participant_id: userInfo.participantId,
							document_id: validatedData.documentId,
							line: validatedData.line,
							column: validatedData.column,
							selection_start: validatedData.selectionStart || null,
							selection_end: validatedData.selectionEnd || null,
						}, {
							onConflict: 'participant_id,document_id',
						});

					// Broadcast to room (excluding sender)
					socket.to(validatedData.roomId).emit('cursor-updated', {
						participantId: userInfo.participantId,
						documentId: validatedData.documentId,
						line: validatedData.line,
						column: validatedData.column,
						selectionStart: validatedData.selectionStart,
						selectionEnd: validatedData.selectionEnd,
					});

				} catch (error) {
					console.error('Cursor update error:', error);
					socket.emit('error', {
						message: 'Failed to update cursor',
						code: 'CURSOR_UPDATE_ERROR'
					});
				}
			});

			// Handle document operations
			socket.on('document-operation', async (data) => {
				try {
					if (!checkRateLimit(socket.id, 200, 60000)) {
						socket.emit('error', { message: 'Rate limit exceeded', code: 'RATE_LIMIT' });
						return;
					}

					const validatedData = operationEventSchema.parse(data);
					const userInfo = socketUsers.get(socket.id);

					if (!userInfo) {
						socket.emit('error', { message: 'Not authenticated', code: 'UNAUTHORIZED' });
						return;
					}

					// Get participant role
					const { data: participant } = await supabase
						.from('participants')
						.select('role')
						.eq('id', userInfo.participantId)
						.single();

					if (participant?.role === 'viewer') {
						socket.emit('error', { message: 'Viewers cannot edit documents', code: 'INSUFFICIENT_PERMISSIONS' });
						return;
					}

					// Get current document content and concurrent operations
					const { data: document } = await supabase
						.from('documents')
						.select('id, content, version')
						.eq('id', validatedData.documentId)
						.single();

					if (!document) {
						socket.emit('error', { message: 'Document not found', code: 'DOCUMENT_NOT_FOUND' });
						return;
					}

					// Apply operational transforms and store operations
					let currentContent = document.content;
					const appliedOperations = [];

					for (const operation of validatedData.operations) {
						// Apply operation to content
						if (operation.type === 'insert') {
							currentContent =
								currentContent.slice(0, operation.position) +
								(operation.content || '') +
								currentContent.slice(operation.position);
						} else if (operation.type === 'delete') {
							currentContent =
								currentContent.slice(0, operation.position) +
								currentContent.slice(operation.position + (operation.length || 0));
						}

						// Store operation
						const { data: storedOperation } = await supabase
							.from('operations')
							.insert({
								document_id: validatedData.documentId,
								participant_id: userInfo.participantId,
								operation_type: operation.type,
								position: operation.position,
								length: operation.length,
								content: operation.content,
								client_id: operation.clientId,
								client_sequence: operation.clientSequence,
							})
							.select()
							.single();

						if (storedOperation) {
							appliedOperations.push(storedOperation);
						}
					}

					// Update document
					await supabase
						.from('documents')
						.update({
							content: currentContent,
							version: document.version + validatedData.operations.length,
							size_bytes: currentContent.length,
							line_count: Math.max(1, currentContent.split('\n').length),
						})
						.eq('id', validatedData.documentId);

					// Broadcast operations to room (excluding sender)
					socket.to(validatedData.roomId).emit('operations-applied', {
						documentId: validatedData.documentId,
						operations: appliedOperations,
						participantId: userInfo.participantId,
					});

					// Confirm to sender
					socket.emit('operations-confirmed', {
						documentId: validatedData.documentId,
						operations: appliedOperations,
					});

				} catch (error) {
					console.error('Document operation error:', error);
					socket.emit('error', {
						message: 'Failed to apply operation',
						code: 'OPERATION_ERROR'
					});
				}
			});

			// Handle disconnect
			socket.on('disconnect', async () => {
				console.log(`Client disconnected: ${socket.id}`);

				const userInfo = socketUsers.get(socket.id);
				if (userInfo) {
					// Update participant presence to offline
					await supabase
						.from('participants')
						.update({
							presence_status: 'offline',
							last_seen: new Date().toISOString(),
						})
						.eq('id', userInfo.participantId);

					// Clean up connections tracking
					userConnections.delete(userInfo.userId);
					socketUsers.delete(socket.id);

					// Remove from room connections
					for (const [roomId, connections] of roomConnections.entries()) {
						if (connections.has(socket.id)) {
							connections.delete(socket.id);

							// Notify room about participant leaving
							socket.to(roomId).emit('participant-left', {
								participantId: userInfo.participantId,
								userId: userInfo.userId,
							});

							if (connections.size === 0) {
								roomConnections.delete(roomId);
							}
							break;
						}
					}
				}

				// Clean up rate limiting
				rateLimits.delete(socket.id);
			});
		});

		// Store io instance
		(res.socket as any).server.io = io;
	}

	res.end();
}
