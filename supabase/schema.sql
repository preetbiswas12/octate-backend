-- Collaboration Backend Database Schema
-- Optimized for real-time multiplayer editing with cursor synchronization

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create custom types
CREATE TYPE room_status AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE participant_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE presence_status AS ENUM ('online', 'away', 'offline');
CREATE TYPE operation_type AS ENUM ('insert', 'delete', 'retain', 'cursor_move', 'selection_change');

-- Collaboration Rooms
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status room_status DEFAULT 'active',
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    max_participants INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    -- Room settings
    allow_anonymous BOOLEAN DEFAULT false,
    require_approval BOOLEAN DEFAULT false,

    -- Metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- Indexes for performance
    CONSTRAINT rooms_name_check CHECK (length(name) >= 1 AND length(name) <= 255)
);

-- Room Participants
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role participant_role DEFAULT 'editor',
    presence_status presence_status DEFAULT 'online',

    -- Participant info
    display_name VARCHAR(100),
    avatar_url TEXT,
    color VARCHAR(7), -- Hex color for cursor/selection

    -- Presence tracking
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    -- Current cursor position and selection
    cursor_position JSONB, -- {line: number, column: number, file: string}
    selection_range JSONB, -- {start: {line, column}, end: {line, column}, file: string}

    -- Metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- Constraints
    UNIQUE(room_id, user_id),

    -- Check constraints
    CONSTRAINT participants_color_check CHECK (color ~ '^#[0-9A-Fa-f]{6}$' OR color IS NULL),
    CONSTRAINT participants_display_name_check CHECK (length(display_name) >= 1 AND length(display_name) <= 100)
);

-- Documents in collaboration rooms
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    language VARCHAR(50),

    -- Document versioning
    version INTEGER DEFAULT 1,
    last_operation_timestamp TIMESTAMPTZ DEFAULT NOW(),

    -- Document metadata
    size_bytes INTEGER DEFAULT 0,
    line_count INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- Constraints
    UNIQUE(room_id, file_path),

    -- Check constraints
    CONSTRAINT documents_file_path_check CHECK (length(file_path) >= 1),
    CONSTRAINT documents_version_check CHECK (version >= 1)
);

-- Create sequence for server-side operation ordering
CREATE SEQUENCE operations_server_seq START 1;


-- Operational Transform Operations
-- Each operation represents a change to a document
CREATE TABLE operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,

    -- Operation details
    operation_type operation_type NOT NULL,
    position INTEGER NOT NULL, -- Character position in document
    length INTEGER, -- For delete operations
    content TEXT, -- For insert operations

    -- Operational Transform data
    client_id UUID NOT NULL, -- Client that generated the operation
    client_sequence INTEGER NOT NULL, -- Client's sequence number
    server_sequence INTEGER NOT NULL DEFAULT nextval('operations_server_seq'),

    -- Vector clock for conflict resolution
    vector_clock JSONB DEFAULT '{}'::JSONB,

    -- Timestamps
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    applied_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- Indexes for performance
    CONSTRAINT operations_position_check CHECK (position >= 0),
    CONSTRAINT operations_length_check CHECK (length IS NULL OR length >= 0),
    CONSTRAINT operations_client_sequence_check CHECK (client_sequence >= 0),
    CONSTRAINT operations_server_sequence_check CHECK (server_sequence >= 0)
);



-- Cursor positions and selections (separate table for real-time updates)
CREATE TABLE cursors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Cursor position
    line INTEGER NOT NULL DEFAULT 0,
    "column" INTEGER NOT NULL DEFAULT 0,

    -- Selection range (if any)
    selection_start JSONB, -- {line: number, column: number}
    selection_end JSONB,   -- {line: number, column: number}

    -- Timestamps
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- Constraints
    UNIQUE(participant_id, document_id),

    -- Check constraints
    CONSTRAINT cursors_line_check CHECK (line >= 0),
    CONSTRAINT cursors_column_check CHECK ("column" >= 0)
);

-- Real-time presence tracking
CREATE TABLE presence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,

    -- Presence info
    status presence_status DEFAULT 'online',
    last_activity TIMESTAMPTZ DEFAULT NOW(),

    -- Current activity
    current_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    activity_type VARCHAR(50), -- 'editing', 'viewing', 'idle'

    -- Connection info
    connection_id TEXT, -- WebSocket connection identifier
    user_agent TEXT,
    ip_address INET,

    -- Timestamps
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- Constraints
    UNIQUE(participant_id, room_id)
);

-- Indexes for performance optimization
CREATE INDEX idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_created_at ON rooms(created_at);

