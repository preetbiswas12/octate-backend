# Octate Collaboration Backend - Render Deployment Guide

This guide provides step-by-step instructions for deploying the Octate collaboration backend to Render.

## Overview

The backend has been migrated from Vercel serverless functions to a persistent Express.js server architecture, optimized for:

- **Real-time WebSocket connections** with Socket.IO
- **Better performance** with persistent connections (no cold starts)
- **Cost-effective hosting** on Render's free tier
- **Horizontal scaling** capabilities

## Architecture Changes

### Before (Vercel Serverless)

- Individual API functions (`/api/rooms`, `/api/documents`)
- Cold start latency
- Limited WebSocket support
- Pay-per-request model

### After (Render Express.js)

- Single persistent server with Express.js
- Always-on connections
- Native Socket.IO support
- Fixed monthly cost

## Prerequisites

1. **Supabase Project**: Set up and configured with the required schema
2. **Render Account**: Free account at [render.com](https://render.com)
3. **GitHub Repository**: Code pushed to a Git repository
4. **Environment Variables**: Supabase credentials and JWT secret

## Deployment Steps

### 1. Prepare Supabase Database

Ensure your Supabase project has these tables:

- `rooms`
- `participants`
- `documents`
- `operations`
- `cursors`
- `presence`

Run the SQL schema from `supabase/migrations/` if not already done.

### 2. Deploy to Render

#### Option A: Using render.yaml (Recommended)

1. **Push code to GitHub** with the provided `render.yaml` file
2. **Connect Render to your repository**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Select the repository containing the collaboration-backend

3. **Configure Environment Variables**:

   ```env
   NODE_ENV=production
   SUPABASE_URL=your-supabase-project-url
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   JWT_SECRET=your-jwt-secret-key
   FRONTEND_URL=https://octate.dev
   ```

4. **Deploy**: Render will automatically build and deploy

#### Option B: Manual Web Service

1. **Create new Web Service**:
   - Dashboard → "New" → "Web Service"
   - Connect GitHub repository
   - Select `collaboration-backend` directory

2. **Configure Build & Start**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node.js

3. **Set Environment Variables** (same as above)

### 3. Configure Custom Domain (Optional)

1. In Render dashboard, go to your service
2. Navigate to "Settings" → "Custom Domains"
3. Add your domain (e.g., `api.octate.dev`)
4. Update DNS records as instructed

### 4. Update Octate Configuration

The configuration has been updated to use:

- Production: `https://octate-api.onrender.com`
- WebSocket: `wss://octate-api.onrender.com`

If using a custom domain, update `octateConfig.ts`:

```typescript
collaborationBackendUrl: 'https://api.your-domain.com'
websocketUrl: 'wss://api.your-domain.com'
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Your Supabase project URL | `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbG...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJhbG...` |
| `JWT_SECRET` | Secret key for JWT tokens | `your-secret-key` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `FRONTEND_URL` | Frontend URL for CORS | `*` |

## Health Monitoring

The server includes a health check endpoint:

- **URL**: `/health`
- **Response**: JSON with status and database connectivity
- **Use**: Monitor service health and database connection

Example response:

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected"
}
```

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

### WebSocket Events

- `join-room` - Join collaboration room
- `leave-room` - Leave collaboration room
- `operation` - Send text operation
- `cursor-update` - Update cursor position
- `presence-update` - Update user presence

## Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check TypeScript compilation errors
   - Ensure all dependencies are in `package.json`
   - Verify Node.js version compatibility (18+)

2. **Database Connection Issues**:
   - Verify Supabase URL and keys
   - Check database schema is properly set up
   - Test connection with health endpoint

3. **WebSocket Connection Failures**:
   - Ensure WebSocket URL matches backend URL
   - Check for proxy/firewall blocking WebSocket connections
   - Verify Socket.IO client/server version compatibility

4. **Authentication Errors**:
   - Verify JWT_SECRET is set correctly
   - Check Supabase service role key permissions
   - Ensure token format matches expected structure

### Logs and Debugging

1. **Render Logs**:
   - Dashboard → Your Service → "Logs"
   - Real-time log streaming available

2. **Health Check**:
   - Monitor `/health` endpoint
   - Check database connectivity status

3. **Local Development**:

   ```bash
   cd collaboration-backend
   npm install
   npm run dev
   ```

## Performance Considerations

### Render Free Tier Limitations

- **Sleep after 15 minutes** of inactivity
- **750 hours/month** runtime limit
- **100GB bandwidth/month**

### Optimization Tips

1. **Keep connections active** with ping/pong
2. **Use connection pooling** for database
3. **Implement caching** for frequently accessed data
4. **Monitor resource usage** through Render dashboard

## Scaling and Production

### Upgrading to Paid Plans

- **Starter Plan**: $7/month, no sleep, custom domains
- **Standard Plan**: $25/month, more resources, auto-scaling

### Production Considerations

1. **Database Connection Pooling**: Implement for high concurrency
2. **Rate Limiting**: Add middleware to prevent abuse
3. **Monitoring**: Set up error tracking (Sentry, LogRocket)
4. **Backups**: Ensure Supabase backup strategy
5. **CDN**: Consider CloudFlare for static assets

## Support

For deployment issues:

1. Check Render [documentation](https://render.com/docs)
2. Review Supabase [guides](https://supabase.com/docs)
3. Open GitHub issue for application-specific problems

---

**Migration Complete!** Your Octate collaboration backend is now ready for production deployment on Render with persistent WebSocket connections and improved performance.
