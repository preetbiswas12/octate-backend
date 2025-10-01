-- Octate Collaboration Backend - Essential Tables
-- Run this in Supabase Dashboard > SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types (using simple text for now to avoid enum issues)
-- We'll handle validation in the application layer

-- Collaboration Rooms
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    owner_id UUID,
    max_participants INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    allow_anonymous BOOLEAN DEFAULT false,
    require_approval BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}'::JSONB,
    CONSTRAINT rooms_name_check CHECK (length(name) >= 1 AND length(name) <= 255)
);

-- Room Participants
CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID,
    role TEXT DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
    display_name VARCHAR(100),
    avatar_url TEXT,
    color VARCHAR(7),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    cursor_position JSONB,
    selection_range JSONB,
    metadata JSONB DEFAULT '{}'::JSONB,
    UNIQUE(room_id, user_id),
    CONSTRAINT participants_color_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$' OR color IS NULL),
    CONSTRAINT participants_display_name_check CHECK (length(display_name) >= 1 AND length(display_name) <= 100)
);

-- Documents in collaboration rooms
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    language VARCHAR(50),
    version INTEGER DEFAULT 1,
    last_operation_timestamp TIMESTAMPTZ DEFAULT NOW(),
    size_bytes INTEGER DEFAULT 0,
    line_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB,
    UNIQUE(room_id, file_path),
    CONSTRAINT documents_file_path_check CHECK (length(file_path) >= 1),
    CONSTRAINT documents_version_check CHECK (version >= 1)
);

-- Operations for operational transforms
CREATE SEQUENCE IF NOT EXISTS operations_server_seq START 1;

CREATE TABLE IF NOT EXISTS operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('insert', 'delete', 'retain', 'cursor_move', 'selection_change')),
    operation_data JSONB NOT NULL,
    server_timestamp TIMESTAMPTZ DEFAULT NOW(),
    client_timestamp TIMESTAMPTZ,
    sequence_number BIGINT DEFAULT nextval('operations_server_seq'),
    metadata JSONB DEFAULT '{}'::JSONB
);

-- Real-time cursors
CREATE TABLE IF NOT EXISTS cursors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    position JSONB NOT NULL,
    selection_range JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB,
    UNIQUE(document_id, participant_id)
);

-- Participant presence tracking
CREATE TABLE IF NOT EXISTS presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
    last_activity TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::JSONB,
    UNIQUE(room_id, participant_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_participants_room_id ON participants(room_id);
CREATE INDEX IF NOT EXISTS idx_participants_user_id ON participants(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_room_id ON documents(room_id);
CREATE INDEX IF NOT EXISTS idx_operations_document_id ON operations(document_id);
CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations(server_timestamp);
CREATE INDEX IF NOT EXISTS idx_cursors_document_id ON cursors(document_id);
CREATE INDEX IF NOT EXISTS idx_presence_room_id ON presence(room_id);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - but make it permissive for now
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for development (tighten these in production)
CREATE POLICY "Allow all operations on rooms" ON rooms FOR ALL USING (true);
CREATE POLICY "Allow all operations on participants" ON participants FOR ALL USING (true);
CREATE POLICY "Allow all operations on documents" ON documents FOR ALL USING (true);
CREATE POLICY "Allow all operations on operations" ON operations FOR ALL USING (true);
CREATE POLICY "Allow all operations on cursors" ON cursors FOR ALL USING (true);
CREATE POLICY "Allow all operations on presence" ON presence FOR ALL USING (true);

-- Create a test room to verify everything works
INSERT INTO rooms (name, description, allow_anonymous) 
VALUES ('Welcome Room', 'Default collaboration room for testing', true)
ON CONFLICT DO NOTHING;

-- Success message
SELECT 'Octate collaboration database schema created successfully! 🚀' as result;