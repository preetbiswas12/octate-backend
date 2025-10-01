# Integrating Collaboration as Core VS Code Feature

## If You Want It Built-In (Not as Extension)

### Step 1: Move Collaboration Code to VS Code Core

```bash
# From your vscode root
mkdir src/vs/workbench/contrib/octateCollaboration
cp -r collaboration-backend/lib/* src/vs/workbench/contrib/octateCollaboration/
```

### Step 2: Add to VS Code's Main Package.json

```json
// In main vscode package.json, add dependencies:
"dependencies": {
  // ... existing dependencies
  "socket.io-client": "^4.8.1",
  "@supabase/supabase-js": "^2.38.4"
}
```

### Step 3: Register in Workbench

```typescript
// In src/vs/workbench/workbench.common.main.ts
import 'vs/workbench/contrib/octateCollaboration/octateCollaboration.contribution';
```

### Step 4: Create Contribution File

```typescript
// src/vs/workbench/contrib/octateCollaboration/octateCollaboration.contribution.ts
import { registerAction2, Action2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

class CreateCollaborationRoomAction extends Action2 {
    constructor() {
        super({
            id: 'octate.createRoom',
            title: 'Create Collaboration Room',
            category: 'Octate'
        });
    }

    async run(accessor: ServicesAccessor): Promise<void> {
        // Your collaboration logic here
    }
}

registerAction2(CreateCollaborationRoomAction);
```

### Step 5: Rebuild VS Code

```bash
npm run compile
npm run watch  # for development
```

## Pros/Cons of Each Approach

### Extension Approach ✅ (Recommended)

**Pros:**

- Easy to distribute and install
- Doesn't require rebuilding VS Code
- Users can enable/disable
- Easier to update
- Can be published to marketplace

**Cons:**

- Requires separate package

### Core Integration Approach

**Pros:**

- Built directly into your VS Code fork
- No need to install extension
- Feels more native

**Cons:**

- Must rebuild entire VS Code
- Harder to maintain and update
- Less portable
- Can't distribute easily
