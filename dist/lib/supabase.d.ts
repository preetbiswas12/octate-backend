import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from './supabase-types';
export declare const supabase: SupabaseClient<Database>;
export declare const supabaseAdmin: SupabaseClient<Database> | null;
export type { Database, Tables, TablesInsert, TablesUpdate, Enums, } from './supabase-types';
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
export type RoomStatus = Database['public']['Enums']['room_status'];
export type ParticipantRole = Database['public']['Enums']['participant_role'];
export type PresenceStatus = Database['public']['Enums']['presence_status'];
export type OperationType = Database['public']['Enums']['operation_type'];
export declare function getSupabaseClient(authToken?: string): SupabaseClient<Database>;
export declare class SupabaseError extends Error {
    code?: string | undefined;
    details?: any | undefined;
    constructor(message: string, code?: string | undefined, details?: any | undefined);
}
export declare function checkSupabaseConnection(): Promise<boolean>;
export declare function createRoomSubscription(roomId: string, callback: (payload: any) => void): import("@supabase/supabase-js").RealtimeChannel;
export declare function createPresenceSubscription(roomId: string, callback: (payload: any) => void): import("@supabase/supabase-js").RealtimeChannel;
//# sourceMappingURL=supabase.d.ts.map