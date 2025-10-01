# Creating the VS Code Extension Package

## Option 1: Separate Extension Package (Recommended)

### Step 1: Create Extension Structure

```bash
# From your vscode root directory
mkdir octate-collaboration-extension
cd octate-collaboration-extension

# Initialize extension
npm init -y
```

### Step 2: Create Extension Manifest (package.json)

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
    "onCommand:octate.createRoom",
    "onCommand:octate.joinRoom"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "octate.createRoom",
        "title": "Create Collaboration Room",
        "category": "Octate"
      },
      {
        "command": "octate.joinRoom",
        "title": "Join Collaboration Room",
        "category": "Octate"
      },
      {
        "command": "octate.leaveRoom",
        "title": "Leave Room",
        "category": "Octate"
      }
    ],
    "configuration": {
      "title": "Octate Collaboration",
      "properties": {
        "octate.collaboration.backendUrl": {
          "type": "string",
          "default": "https://your-vercel-app.vercel.app",
          "description": "Backend URL for collaboration"
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.82.0",
    "typescript": "^5.0.0",
    "@vscode/vsce": "^2.21.0"
  },
  "dependencies": {
    "socket.io-client": "^4.8.1",
    "@supabase/supabase-js": "^2.38.4"
  }
}
```

### Step 3: Create Extension Entry Point (extension.ts)

```typescript
import * as vscode from 'vscode';

// Import your collaboration libraries
import { CollaborationService } from '../collaboration-backend/lib/collaboration-service';
import { CollaborationUI } from '../collaboration-backend/lib/collaboration-ui';
import { configManager } from '../collaboration-backend/lib/config';

let collaborationService: CollaborationService;
let collaborationUI: CollaborationUI;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Octate Collaboration extension activating...');

    // Initialize services
    collaborationService = new CollaborationService();
    collaborationUI = new CollaborationUI(context);

    // Register commands
    registerCommands(context);

    console.log('✅ Octate Collaboration extension activated!');
}

function registerCommands(context: vscode.ExtensionContext) {
    // Create Room Command
    const createRoom = vscode.commands.registerCommand('octate.createRoom', async () => {
        try {
            const roomName = await vscode.window.showInputBox({
                prompt: 'Enter room name',
                placeholder: 'e.g., Sprint Planning Session'
            });

            if (roomName) {
                const room = await collaborationService.createRoom(roomName);
                vscode.window.showInformationMessage(
                    `Room "${roomName}" created! Room ID: ${room.id}`
                );
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create room: ${error}`);
        }
    });

    // Join Room Command
    const joinRoom = vscode.commands.registerCommand('octate.joinRoom', async () => {
        try {
            const roomId = await vscode.window.showInputBox({
                prompt: 'Enter room ID to join',
                placeholder: 'e.g., abc123'
            });

            if (roomId) {
                await collaborationService.joinRoom(roomId);
                vscode.window.showInformationMessage(`Joined room: ${roomId}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to join room: ${error}`);
        }
    });

    // Leave Room Command
    const leaveRoom = vscode.commands.registerCommand('octate.leaveRoom', async () => {
        try {
            await collaborationService.leaveRoom();
            vscode.window.showInformationMessage('Left collaboration room');
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to leave room: ${error}`);
        }
    });

    context.subscriptions.push(createRoom, joinRoom, leaveRoom);
}

export function deactivate() {
    console.log('🔌 Octate Collaboration extension deactivated');
    collaborationService?.disconnect();
}
```

### Step 4: Compile and Package

```bash
# Compile TypeScript
npm run compile

# Package extension
npm install -g @vscode/vsce
vsce package

# This creates: octate-collaboration-1.0.0.vsix
```

### Step 5: Install Extension

```bash
# Install in VS Code
code --install-extension octate-collaboration-1.0.0.vsix
```

## Option 2: Integrate Directly into VS Code Core

If you want it as a core feature (not an extension), you'd need to:

1. **Modify VS Code source directly**
2. **Add to package.json dependencies**
3. **Register in main VS Code activation**
4. **Rebuild entire VS Code**

This is more complex and less portable.
