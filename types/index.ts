/**
 * TypeScript type definitions for the collaboration backend
 */

// Database types (generated from Supabase)
export interface Database {
	public: {
		Tables: {
			rooms: {
				Row: {
					id: string;
					name: string;
					description: string | null;
					owner_id: string;
					is_public: boolean;
					max_participants: number;
					settings: Json | null;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					name: string;
					description?: string | null;
					owner_id: string;
					is_public?: boolean;
					max_participants?: number;
					settings?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					name?: string;
					description?: string | null;
					owner_id?: string;
					is_public?: boolean;
					max_participants?: number;
					settings?: Json | null;
					created_at?: string;
					updated_at?: string;
				};
			};
			participants: {
				Row: {
					id: string;
					room_id: string;
					user_id: string;
					display_name: string;
					color: string;
					avatar_url: string | null;
					is_owner: boolean;
					status: 'online' | 'idle' | 'offline';
					last_seen: string;
					joined_at: string;
					left_at: string | null;
				};
				Insert: {
					id?: string;
					room_id: string;
					user_id: string;
					display_name: string;
					color: string;
					avatar_url?: string | null;
					is_owner?: boolean;
					status?: 'online' | 'idle' | 'offline';
					last_seen?: string;
					joined_at?: string;
					left_at?: string | null;
				};
				Update: {
					id?: string;
					room_id?: string;
					user_id?: string;
					display_name?: string;
					color?: string;
					avatar_url?: string | null;
					is_owner?: boolean;
					status?: 'online' | 'idle' | 'offline';
					last_seen?: string;
					joined_at?: string;
					left_at?: string | null;
				};
			};
			documents: {
				Row: {
					id: string;
					room_id: string;
					file_path: string;
					content: string;
					version: number;
					language: string;
					checksum: string;
					last_modified_by: string;
					created_at: string;
					updated_at: string;
				};
				Insert: {
					id?: string;
					room_id: string;
					file_path: string;
					content: string;
					version?: number;
					language: string;
					checksum: string;
					last_modified_by: string;
					created_at?: string;
					updated_at?: string;
				};
				Update: {
					id?: string;
					room_id?: string;
					file_path?: string;
					content?: string;
					version?: number;
					language?: string;
					checksum?: string;
					last_modified_by?: string;
					created_at?: string;
					updated_at?: string;
				};
			};
			operations: {
				Row: {
					id: string;
					document_id: string;
					participant_id: string;
					operation_type: 'insert' | 'delete' | 'retain';
					position: number;
					content: string | null;
					length: number;
					version: number;
					timestamp: string;
					applied: boolean;
				};
				Insert: {
					id?: string;
					document_id: string;
					participant_id: string;
					operation_type: 'insert' | 'delete' | 'retain';
					position: number;
					content?: string | null;
					length: number;
					version: number;
					timestamp?: string;
					applied?: boolean;
				};
				Update: {
					id?: string;
					document_id?: string;
					participant_id?: string;
					operation_type?: 'insert' | 'delete' | 'retain';
					position?: number;
					content?: string | null;
					length?: number;
					version?: number;
					timestamp?: string;
					applied?: boolean;
				};
			};
			cursors: {
				Row: {
					id: string;
					participant_id: string;
					document_id: string;
					line: number;
					character: number;
					selection_start_line: number | null;
					selection_start_character: number | null;
					selection_end_line: number | null;
					selection_end_character: number | null;
					updated_at: string;
				};
				Insert: {
					id?: string;
					participant_id: string;
					document_id: string;
					line: number;
					character: number;
					selection_start_line?: number | null;
					selection_start_character?: number | null;
					selection_end_line?: number | null;
					selection_end_character?: number | null;
					updated_at?: string;
				};
				Update: {
					id?: string;
					participant_id?: string;
					document_id?: string;
					line?: number;
					character?: number;
					selection_start_line?: number | null;
					selection_start_character?: number | null;
					selection_end_line?: number | null;
					selection_end_character?: number | null;
					updated_at?: string;
				};
			};
			presence: {
				Row: {
					id: string;
					participant_id: string;
					room_id: string;
					status: 'online' | 'idle' | 'offline' | 'away';
					last_activity: string;
					metadata: Json | null;
					updated_at: string;
				};
				Insert: {
					id?: string;
					participant_id: string;
					room_id: string;
					status?: 'online' | 'idle' | 'offline' | 'away';
					last_activity?: string;
					metadata?: Json | null;
					updated_at?: string;
				};
				Update: {
					id?: string;
					participant_id?: string;
					room_id?: string;
					status?: 'online' | 'idle' | 'offline' | 'away';
					last_activity?: string;
					metadata?: Json | null;
					updated_at?: string;
				};
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			cleanup_expired_rooms: {
				Args: Record<PropertyKey, never>;
				Returns: number;
			};
			get_room_participants: {
				Args: {
					room_id: string;
				};
				Returns: {
					id: string;
					display_name: string;
					color: string;
					avatar_url: string | null;
					is_owner: boolean;
					status: string;
					last_seen: string;
					joined_at: string;
				}[];
			};
			apply_operation: {
				Args: {
					p_document_id: string;
					p_participant_id: string;
					p_operation_type: string;
					p_position: number;
					p_content: string | null;
					p_length: number;
					p_version: number;
				};
				Returns: {
					success: boolean;
					new_version: number;
					conflict: boolean;
				};
			};
		};
		Enums: {
			participant_status: 'online' | 'idle' | 'offline';
			operation_type: 'insert' | 'delete' | 'retain';
			presence_status: 'online' | 'idle' | 'offline' | 'away';
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
}

// JSON type for flexible data
export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

// Application types
export interface User {
	id: string;
	email: string;
	displayName: string;
	avatarUrl?: string;
	createdAt: string;
	lastSeen: string;
}

export interface Room {
	id: string;
	name: string;
	description?: string;
	ownerId: string;
	isPublic: boolean;
	maxParticipants: number;
	currentParticipants: number;
	settings?: RoomSettings;
	createdAt: string;
	updatedAt: string;
	participants: Participant[];
}

export interface RoomSettings {
	allowGuestAccess?: boolean;
	requireApproval?: boolean;
	allowFileUpload?: boolean;
	allowVoiceChat?: boolean;
	allowVideoChat?: boolean;
	maxFileSize?: number;
	allowedFileTypes?: string[];
	theme?: 'light' | 'dark' | 'auto';
	language?: string;
}

export interface Participant {
	id: string;
	roomId: string;
	userId: string;
	displayName: string;
	color: string;
	avatarUrl?: string;
	isOwner: boolean;
	status: ParticipantStatus;
	lastSeen: string;
	joinedAt: string;
	leftAt?: string;
}

export type ParticipantStatus = 'online' | 'idle' | 'offline';

export interface Document {
	id: string;
	roomId: string;
	filePath: string;
	content: string;
	version: number;
	language: string;
	checksum: string;
	lastModifiedBy: string;
	createdAt: string;
	updatedAt: string;
}

export interface Operation {
	id: string;
	documentId: string;
	participantId: string;
	operationType: OperationType;
	position: number;
	content?: string;
	length: number;
	version: number;
	timestamp: string;
	applied: boolean;
}

export type OperationType = 'insert' | 'delete' | 'retain';

export interface CursorPosition {
	line: number;
	character: number;
}

export interface Selection {
	start: CursorPosition;
	end: CursorPosition;
}

export interface Cursor {
	id: string;
	participantId: string;
	documentId: string;
	position: CursorPosition;
	selection?: Selection;
	updatedAt: string;
}

export interface Presence {
	id: string;
	participantId: string;
	roomId: string;
	status: PresenceStatus;
	lastActivity: string;
	metadata?: PresenceMetadata;
	updatedAt: string;
}

export type PresenceStatus = 'online' | 'idle' | 'offline' | 'away';

export interface PresenceMetadata {
	activeDocument?: string;
	isTyping?: boolean;
	currentLine?: number;
	viewportStart?: number;
	viewportEnd?: number;
	[key: string]: any;
}

// Operational Transform types
export interface TextOperation {
	type: OperationType;
	position: number;
	content?: string;
	length: number;
}

export interface TransformResult {
	transformed: TextOperation;
	inverse: TextOperation;
}

// WebSocket message types
export interface WebSocketMessage {
	type: WebSocketMessageType;
	payload: any;
	timestamp: string;
	senderId?: string;
}

export type WebSocketMessageType =
	| 'join-room'
	| 'leave-room'
	| 'operation'
	| 'cursor-update'
	| 'selection-update'
	| 'presence-update'
	| 'document-open'
	| 'document-close'
	| 'participant-joined'
	| 'participant-left'
	| 'participant-updated'
	| 'room-updated'
	| 'sync-request'
	| 'sync-response'
	| 'error'
	| 'ping'
	| 'pong';

// API response types
export interface ApiResponse<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	message?: string;
	timestamp: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
		hasNext: boolean;
		hasPrev: boolean;
	};
}

// Error types
export interface CollaborationError extends Error {
	code?: string;
	statusCode?: number;
	details?: any;
}

export interface ValidationError extends CollaborationError {
	field?: string;
	value?: any;
}

// Request/Response types
export interface CreateRoomRequest {
	name: string;
	description?: string;
	isPublic?: boolean;
	maxParticipants?: number;
	settings?: RoomSettings;
}

export interface JoinRoomRequest {
	roomId: string;
	displayName: string;
	color?: string;
	avatarUrl?: string;
}

export interface UpdateRoomRequest {
	name?: string;
	description?: string;
	isPublic?: boolean;
	maxParticipants?: number;
	settings?: RoomSettings;
}

export interface CreateDocumentRequest {
	roomId: string;
	filePath: string;
	content: string;
	language: string;
}

export interface ApplyOperationRequest {
	documentId: string;
	operations: TextOperation[];
	version: number;
}

export interface UpdateCursorRequest {
	documentId: string;
	position: CursorPosition;
	selection?: Selection;
}

export interface UpdatePresenceRequest {
	status: PresenceStatus;
	metadata?: PresenceMetadata;
}

// Event types for EventEmitter
export interface CollaborationEvents {
	// Connection events
	'connection:established': () => void;
	'connection:lost': () => void;
	'connection:error': (error: CollaborationError) => void;
	'connection:reconnecting': (attempt: number) => void;
	'connection:reconnected': () => void;

