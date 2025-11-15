"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseError = exports.supabaseAdmin = exports.supabase = void 0;
exports.getSupabaseClient = getSupabaseClient;
exports.checkSupabaseConnection = checkSupabaseConnection;
exports.createRoomSubscription = createRoomSubscription;
exports.createPresenceSubscription = createPresenceSubscription;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
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
        console.log('Testing Supabase connection to:', supabaseUrl);
        // First check if environment variables are set
        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Missing Supabase environment variables');
            return false;
        }
        // Use admin client for health check to bypass RLS policies
        const client = exports.supabaseAdmin || exports.supabase;
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