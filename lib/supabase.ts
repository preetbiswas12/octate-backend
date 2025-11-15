import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from './supabase-types';
import * as dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing Supabase environment variables');
}

// Client for public operations (with RLS)
export const supabase: SupabaseClient<Database> = createClient(
	supabaseUrl as string,
	supabaseAnonKey as string,
	{
		auth: {
			autoRefreshToken: true,
			persistSession: false, // Server-side, don't persist
		},
		realtime: {
			params: {
				eventsPerSecond: 10, // Rate limit for performance
			},
		},
	}
);

// Admin client for server operations (bypasses RLS)
export const supabaseAdmin: SupabaseClient<Database> | null = supabaseServiceRoleKey
	? createClient(
		supabaseUrl,
		supabaseServiceRoleKey,
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		}
	)
	: null;

// Type exports for use throughout the application
export type { Database } from './supabase-types';

// Helper type aliases for easier access
export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

// Helper types
export type Room = Database['public']['Tables']['rooms']['Row'];
export type RoomInsert = Database['public']['Tables']['rooms']['Insert'];
export type RoomUpdate = Database['public']['Tables']['rooms']['Update'];

export type Participant = Database['public']['Tables']['participants']['Row'];
export type ParticipantInsert = Database['public']['Tables']['participants']['Insert'];
export type ParticipantUpdate = Database['public']['Tables']['participants']['Update'];

export type Document = Database['public']['Tables']['documents']['Row'];
export type DocumentInsert = Database['public']['Tables']['documents']['Insert'];
export type DocumentUpdate = Database['public']['Tables']['documents']['Update'];

export type Operation = Database['public']['Tables']['operations']['Row'];
export type OperationInsert = Database['public']['Tables']['operations']['Insert'];
export type OperationUpdate = Database['public']['Tables']['operations']['Update'];

export type Cursor = Database['public']['Tables']['cursors']['Row'];
export type CursorInsert = Database['public']['Tables']['cursors']['Insert'];
export type CursorUpdate = Database['public']['Tables']['cursors']['Update'];

export type Presence = Database['public']['Tables']['presence']['Row'];
export type PresenceInsert = Database['public']['Tables']['presence']['Insert'];
export type PresenceUpdate = Database['public']['Tables']['presence']['Update'];

// Enum types
export type RoomStatus = Database['public']['Enums']['room_status'];
export type ParticipantRole = Database['public']['Enums']['participant_role'];
export type PresenceStatus = Database['public']['Enums']['presence_status'];
export type OperationType = Database['public']['Enums']['operation_type'];

// Utility functions
export function getSupabaseClient(authToken?: string): SupabaseClient<Database> {
	if (authToken) {
		return createClient(supabaseUrl as string, supabaseAnonKey as string, {
			global: {
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
			},
		});
	}
	return supabase;
}

// Error handling
export class SupabaseError extends Error {
	constructor(
		message: string,
		public code?: string,
		public details?: any
	) {
		super(message);
		this.name = 'SupabaseError';
	}
}

// Connection health check
export async function checkSupabaseConnection(): Promise<boolean> {
	try {
		console.log('Testing Supabase connection to:', supabaseUrl);
		console.log('Service role key available:', !!supabaseServiceRoleKey);
		console.log('Admin client available:', !!supabaseAdmin);

		// First check if environment variables are set
		if (!supabaseUrl || !supabaseAnonKey) {
			console.error('Missing Supabase environment variables');
			return false;
		}

		// Use admin client for health check to bypass RLS policies
		const client = supabaseAdmin || supabase;
		console.log('Using client type:', supabaseAdmin ? 'admin' : 'regular');
		
		// Try a simple query to test connection
		const { data, error } = await client
			.from('rooms')
			.select('id')
			.limit(1);

		if (error) {
			console.error('Supabase query error:', error.message, error.details, error.hint);
			// Even if query fails, if we can connect to Supabase, that's good enough
			// The error might just be due to empty table or RLS policies
			if (error.message.includes('relation "rooms" does not exist')) {
				console.log('Tables not initialized, but connection is working');
				return true;
			}
			return false;
		}

		console.log('Supabase connection successful, found', data?.length || 0, 'rooms');
		return true;
	} catch (e) {
		console.error('Supabase connection check failed:', e);
		return false;
	}
}

// Real-time subscription helpers
export function createRoomSubscription(
	roomId: string,
	callback: (payload: any) => void
) {
	return supabase
		.channel(`room:${roomId}`)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'operations',
				filter: `document_id=in.(select id from documents where room_id=eq.${roomId})`,
			},
			callback
		)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'cursors',
				filter: `document_id=in.(select id from documents where room_id=eq.${roomId})`,
			},
			callback
		)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'participants',
				filter: `room_id=eq.${roomId}`,
			},
			callback
		)
		.subscribe();
}

export function createPresenceSubscription(
	roomId: string,
	callback: (payload: any) => void
) {
	return supabase
		.channel(`presence:${roomId}`)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'presence',
				filter: `room_id=eq.${roomId}`,
			},
			callback
		)
		.subscribe();
}