CREATE INDEX idx_participants_room_id ON participants(room_id);
CREATE INDEX idx_participants_user_id ON participants(user_id);
CREATE INDEX idx_participants_presence_status ON participants(presence_status);
CREATE INDEX idx_participants_last_seen ON participants(last_seen);

CREATE INDEX idx_documents_room_id ON documents(room_id);
CREATE INDEX idx_documents_file_path ON documents(file_path);
CREATE INDEX idx_documents_updated_at ON documents(updated_at);

CREATE INDEX idx_operations_document_id ON operations(document_id);
CREATE INDEX idx_operations_participant_id ON operations(participant_id);
CREATE INDEX idx_operations_timestamp ON operations(timestamp);
CREATE INDEX idx_operations_server_sequence ON operations(server_sequence);
CREATE INDEX idx_operations_client_id_sequence ON operations(client_id, client_sequence);

CREATE INDEX idx_cursors_participant_id ON cursors(participant_id);
CREATE INDEX idx_cursors_document_id ON cursors(document_id);
CREATE INDEX idx_cursors_updated_at ON cursors(updated_at);

CREATE INDEX idx_presence_room_id ON presence(room_id);
CREATE INDEX idx_presence_participant_id ON presence(participant_id);
CREATE INDEX idx_presence_status ON presence(status);
CREATE INDEX idx_presence_last_activity ON presence(last_activity);

-- Row Level Security (RLS) Policies
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence ENABLE ROW LEVEL SECURITY;

-- Rooms policies
CREATE POLICY "Users can view rooms they participate in" ON rooms
    FOR SELECT USING (
        id IN (
            SELECT room_id FROM participants WHERE user_id = auth.uid()
        ) OR owner_id = auth.uid()
    );

CREATE POLICY "Users can create rooms" ON rooms
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Room owners can update their rooms" ON rooms
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Room owners can delete their rooms" ON rooms
    FOR DELETE USING (owner_id = auth.uid());

-- Participants policies
CREATE POLICY "Users can view participants in their rooms" ON participants
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM participants WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join rooms" ON participants
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own participation" ON participants
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can leave rooms" ON participants
    FOR DELETE USING (user_id = auth.uid());