	// Room events
	'room:joined': (room: Room) => void;
	'room:left': (roomId: string) => void;
	'room:updated': (room: Room) => void;
	'room:participant-joined': (participant: Participant) => void;
	'room:participant-left': (participant: Participant) => void;
	'room:participant-updated': (participant: Participant) => void;

	// Document events
	'document:opened': (document: Document) => void;
	'document:closed': (documentId: string) => void;
	'document:updated': (document: Document) => void;
	'document:operation-applied': (operation: Operation) => void;
	'document:conflict': (operation: Operation, conflict: Operation) => void;

	// Cursor events
	'cursor:updated': (cursor: Cursor) => void;
	'cursor:selection-updated': (cursor: Cursor) => void;

	// Presence events
	'presence:updated': (presence: Presence) => void;
	'presence:participant-typing': (participantId: string, isTyping: boolean) => void;

	// Sync events
	'sync:started': () => void;
	'sync:completed': () => void;
	'sync:failed': (error: CollaborationError) => void;

	// Error events
	'error': (error: CollaborationError) => void;
}

// Configuration types
export interface CollaborationConfig {
	apiUrl: string;
	websocketUrl: string;
	reconnectAttempts: number;
	reconnectDelay: number;
	operationBatchSize: number;
	cursorThrottleMs: number;
	presenceHeartbeatMs: number;
	debug: boolean;
}

export interface SupabaseConfig {
	url: string;
	anonKey: string;
	serviceRoleKey?: string;
}

export interface VercelConfig {
	projectId?: string;
	orgId?: string;
	token?: string;
}

// Utility types
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & {
	[P in K]-?: T[P];
};

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & {
	[P in K]?: T[P];
};

// Brand types for type safety
export type RoomId = string & { readonly __brand: 'RoomId' };
export type ParticipantId = string & { readonly __brand: 'ParticipantId' };
export type DocumentId = string & { readonly __brand: 'DocumentId' };
export type OperationId = string & { readonly __brand: 'OperationId' };
export type UserId = string & { readonly __brand: 'UserId' };

// Type guards
export function isRoomId(value: string): value is RoomId {
	return typeof value === 'string' && value.length > 0;
}

export function isParticipantId(value: string): value is ParticipantId {
	return typeof value === 'string' && value.length > 0;
}

export function isDocumentId(value: string): value is DocumentId {
	return typeof value === 'string' && value.length > 0;
}

export function isOperationId(value: string): value is OperationId {
	return typeof value === 'string' && value.length > 0;
}

export function isUserId(value: string): value is UserId {
	return typeof value === 'string' && value.length > 0;
}

// Export database types for external use
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
export type Functions<T extends keyof Database['public']['Functions']> = Database['public']['Functions'][T];
