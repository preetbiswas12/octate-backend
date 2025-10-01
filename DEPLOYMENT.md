# 🚀 Deployment & Integration Guide

## Step 1: Deploy Backend to Vercel

### 1.1 Deploy the collaboration-backend folder only

```bash
cd collaboration-backend
vercel --prod
```

### 1.2 Note your deployment URL

After deployment, you'll get a URL like: `https://octate-collaboration-backend.vercel.app`

### 1.3 Set Environment Variables in Vercel

Go to Vercel Dashboard → Your Project → Settings → Environment Variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=production
ALLOWED_ORIGINS=vscode://,https://localhost:3000
```

## Step 2: Update VS Code Extension Configuration

### 2.1 Update lib/config.ts with your deployment URL

Replace the placeholder URLs with your actual Vercel deployment URL:

```typescript
backendUrl: isDevelopment
  ? 'http://localhost:3000'
  : 'https://YOUR-ACTUAL-VERCEL-URL.vercel.app',
socketUrl: isDevelopment
  ? 'http://localhost:3001'
  : 'https://YOUR-ACTUAL-VERCEL-URL.vercel.app'
```

### 2.2 Create package.json for VS Code Extension

In your main vscode folder, create an extension package.json:

```json
{
  "name": "octate-collaboration",
  "displayName": "Octate Collaboration",
  "description": "Real-time multiplayer collaboration for VS Code",
  "version": "1.0.0",
  "engines": {
    "vscode": "^1.82.0"
  },
  "categories": ["Other"],
  "activationEvents": [
    "onCommand:octate.joinRoom",
    "onCommand:octate.createRoom"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "octate.joinRoom",
        "title": "Join Collaboration Room",
        "category": "Octate"
      },
      {
        "command": "octate.createRoom",
        "title": "Create Collaboration Room",
        "category": "Octate"
      }
    ],
    "configuration": {
      "title": "Octate Collaboration",
      "properties": {
        "octate.collaboration.backendUrl": {
          "type": "string",
          "default": "https://YOUR-VERCEL-URL.vercel.app",
          "description": "Backend URL for collaboration service"
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./"
  },
  "dependencies": {
    "@types/vscode": "^1.82.0",
    "typescript": "^5.0.0"
  }
}
```

## Step 3: Create Extension Entry Point

### 3.1 Create extension.ts in your vscode root

```typescript
import * as vscode from 'vscode';
import { CollaborationService } from './collaboration-backend/lib/collaboration-service';
import { CollaborationUI } from './collaboration-backend/lib/collaboration-ui';
import { configManager } from './collaboration-backend/lib/config';

export function activate(context: vscode.ExtensionContext) {
    console.log('Octate Collaboration extension is activating...');

    // Initialize services
    const collaborationUI = new CollaborationUI(context);

    // Register commands
    const joinRoom = vscode.commands.registerCommand('octate.joinRoom', async () => {
        const roomId = await vscode.window.showInputBox({
            prompt: 'Enter room ID to join',
            placeholder: 'e.g., abc123'
        });

        if (roomId) {
            // Join room logic
            vscode.window.showInformationMessage(`Joining room: ${roomId}`);
        }
    });

    const createRoom = vscode.commands.registerCommand('octate.createRoom', async () => {
        const roomName = await vscode.window.showInputBox({
            prompt: 'Enter room name',
            placeholder: 'e.g., My Collaboration Session'
        });

        if (roomName) {
            // Create room logic
            vscode.window.showInformationMessage(`Creating room: ${roomName}`);
        }
    });

    context.subscriptions.push(joinRoom, createRoom);

    console.log('Octate Collaboration extension activated!');
}

export function deactivate() {
    console.log('Octate Collaboration extension deactivated');
}
```

## Step 4: Test the Connection

### 4.1 Test API Endpoints

After deployment, test your API:

```bash
# Health check
curl https://YOUR-VERCEL-URL.vercel.app/api/health

# Should return something like:
{
  "status": "healthy",
  "timestamp": "2025-09-27T...",
  "services": {
    "database": true,
    "realtime": true,
    "auth": true
  }
}
```

### 4.2 Test in VS Code

1. Open VS Code
2. Press `Ctrl+Shift+P` (Command Palette)
3. Type "Octate" to see your commands
4. Try "Join Collaboration Room" or "Create Collaboration Room"

## Step 5: Package and Distribute

### 5.1 Install VS Code Extension Manager

```bash
npm install -g @vscode/vsce
```

### 5.2 Package your extension

```bash
vsce package
```

This creates a `.vsix` file you can install or distribute.

## 🔗 Connection Flow

1. **VS Code Extension** ↔️ **Your Vercel Backend** ↔️ **Supabase Database**
2. Real-time events flow through WebSockets
3. Document operations are stored in Supabase
4. Operational Transform ensures conflict-free editing

## 🛠️ Configuration

Users can configure the backend URL in VS Code settings:

- `File` → `Preferences` → `Settings`
- Search for "Octate"
- Set the backend URL to your Vercel deployment

## 📊 Monitoring

Your Vercel deployment will provide:

- Real-time logs
- Performance metrics
- Error tracking
- Usage analytics

The `/api/health` endpoint helps monitor backend status.