-- Documents policies
CREATE POLICY "Participants can view documents in their rooms" ON documents
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM participants WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can create documents in their rooms" ON documents
    FOR INSERT WITH CHECK (
        room_id IN (
            SELECT room_id FROM participants WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can update documents in their rooms" ON documents
    FOR UPDATE USING (
        room_id IN (
            SELECT room_id FROM participants WHERE user_id = auth.uid()
        )
    );

-- Operations policies
CREATE POLICY "Participants can view operations in their rooms" ON operations
    FOR SELECT USING (
        document_id IN (
            SELECT d.id FROM documents d
            JOIN participants p ON d.room_id = p.room_id
            WHERE p.user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can create operations in their rooms" ON operations
    FOR INSERT WITH CHECK (
        participant_id IN (
            SELECT id FROM participants WHERE user_id = auth.uid()
        )
    );

-- Cursors policies
CREATE POLICY "Participants can view cursors in their rooms" ON cursors
    FOR SELECT USING (
        participant_id IN (
            SELECT p.id FROM participants p
            WHERE p.room_id IN (
                SELECT room_id FROM participants WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can manage their own cursors" ON cursors
    FOR ALL USING (
        participant_id IN (
            SELECT id FROM participants WHERE user_id = auth.uid()
        )
    );

-- Presence policies
CREATE POLICY "Participants can view presence in their rooms" ON presence
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM participants WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own presence" ON presence
    FOR ALL USING (
        participant_id IN (
            SELECT id FROM participants WHERE user_id = auth.uid()
        )
    );

-- Functions and Triggers

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update timestamp triggers
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
    BEFORE UPDATE ON participants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cursors_updated_at
    BEFORE UPDATE ON cursors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_presence_updated_at
    BEFORE UPDATE ON presence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired rooms
CREATE OR REPLACE FUNCTION cleanup_expired_rooms()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM rooms
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND status = 'inactive';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update participant presence
CREATE OR REPLACE FUNCTION update_participant_presence(
    p_participant_id UUID,
    p_status presence_status DEFAULT 'online',
    p_document_id UUID DEFAULT NULL,
    p_activity_type VARCHAR DEFAULT 'editing'
)
RETURNS VOID AS $$
BEGIN
    UPDATE participants
    SET
        presence_status = p_status,
        last_seen = NOW()
    WHERE id = p_participant_id;

    INSERT INTO presence (participant_id, room_id, status, current_document_id, activity_type)
    SELECT p_participant_id, room_id, p_status, p_document_id, p_activity_type
    FROM participants
    WHERE id = p_participant_id
    ON CONFLICT (participant_id, room_id)
    DO UPDATE SET
        status = p_status,
        current_document_id = p_document_id,
        activity_type = p_activity_type,
        last_activity = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to apply operation to document
CREATE OR REPLACE FUNCTION apply_operation(
    p_document_id UUID,
    p_participant_id UUID,
    p_operation_type operation_type,
    p_position INTEGER,
    p_length INTEGER DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_client_id UUID DEFAULT NULL,
    p_client_sequence INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
    operation_id UUID;
    current_content TEXT;
    new_content TEXT;
BEGIN
    -- Generate operation ID
    operation_id := uuid_generate_v4();

    -- Get current document content
    SELECT content INTO current_content
    FROM documents
    WHERE id = p_document_id;

    -- Apply operation based on type
    CASE p_operation_type
        WHEN 'insert' THEN
            new_content := left(current_content, p_position) ||
                          COALESCE(p_content, '') ||
                          substring(current_content from p_position + 1);
        WHEN 'delete' THEN
            new_content := left(current_content, p_position) ||
                          substring(current_content from p_position + COALESCE(p_length, 0) + 1);
        ELSE
            new_content := current_content;
    END CASE;

    -- Update document content and version
    UPDATE documents
    SET
        content = new_content,
        version = version + 1,
        size_bytes = length(new_content),
        line_count = array_length(string_to_array(new_content, E'\n'), 1),
        last_operation_timestamp = NOW(),
        updated_at = NOW()
    WHERE id = p_document_id;

    -- Insert operation record
    INSERT INTO operations (
        id, document_id, participant_id, operation_type,
        position, length, content, client_id, client_sequence
    ) VALUES (
        operation_id, p_document_id, p_participant_id, p_operation_type,
        p_position, p_length, p_content,
        COALESCE(p_client_id, uuid_generate_v4()), p_client_sequence
    );

    RETURN operation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update cursor position
CREATE OR REPLACE FUNCTION update_cursor_position(
    p_participant_id UUID,
    p_document_id UUID,
    p_line INTEGER,
    p_column INTEGER,
    p_selection_start JSONB DEFAULT NULL,
    p_selection_end JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO cursors (
        participant_id, document_id, line, "column",
        selection_start, selection_end
    ) VALUES (
        p_participant_id, p_document_id, p_line, p_column,
        p_selection_start, p_selection_end
    )
    ON CONFLICT (participant_id, document_id)
    DO UPDATE SET
        line = p_line,
        "column" = p_column,
        selection_start = p_selection_start,
        selection_end = p_selection_end,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a function to generate random colors for participants
CREATE OR REPLACE FUNCTION generate_participant_color()
RETURNS VARCHAR(7) AS $$
DECLARE
    colors VARCHAR(7)[] := ARRAY['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
BEGIN
    RETURN colors[floor(random() * array_length(colors, 1) + 1)];
END;
$$ LANGUAGE plpgsql;

-- Trigger to assign random color to new participants
CREATE OR REPLACE FUNCTION assign_participant_color()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.color IS NULL THEN
        NEW.color := generate_participant_color();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assign_participant_color_trigger
    BEFORE INSERT ON participants
    FOR EACH ROW EXECUTE FUNCTION assign_participant_color();

-- Enable real-time subscriptions for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE documents;
ALTER PUBLICATION supabase_realtime ADD TABLE operations;
ALTER PUBLICATION supabase_realtime ADD TABLE cursors;
ALTER PUBLICATION supabase_realtime ADD TABLE presence;

-- Comments for documentation
COMMENT ON TABLE rooms IS 'Collaboration rooms where users can work together';
COMMENT ON TABLE participants IS 'Users participating in collaboration rooms';
COMMENT ON TABLE documents IS 'Documents being collaboratively edited';
COMMENT ON TABLE operations IS 'Operational transform operations for conflict-free editing';
COMMENT ON TABLE cursors IS 'Real-time cursor positions and selections';
COMMENT ON TABLE presence IS 'Real-time presence and activity tracking';

COMMENT ON COLUMN rooms.metadata IS 'Additional room configuration and settings';
COMMENT ON COLUMN participants.color IS 'Hex color code for participant cursor and selection highlighting';
COMMENT ON COLUMN operations.vector_clock IS 'Vector clock for distributed conflict resolution';
COMMENT ON COLUMN operations.client_sequence IS 'Client-side sequence number for operation ordering';
COMMENT ON COLUMN operations.server_sequence IS 'Server-side sequence number for global ordering';
