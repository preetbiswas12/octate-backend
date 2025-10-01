# Collaboration Backend

A comprehensive real-time collaboration backend for the Octate VS Code fork, built with Supabase and Vercel for cost-effective scalability

## Features

- **Real-time Collaboration**: Multiple users can edit documents simultaneously with instant synchronization
- **Conflict Resolution**: Advanced Operational Transform algorithms prevent editing conflicts
- **Cursor Synchronization**: See other participants' cursors and selections in real-time
- **Room Management**: Create and join collaboration rooms with participant management
- **Desktop Integration**: Seamlessly integrates with VS Code desktop application
- **Scalable Architecture**: Built on Supabase + Vercel for automatic scaling and cost efficiency

## Architecture

### Backend Services

- **Supabase PostgreSQL**: Database with real-time subscriptions and Row Level Security
- **Vercel Serverless**: API endpoints with automatic scaling
- **Socket.IO**: WebSocket server for real-time communication
- **Operational Transforms**: Conflict-free collaborative editing algorithms

### Key Components

1. **Database Schema** (`supabase/schema.sql`): Complete PostgreSQL schema with tables, policies, and functions
2. **REST API** (`api/`): Room management, document operations, and authentication endpoints
3. **WebSocket Server** (`api/websocket.ts`): Real-time event handling and synchronization
4. **Operational Transform Library** (`lib/operational-transform.ts`): Text operation algorithms
5. **Collaboration Service** (`lib/collaboration-service.ts`): Client-side service for VS Code integration
6. **VS Code Extension** (`lib/vscode-integration.ts`): Native VS Code extension integration

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account
- Vercel account (optional, for deployment)

### Local Development

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Setup Supabase**

   ```bash
   # Initialize Supabase project
   supabase init
   supabase start

   # Apply database schema
   supabase db reset
   ```

3. **Environment Configuration**
   Create `.env.local`:

   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   DATABASE_URL=your_database_url
   NEXTAUTH_SECRET=your_nextauth_secret
   ```

4. **Start Development Server**

   ```bash
   npm run dev
   ```

5. **Test WebSocket Connection**

   ```bash
   npm run dev:ws
   ```

### Production Deployment

1. **Deploy to Vercel**

   ```bash
   vercel --prod
   ```

2. **Configure Supabase Production**
   - Create production project on Supabase
   - Apply schema: `supabase db push`
   - Update environment variables

## API Reference

### REST Endpoints

#### Rooms

- `GET /api/rooms` - List user's rooms
- `POST /api/rooms` - Create new room
- `GET /api/rooms/[id]` - Get room details
- `PUT /api/rooms/[id]` - Update room
- `DELETE /api/rooms/[id]` - Delete room
- `POST /api/rooms/[id]/join` - Join room
- `POST /api/rooms/[id]/leave` - Leave room

#### Documents

- `GET /api/documents` - List room documents
- `POST /api/documents` - Create/open document
- `GET /api/documents/[id]` - Get document content
- `PUT /api/documents/[id]` - Update document
- `DELETE /api/documents/[id]` - Delete document

### WebSocket Events

#### Client → Server

- `join-room` - Join collaboration room
- `leave-room` - Leave room
- `operation` - Send text operation
- `cursor-update` - Update cursor position
- `open-document` - Open document for editing

#### Server → Client

- `room-joined` - Room join confirmation
- `participant-joined` - New participant joined
- `participant-left` - Participant left
- `operation-received` - Incoming text operation
- `cursor-updated` - Participant cursor update
- `sync-request` - Request synchronization

## VS Code Integration

### Installation

The collaboration service integrates directly with your Octate VS Code fork:

1. **Add to Extension Dependencies**

   ```json
   {
     "dependencies": {
       "@octate/collaboration-backend": "^1.0.0"
     }
   }
   ```

2. **Initialize in Extension**

   ```typescript
   import { activate } from '@octate/collaboration-backend';

   export function activate(context: vscode.ExtensionContext) {
     activate(context);
   }
   ```

### Commands

- `octate.startCollaboration` - Start collaboration session
- `octate.joinRoom` - Join existing room
- `octate.createRoom` - Create new room
- `octate.leaveRoom` - Leave current session
- `octate.showParticipants` - Show participant list

### Status Bar

The extension adds a status bar item showing:

- Connection status
- Current participant count
- Room information

## Configuration

### Environment Variables

```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional
VSCODE_COLLABORATION_API_URL=http://localhost:3000
WEBSOCKET_PORT=3001
DEBUG=true
NODE_ENV=development
MAX_PARTICIPANTS_PER_ROOM=10
OPERATION_CLEANUP_INTERVAL=3600000
```

### Supabase Configuration

The `supabase/config.toml` file includes:

- Database settings
- Authentication configuration
- Real-time subscriptions
- Storage policies

## Security

### Authentication

- JWT-based authentication through Supabase Auth
- Row Level Security (RLS) policies on all tables
- API rate limiting and CORS protection

### Data Protection

- All sensitive operations require authentication
- Room owners have full control over their rooms
- Participant permissions are enforced at database level

### Network Security

- HTTPS-only communication in production
- WebSocket connections use secure protocols
- Input validation and sanitization

## Performance

### Optimization Features

- Operation batching to reduce network overhead
- Cursor position throttling (100ms intervals)
- Automatic cleanup of expired rooms and operations
- Connection pooling and retry logic

### Scaling

- Serverless functions scale automatically with demand
- Supabase handles database scaling transparently
- CDN caching for static assets

## Monitoring

### Logging

```typescript
import { logger } from './lib/utils';

logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);
```

### Health Checks

```bash
# Check backend health
curl https://your-deployment.vercel.app/api/health

# Check database connectivity
npm run health-check
```

## Development

### Project Structure

```folder
collaboration-backend/
├── api/                    # Vercel API endpoints
│   ├── rooms/             # Room management
│   ├── documents/         # Document operations
│   └── websocket.ts       # WebSocket server
├── lib/                   # Core libraries
│   ├── supabase.ts        # Database client
│   ├── operational-transform.ts # OT algorithms
│   ├── collaboration-service.ts # Client service
│   ├── vscode-integration.ts    # VS Code extension
│   └── utils.ts           # Utility functions
├── supabase/              # Database configuration
│   ├── config.toml        # Supabase config
│   └── migrations/        # Database schema
└── types/                 # TypeScript definitions
```

### Code Quality

- TypeScript for type safety
- ESLint and Prettier for code formatting
- Zod for runtime validation
- Comprehensive error handling

### Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run load tests
npm run test:load
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add tests for new features
- Update documentation
- Ensure backward compatibility

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For questions and support:

- Create an issue on GitHub
- Check the [documentation](https://octate-docs.vercel.app)
- Join our Discord community

## Roadmap

### Upcoming Features

- [ ] Voice and video chat integration
- [ ] Advanced permissions system
- [ ] Collaborative debugging
- [ ] Code review workflows
- [ ] Integration with Git workflows
- [ ] Mobile companion app
- [ ] Advanced analytics dashboard

### Performance Improvements

- [ ] Operation compression
- [ ] Differential synchronization
- [ ] Intelligent caching strategies
- [ ] Edge computing deployment
