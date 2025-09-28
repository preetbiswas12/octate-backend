# Octate Collaboration Backend

Express.js server for real-time collaborative editing in Octate IDE.

## Quick Deploy to Render

1. **Push to GitHub** with all files
2. **Create Render Web Service** from this repository  
3. **Set Environment Variables**:
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_ANON_KEY` - Supabase anonymous key
   - `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
   - `JWT_SECRET` - Secret for JWT tokens
4. **Deploy**: Build Command: `npm install && npm run build`, Start: `npm start`

## Local Development

```bash
npm install
npm run dev
```

Server runs on http://localhost:3000

## Architecture Migration

**Migrated from Vercel serverless** to **Render Express.js** for:
- Persistent WebSocket connections with Socket.IO
- No cold start delays
- Better real-time collaboration performance  
- Cost-effective hosting

## Database Schema

Uses Supabase PostgreSQL with tables:
- `rooms` - Collaboration workspaces
- `participants` - Room members and roles
- `documents` - Files within rooms
- `operations` - Edit operations for operational transform
- `cursors` - User cursor positions
- `presence` - Real-time user presence

## API Endpoints

### Authentication
- `POST /api/auth/validate` - Validate JWT token
- `GET /api/auth/me` - Get current user
- `POST /api/auth/refresh` - Refresh session

### Rooms  
- `GET /api/rooms` - List user's rooms
- `POST /api/rooms` - Create new room
- `GET /api/rooms/:id` - Get room details
- `PUT /api/rooms/:id` - Update room
- `DELETE /api/rooms/:id` - Delete room
- `POST /api/rooms/:id/join` - Join room
- `POST /api/rooms/:id/leave` - Leave room

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Create document
- `GET /api/documents/:id` - Get document
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document
- `GET /api/documents/:id/operations` - Get operations
- `GET /api/documents/:id/cursors` - Get cursors

## WebSocket Events

### Client → Server
- `join-room` - Join collaboration room
- `leave-room` - Leave room  
- `operation` - Send text editing operation
- `cursor-update` - Update cursor position
- `presence-update` - Update user presence

### Server → Client  
- `operation` - Receive editing operation
- `cursor-update` - Receive cursor update
- `presence-update` - Receive presence update
- `user-joined` - User joined room
- `user-left` - User left room

## Development

### Project Structure
```
src/
├── server.ts          # Main Express server
├── middleware/        # Authentication middleware
├── routes/           # API route handlers
│   ├── auth.ts       # Authentication routes
│   ├── rooms.ts      # Room management
│   └── documents.ts  # Document operations
lib/
└── supabase.ts       # Database client
```

### Testing
```bash
npm test              # Run tests
npm run type-check    # TypeScript validation
```

## Deployment

See `RENDER_DEPLOYMENT.md` for complete deployment guide including:
- Environment setup
- Custom domain configuration  
- Production considerations
- Monitoring and troubleshooting

## Health Check

Monitor service health at `/health` endpoint:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "database": "connected"
}
```