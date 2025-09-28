export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
export interface Database {
    public: {
        Tables: {
            cursors: {
                Row: {
                    column: number;
                    document_id: string;
                    id: string;
                    line: number;
                    metadata: Json;
                    participant_id: string;
                    selection_end: Json | null;
                    selection_start: Json | null;
                    updated_at: string;
                };
                Insert: {
                    column?: number;
                    document_id: string;
                    id?: string;
                    line?: number;
                    metadata?: Json;
                    participant_id: string;
                    selection_end?: Json | null;
                    selection_start?: Json | null;
                    updated_at?: string;
                };
                Update: {
                    column?: number;
                    document_id?: string;
                    id?: string;
                    line?: number;
                    metadata?: Json;
                    participant_id?: string;
                    selection_end?: Json | null;
                    selection_start?: Json | null;
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "cursors_document_id_fkey";
                        columns: ["document_id"];
                        referencedRelation: "documents";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "cursors_participant_id_fkey";
                        columns: ["participant_id"];
                        referencedRelation: "participants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            documents: {
                Row: {
                    content: string;
                    created_at: string;
                    file_path: string;
                    id: string;
                    language: string | null;
                    last_operation_timestamp: string;
                    line_count: number;
                    metadata: Json;
                    room_id: string;
                    size_bytes: number;
                    updated_at: string;
                    version: number;
                };
                Insert: {
                    content?: string;
                    created_at?: string;
                    file_path: string;
                    id?: string;
                    language?: string | null;
                    last_operation_timestamp?: string;
                    line_count?: number;
                    metadata?: Json;
                    room_id: string;
                    size_bytes?: number;
                    updated_at?: string;
                    version?: number;
                };
                Update: {
                    content?: string;
                    created_at?: string;
                    file_path?: string;
                    id?: string;
                    language?: string | null;
                    last_operation_timestamp?: string;
                    line_count?: number;
                    metadata?: Json;
                    room_id?: string;
                    size_bytes?: number;
                    updated_at?: string;
                    version?: number;
                };
                Relationships: [
                    {
                        foreignKeyName: "documents_room_id_fkey";
                        columns: ["room_id"];
                        referencedRelation: "rooms";
                        referencedColumns: ["id"];
                    }
                ];
            };
            operations: {
                Row: {
                    applied_at: string;
                    client_id: string;
                    client_sequence: number;
                    content: string | null;
                    document_id: string;
                    id: string;
                    length: number | null;
                    metadata: Json;
                    operation_type: Database["public"]["Enums"]["operation_type"];
                    participant_id: string;
                    position: number;
                    server_sequence: number;
                    timestamp: string;
                    vector_clock: Json;
                };
                Insert: {
                    applied_at?: string;
                    client_id: string;
                    client_sequence: number;
                    content?: string | null;
                    document_id: string;
                    id?: string;
                    length?: number | null;
                    metadata?: Json;
                    operation_type: Database["public"]["Enums"]["operation_type"];
                    participant_id: string;
                    position: number;
                    server_sequence?: number;
                    timestamp?: string;
                    vector_clock?: Json;
                };
                Update: {
                    applied_at?: string;
                    client_id?: string;
                    client_sequence?: number;
                    content?: string | null;
                    document_id?: string;
                    id?: string;
                    length?: number | null;
                    metadata?: Json;
                    operation_type?: Database["public"]["Enums"]["operation_type"];
                    participant_id?: string;
                    position?: number;
                    server_sequence?: number;
                    timestamp?: string;
                    vector_clock?: Json;
                };
                Relationships: [
                    {
                        foreignKeyName: "operations_document_id_fkey";
                        columns: ["document_id"];
                        referencedRelation: "documents";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "operations_participant_id_fkey";
                        columns: ["participant_id"];
                        referencedRelation: "participants";
                        referencedColumns: ["id"];
                    }
                ];
            };
            participants: {
                Row: {
                    avatar_url: string | null;
                    color: string | null;
                    cursor_position: Json | null;
                    display_name: string | null;
                    id: string;
                    joined_at: string;
                    last_seen: string;
                    metadata: Json;
                    presence_status: Database["public"]["Enums"]["presence_status"];
                    role: Database["public"]["Enums"]["participant_role"];
                    room_id: string;
                    selection_range: Json | null;
                    user_id: string | null;
                };
                Insert: {
                    avatar_url?: string | null;
                    color?: string | null;
                    cursor_position?: Json | null;
                    display_name?: string | null;
                    id?: string;
                    joined_at?: string;
                    last_seen?: string;
                    metadata?: Json;
                    presence_status?: Database["public"]["Enums"]["presence_status"];
                    role?: Database["public"]["Enums"]["participant_role"];
                    room_id: string;
                    selection_range?: Json | null;
                    user_id?: string | null;
                };
                Update: {
                    avatar_url?: string | null;
                    color?: string | null;
                    cursor_position?: Json | null;
                    display_name?: string | null;
                    id?: string;
                    joined_at?: string;
                    last_seen?: string;
                    metadata?: Json;
                    presence_status?: Database["public"]["Enums"]["presence_status"];
                    role?: Database["public"]["Enums"]["participant_role"];
                    room_id?: string;
                    selection_range?: Json | null;
                    user_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "participants_room_id_fkey";
                        columns: ["room_id"];
                        referencedRelation: "rooms";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "participants_user_id_fkey";
                        columns: ["user_id"];
                        referencedRelation: "users";
                        referencedColumns: ["id"];
                    }
                ];
            };
            presence: {
                Row: {
                    activity_type: string | null;
                    connected_at: string;
                    connection_id: string | null;
                    current_document_id: string | null;
                    id: string;
                    ip_address: unknown | null;
                    last_activity: string;
                    metadata: Json;
                    participant_id: string;
                    room_id: string;
                    status: Database["public"]["Enums"]["presence_status"];
                    updated_at: string;
                    user_agent: string | null;
                };
                Insert: {
                    activity_type?: string | null;
                    connected_at?: string;
                    connection_id?: string | null;
                    current_document_id?: string | null;
                    id?: string;
                    ip_address?: unknown | null;
                    last_activity?: string;
                    metadata?: Json;
                    participant_id: string;
                    room_id: string;
                    status?: Database["public"]["Enums"]["presence_status"];
                    updated_at?: string;
                    user_agent?: string | null;
                };
                Update: {
                    activity_type?: string | null;
                    connected_at?: string;
                    connection_id?: string | null;
                    current_document_id?: string | null;
                    id?: string;
                    ip_address?: unknown | null;
                    last_activity?: string;
                    metadata?: Json;
                    participant_id?: string;
                    room_id?: string;
                    status?: Database["public"]["Enums"]["presence_status"];
                    updated_at?: string;
                    user_agent?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "presence_current_document_id_fkey";
                        columns: ["current_document_id"];
                        referencedRelation: "documents";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "presence_participant_id_fkey";
                        columns: ["participant_id"];
                        referencedRelation: "participants";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "presence_room_id_fkey";
                        columns: ["room_id"];
                        referencedRelation: "rooms";
                        referencedColumns: ["id"];
                    }
                ];
            };
            rooms: {
                Row: {
                    allow_anonymous: boolean;
                    created_at: string;
                    description: string | null;
                    expires_at: string | null;
                    id: string;
                    max_participants: number;
                    metadata: Json;
                    name: string;
                    owner_id: string | null;
                    require_approval: boolean;
                    status: Database["public"]["Enums"]["room_status"];
                    updated_at: string;
                };
                Insert: {
                    allow_anonymous?: boolean;
                    created_at?: string;
                    description?: string | null;
                    expires_at?: string | null;
                    id?: string;
                    max_participants?: number;
                    metadata?: Json;
                    name: string;
                    owner_id?: string | null;
                    require_approval?: boolean;
                    status?: Database["public"]["Enums"]["room_status"];
                    updated_at?: string;
                };
                Update: {
                    allow_anonymous?: boolean;
                    created_at?: string;
                    description?: string | null;
                    expires_at?: string | null;
                    id?: string;
                    max_participants?: number;
                    metadata?: Json;
                    name?: string;
                    owner_id?: string | null;
                    require_approval?: boolean;
                    status?: Database["public"]["Enums"]["room_status"];
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "rooms_owner_id_fkey";
                        columns: ["owner_id"];
                        referencedRelation: "users";
                        referencedColumns: ["id"];
                    }
                ];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            apply_operation: {
                Args: {
                    p_document_id: string;
                    p_participant_id: string;
                    p_operation_type: Database["public"]["Enums"]["operation_type"];
                    p_position: number;
                    p_length?: number;
                    p_content?: string;
                    p_client_id?: string;
                    p_client_sequence?: number;
                };
                Returns: string;
            };
            cleanup_expired_rooms: {
                Args: {};
                Returns: number;
            };
            generate_participant_color: {
                Args: {};
                Returns: string;
            };
            update_cursor_position: {
                Args: {
                    p_participant_id: string;
                    p_document_id: string;
                    p_line: number;
                    p_column: number;
                    p_selection_start?: Json;
                    p_selection_end?: Json;
                };
                Returns: undefined;
            };
            update_participant_presence: {
                Args: {
                    p_participant_id: string;
                    p_status?: Database["public"]["Enums"]["presence_status"];
                    p_document_id?: string;
                    p_activity_type?: string;
                };
                Returns: undefined;
            };
        };
        Enums: {
            operation_type: "insert" | "delete" | "retain" | "cursor_move" | "selection_change";
            participant_role: "owner" | "editor" | "viewer";
            presence_status: "online" | "away" | "offline";
            room_status: "active" | "inactive" | "archived";
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
}
export type Tables<PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] & Database["public"]["Views"]) | {
    schema: keyof Database;
}, TableName extends PublicTableNameOrOptions extends {
    schema: keyof Database;
} ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] & Database[PublicTableNameOrOptions["schema"]]["Views"]) : never = never> = PublicTableNameOrOptions extends {
    schema: keyof Database;
} ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] & Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
    Row: infer R;
} ? R : never : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] & Database["public"]["Views"]) ? (Database["public"]["Tables"] & Database["public"]["Views"])[PublicTableNameOrOptions] extends {
    Row: infer R;
} ? R : never : never;
export type TablesInsert<PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | {
    schema: keyof Database;
}, TableName extends PublicTableNameOrOptions extends {
    schema: keyof Database;
} ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"] : never = never> = PublicTableNameOrOptions extends {
    schema: keyof Database;
} ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I;
} ? I : never : PublicTableNameOrOptions extends keyof Database["public"]["Tables"] ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
    Insert: infer I;
} ? I : never : never;
export type TablesUpdate<PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | {
    schema: keyof Database;
}, TableName extends PublicTableNameOrOptions extends {
    schema: keyof Database;
} ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"] : never = never> = PublicTableNameOrOptions extends {
    schema: keyof Database;
} ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U;
} ? U : never : PublicTableNameOrOptions extends keyof Database["public"]["Tables"] ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
    Update: infer U;
} ? U : never : never;
export type Enums<PublicEnumNameOrOptions extends keyof Database["public"]["Enums"] | {
    schema: keyof Database;
}, EnumName extends PublicEnumNameOrOptions extends {
    schema: keyof Database;
} ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"] : never = never> = PublicEnumNameOrOptions extends {
    schema: keyof Database;
} ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName] : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"] ? Database["public"]["Enums"][PublicEnumNameOrOptions] : never;
//# sourceMappingURL=supabase-types.d.ts.map