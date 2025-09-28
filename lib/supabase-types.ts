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
          status: "active" | "inactive" | "archived"
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
          status?: "active" | "inactive" | "archived"
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
          status?: "active" | "inactive" | "archived"
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
          role: "owner" | "editor" | "viewer"
          presence_status: "online" | "away" | "offline"
          display_name: string | null
          avatar_url: string | null
          color: string | null
          last_seen: string
          joined_at: string
          cursor_position: Json | null
          selection_range: Json | null
          metadata: Json
        }
        Insert: {
          id?: string
          room_id: string
          user_id?: string | null
          role?: "owner" | "editor" | "viewer"
          presence_status?: "online" | "away" | "offline"
          display_name?: string | null
          avatar_url?: string | null
          color?: string | null
          last_seen?: string
          joined_at?: string
          cursor_position?: Json | null
          selection_range?: Json | null
          metadata?: Json
        }
        Update: {
          id?: string
          room_id?: string
          user_id?: string | null
          role?: "owner" | "editor" | "viewer"
          presence_status?: "online" | "away" | "offline"
          display_name?: string | null
          avatar_url?: string | null
          color?: string | null
          last_seen?: string
          joined_at?: string
          cursor_position?: Json | null
          selection_range?: Json | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
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
          file_path: string
          content: string
          language: string | null
          version: number
          last_operation_timestamp: string
          size_bytes: number
          line_count: number
          created_at: string
          updated_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          room_id: string
          file_path: string
          content?: string
          language?: string | null
          version?: number
          last_operation_timestamp?: string
          size_bytes?: number
          line_count?: number
          created_at?: string
          updated_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          room_id?: string
          file_path?: string
          content?: string
          language?: string | null
          version?: number
          last_operation_timestamp?: string
          size_bytes?: number
          line_count?: number
          created_at?: string
          updated_at?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "documents_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          }
        ]
      }
      operations: {
        Row: {
          id: string
          document_id: string
          participant_id: string
          operation_type: "insert" | "delete" | "retain" | "cursor_move" | "selection_change"
          position: number
          length: number | null
          content: string | null
          client_id: string
          client_sequence: number
          server_sequence: number
          vector_clock: Json
          timestamp: string
          applied_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          document_id: string
          participant_id: string
          operation_type: "insert" | "delete" | "retain" | "cursor_move" | "selection_change"
          position: number
          length?: number | null
          content?: string | null
          client_id: string
          client_sequence: number
          server_sequence?: number
          vector_clock?: Json
          timestamp?: string
          applied_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          document_id?: string
          participant_id?: string
          operation_type?: "insert" | "delete" | "retain" | "cursor_move" | "selection_change"
          position?: number
          length?: number | null
          content?: string | null
          client_id?: string
          client_sequence?: number
          server_sequence?: number
          vector_clock?: Json
          timestamp?: string
          applied_at?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "operations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          }
        ]
      }
      cursors: {
        Row: {
          id: string
          participant_id: string
          document_id: string
          line: number
          column: number
          selection_start: Json | null
          selection_end: Json | null
          updated_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          participant_id: string
          document_id: string
          line?: number
          column?: number
          selection_start?: Json | null
          selection_end?: Json | null
          updated_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          participant_id?: string
          document_id?: string
          line?: number
          column?: number
          selection_start?: Json | null
          selection_end?: Json | null
          updated_at?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cursors_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cursors_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          }
        ]
      }
      presence: {
        Row: {
          id: string
          participant_id: string
          room_id: string
          status: "online" | "away" | "offline"
          last_activity: string
          current_document_id: string | null
          activity_type: string | null
          connection_id: string | null
          user_agent: string | null
          ip_address: string | null
          connected_at: string
          updated_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          participant_id: string
          room_id: string
          status?: "online" | "away" | "offline"
          last_activity?: string
          current_document_id?: string | null
          activity_type?: string | null
          connection_id?: string | null
          user_agent?: string | null
          ip_address?: string | null
          connected_at?: string
          updated_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          participant_id?: string
          room_id?: string
          status?: "online" | "away" | "offline"
          last_activity?: string
          current_document_id?: string | null
          activity_type?: string | null
          connection_id?: string | null
          user_agent?: string | null
          ip_address?: string | null
          connected_at?: string
          updated_at?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "presence_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presence_current_document_id_fkey"
            columns: ["current_document_id"]
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
      cleanup_expired_rooms: {
        Args: {}
        Returns: number
      }
      update_participant_presence: {
        Args: {
          p_participant_id: string
          p_status?: "online" | "away" | "offline"
          p_document_id?: string | null
          p_activity_type?: string | null
        }
        Returns: undefined
      }
      apply_operation: {
        Args: {
          p_document_id: string
          p_participant_id: string
          p_operation_type: "insert" | "delete" | "retain" | "cursor_move" | "selection_change"
          p_position: number
          p_length?: number | null
          p_content?: string | null
          p_client_id?: string | null
          p_client_sequence?: number
        }
        Returns: string
      }
      update_cursor_position: {
        Args: {
          p_participant_id: string
          p_document_id: string
          p_line: number
          p_column: number
          p_selection_start?: Json | null
          p_selection_end?: Json | null
        }
        Returns: undefined
      }
      generate_participant_color: {
        Args: {}
        Returns: string
      }
    }
    Enums: {
      room_status: "active" | "inactive" | "archived"
      participant_role: "owner" | "editor" | "viewer" 
      presence_status: "online" | "away" | "offline"
      operation_type: "insert" | "delete" | "retain" | "cursor_move" | "selection_change"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Type aliases for convenience
export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"])
    ? (Database["public"]["Tables"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"])[TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"])
    ? (Database["public"]["Tables"])[PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"])[TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"])
    ? (Database["public"]["Tables"])[PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof (Database["public"]["Enums"])
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicEnumNameOrOptions["schema"]]["Enums"])
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicEnumNameOrOptions["schema"]]["Enums"])[EnumName]
  : PublicEnumNameOrOptions extends keyof (Database["public"]["Enums"])
    ? (Database["public"]["Enums"])[PublicEnumNameOrOptions]
    : never

// Specific table type exports
export type Room = Tables<'rooms'>
export type RoomInsert = TablesInsert<'rooms'>
export type RoomUpdate = TablesUpdate<'rooms'>

export type Participant = Tables<'participants'>
export type ParticipantInsert = TablesInsert<'participants'>
export type ParticipantUpdate = TablesUpdate<'participants'>

export type Document = Tables<'documents'>
export type DocumentInsert = TablesInsert<'documents'>
export type DocumentUpdate = TablesUpdate<'documents'>

export type Operation = Tables<'operations'>
export type OperationInsert = TablesInsert<'operations'>
export type OperationUpdate = TablesUpdate<'operations'>

export type Cursor = Tables<'cursors'>
export type CursorInsert = TablesInsert<'cursors'>
export type CursorUpdate = TablesUpdate<'cursors'>

export type Presence = Tables<'presence'>
export type PresenceInsert = TablesInsert<'presence'>
export type PresenceUpdate = TablesUpdate<'presence'>

// Enum exports
export type RoomStatus = Enums<'room_status'>
export type ParticipantRole = Enums<'participant_role'>
export type PresenceStatus = Enums<'presence_status'>
export type OperationType = Enums<'operation_type'>
