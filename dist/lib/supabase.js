"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseError = exports.supabaseAdmin = exports.supabase = void 0;
exports.getSupabaseClient = getSupabaseClient;
exports.checkSupabaseConnection = checkSupabaseConnection;
exports.createRoomSubscription = createRoomSubscription;
exports.createPresenceSubscription = createPresenceSubscription;
const supabase_js_1 = require("@supabase/supabase-js");
// Environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}
// Client for public operations (with RLS)
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: false, // Server-side, don't persist
    },
    realtime: {
        params: {
            eventsPerSecond: 10, // Rate limit for performance
        },
    },
});
// Admin client for server operations (bypasses RLS)
exports.supabaseAdmin = supabaseServiceRoleKey
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
    : null;
// Utility functions
function getSupabaseClient(authToken) {
    if (authToken) {
        return (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            },
        });
    }
    return exports.supabase;
}
// Error handling
class SupabaseError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'SupabaseError';
    }
}
exports.SupabaseError = SupabaseError;
// Connection health check
async function checkSupabaseConnection() {
    try {
        const { data, error } = await exports.supabase
            .from('rooms')
            .select('id')
            .limit(1);
        return !error;
    }
    catch (e) {
        console.error('Supabase connection check failed:', e);
        return false;
    }
}
// Real-time subscription helpers
function createRoomSubscription(roomId, callback) {
    return exports.supabase
        .channel(`room:${roomId}`)
        .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'operations',
        filter: `document_id=in.(select id from documents where room_id=eq.${roomId})`,
    }, callback)
        .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cursors',
        filter: `document_id=in.(select id from documents where room_id=eq.${roomId})`,
    }, callback)
        .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `room_id=eq.${roomId}`,
    }, callback)
        .subscribe();
}
function createPresenceSubscription(roomId, callback) {
    return exports.supabase
        .channel(`presence:${roomId}`)
        .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'presence',
        filter: `room_id=eq.${roomId}`,
    }, callback)
        .subscribe();
}
//# sourceMappingURL=supabase.js.map