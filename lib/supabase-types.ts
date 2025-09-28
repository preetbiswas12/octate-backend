export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[]

export interface Database {
	public: {
		Tables: {
			rooms: {
				Row: {
					id: string
					name: string
					description: string | null
					status: 'active' | 'inactive' | 'archived'
					owner_id: string | null
					max_participants: number
					created_at: string
					updated_at: string
					expires_at: string | null
					allow_anonymous: boolean
					require_approval: boolean
					metadata: Json
				}
				Insert: {
					id?: string
					name: string
					description?: string | null
					status?: 'active' | 'inactive' | 'archived'
					owner_id?: string | null
					max_participants?: number
					created_at?: string
					updated_at?: string
					expires_at?: string | null
					allow_anonymous?: boolean
					require_approval?: boolean
					metadata?: Json
				}
				Update: {
					id?: string
					name?: string
					description?: string | null
					status?: 'active' | 'inactive' | 'archived'
					owner_id?: string | null
					max_participants?: number
					created_at?: string
					updated_at?: string
					expires_at?: string | null
					allow_anonymous?: boolean
					require_approval?: boolean
					metadata?: Json
				}
				Relationships: [
					{
						foreignKeyName: "rooms_owner_id_fkey"
						columns: ["owner_id"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					}
				]
			}
			participants: {
				Row: {
					id: string
					room_id: string
					user_id: string | null
					role: 'owner' | 'editor' | 'viewer'
					presence_status: 'online' | 'away' | 'offline'
					display_name: string | null
					avatar_url: string | null
					color: string | null
					last_seen: string
					joined_at: string
					metadata: Json
				}
				Insert: {
					id?: string
					room_id: string
					user_id?: string | null
					role?: 'owner' | 'editor' | 'viewer'
					presence_status?: 'online' | 'away' | 'offline'
					display_name?: string | null
					avatar_url?: string | null
					color?: string | null
					last_seen?: string
					joined_at?: string
					metadata?: Json
				}
				Update: {
					id?: string
					room_id?: string
					user_id?: string | null
					role?: 'owner' | 'editor' | 'viewer'
					presence_status?: 'online' | 'away' | 'offline'
					display_name?: string | null
					avatar_url?: string | null
					color?: string | null
					last_seen?: string
					joined_at?: string
					metadata?: Json
				}
				Relationships: [
					{
						foreignKeyName: "participants_room_id_fkey"
						columns: ["room_id"]
						referencedRelation: "rooms"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "participants_user_id_fkey"
						columns: ["user_id"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					}
				]
			}
			documents: {
				Row: {
					id: string
					room_id: string
					name: string
					content: string
					content_type: string
					version: number
					created_at: string
					updated_at: string
					created_by: string | null
					metadata: Json
				}
				Insert: {
					id?: string
					room_id: string
					name: string
					content?: string
					content_type?: string
					version?: number
					created_at?: string
					updated_at?: string
					created_by?: string | null
					metadata?: Json
				}
				Update: {
					id?: string
					room_id?: string
					name?: string
					content?: string
					content_type?: string
					version?: number
					created_at?: string
					updated_at?: string
					created_by?: string | null
					metadata?: Json
				}
				Relationships: [
					{
						foreignKeyName: "documents_room_id_fkey"
						columns: ["room_id"]
						isOneToOne: false
						referencedRelation: "rooms"
						referencedColumns: ["id"]
					},
					{
						foreignKeyName: "documents_created_by_fkey"
						columns: ["created_by"]
						isOneToOne: false
						referencedRelation: "users"
						referencedColumns: ["id"]
					}
				]
			}
			operations: {
				Row: {
					id: string
					document_id: string
					client_id: string
					client_sequence: number
					server_sequence: number
					operation_type: 'insert' | 'delete' | 'retain' | 'cursor_move' | 'selection_change'
					position: number
					length: number | null
					content: string | null
					created_at: string
					metadata: Json
				}
				Insert: {
					id?: string
					document_id: string
					client_id: string
					client_sequence: number
					server_sequence?: number
					operation_type: 'insert' | 'delete' | 'retain' | 'cursor_move' | 'selection_change'
					position: number
					length?: number | null
					content?: string | null
					created_at?: string
					metadata?: Json
				}
				Update: {
					id?: string
					document_id?: string
					client_id?: string
					client_sequence?: number
					server_sequence?: number
					operation_type?: 'insert' | 'delete' | 'retain' | 'cursor_move' | 'selection_change'
					position?: number
					length?: number | null
					content?: string | null
					created_at?: string
					metadata?: Json
				}
				Relationships: [
					{
						foreignKeyName: "operations_document_id_fkey"
						columns: ["document_id"]
						isOneToOne: false
						referencedRelation: "documents"
						referencedColumns: ["id"]
					}
				]
			}
		}
		Views: {
			[_ in never]: never
		}
		Functions: {
			[_ in never]: never
		}
		Enums: {
			room_status: 'active' | 'inactive' | 'archived'
			participant_role: 'owner' | 'editor' | 'viewer'
			presence_status: 'online' | 'away' | 'offline'
			operation_type: 'insert' | 'delete' | 'retain' | 'cursor_move' | 'selection_change'
		}
		CompositeTypes: {
			[_ in never]: never
		}
	}
}
