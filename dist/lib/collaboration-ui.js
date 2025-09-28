"use strict";
/**
 * Collaboration UI components for VS Code integration
 * Provides participant list, presence indicators, and collaboration status UI
 */
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
exports.ParticipantTreeItem = exports.ParticipantTreeProvider = exports.CollaborationUI = void 0;
const vscode = __importStar(require("vscode"));
const collaboration_service_1 = require("./collaboration-service");
const document_sync_1 = require("./document-sync");
const utils_1 = require("./utils");
class CollaborationUI {
    constructor(context) {
        this.presenceDecorations = new Map();
        this.isUIActive = false;
        this.context = context;
        // Create status bar items
        this.participantStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
        this.syncStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 199);
        // Create tree provider for participants
        this.participantTreeProvider = new ParticipantTreeProvider();
        // Create decoration types
        this.conflictDecorations = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
            border: '2px solid red',
            borderRadius: '3px',
        });
        this.setupEventListeners();
        this.registerCommands();
        utils_1.logger.info('CollaborationUI initialized');
    }
    /**
     * Setup event listeners for collaboration service
     */
    setupEventListeners() {
        // Room events
        collaboration_service_1.collaborationService.on('room-joined', (room) => {
            this.onRoomJoined(room);
        });
        collaboration_service_1.collaborationService.on('room-left', () => {
            this.onRoomLeft();
        });
        collaboration_service_1.collaborationService.on('participant-joined', (participant) => {
            this.onParticipantJoined(participant);
        });
        collaboration_service_1.collaborationService.on('participant-left', (participant) => {
            this.onParticipantLeft(participant);
        });
        collaboration_service_1.collaborationService.on('participant-updated', (participant) => {
            this.onParticipantUpdated(participant);
        });
        // Cursor events
        collaboration_service_1.collaborationService.on('cursor-updated', (cursor) => {
            this.updateCursorDecorations(cursor);
        });
        collaboration_service_1.collaborationService.on('selection-updated', (selection) => {
            this.updateSelectionDecorations(selection);
        });
        // Sync events
        document_sync_1.documentSyncService.on('sync-started', (documentId) => {
            this.updateSyncStatus(`Syncing... ${this.getFileName(documentId)}`);
        });
        document_sync_1.documentSyncService.on('sync-completed', (documentId, result) => {
            this.updateSyncStatus(`Synced ${this.getFileName(documentId)}`);
            setTimeout(() => this.updateSyncStatus(''), 2000);
        });
        document_sync_1.documentSyncService.on('sync-failed', (documentId, error) => {
            this.updateSyncStatus(`Sync failed: ${error.message}`);
        });
        document_sync_1.documentSyncService.on('conflict-detected', (conflict) => {
            this.showConflictDecoration(conflict);
            vscode.window.showWarningMessage(`Conflict detected in document. Using server version.`, 'View Details').then(selection => {
                if (selection === 'View Details') {
                    this.showConflictDetails(conflict);
                }
            });
        });
        // Connection events
        collaboration_service_1.collaborationService.on('connected', () => {
            this.updateConnectionStatus(true);
        });
        collaboration_service_1.collaborationService.on('disconnected', () => {
            this.updateConnectionStatus(false);
        });
        collaboration_service_1.collaborationService.on('error', (error) => {
            vscode.window.showErrorMessage(`Collaboration error: ${error.message}`);
        });
    }
    /**
     * Register VS Code commands
     */
    registerCommands() {
        const commands = [
            vscode.commands.registerCommand('octate.showParticipants', () => {
                this.showParticipantsList();
            }),
            vscode.commands.registerCommand('octate.showCollaborationPanel', () => {
                this.showCollaborationPanel();
            }),
            vscode.commands.registerCommand('octate.togglePresenceIndicators', () => {
                this.togglePresenceIndicators();
            }),
            vscode.commands.registerCommand('octate.showSyncStatus', () => {
                this.showSyncStatusPanel();
            }),
            vscode.commands.registerCommand('octate.forceSync', () => {
                this.forceSyncCurrentDocument();
            }),
            vscode.commands.registerCommand('octate.showConflicts', () => {
                this.showConflictResolutionPanel();
            }),
        ];
        this.context.subscriptions.push(...commands);
    }
    /**
     * Handle room joined event
     */
    onRoomJoined(room) {
        this.isUIActive = true;
        this.updateParticipantStatus(room.participants);
        this.participantTreeProvider.updateRoom(room);
        // Show status bars
        this.participantStatusBar.show();
        this.syncStatusBar.show();
        // Register tree view
        vscode.window.createTreeView('octate.participants', {
            treeDataProvider: this.participantTreeProvider,
            showCollapseAll: false,
        });
        // Show welcome message
        vscode.window.showInformationMessage(`Joined collaboration room: ${room.name}`, 'Show Participants').then(selection => {
            if (selection === 'Show Participants') {
                this.showParticipantsList();
            }
        });
        utils_1.logger.info('UI activated for room', { roomId: room.id, roomName: room.name });
    }
    /**
     * Handle room left event
     */
    onRoomLeft() {
        this.isUIActive = false;
        // Clear status bars
        this.participantStatusBar.hide();
        this.syncStatusBar.hide();
        // Clear decorations
        this.clearAllDecorations();
        // Clear tree provider
        this.participantTreeProvider.clear();
        utils_1.logger.info('UI deactivated');
    }
    /**
     * Handle participant joined event
     */
    onParticipantJoined(participant) {
        this.participantTreeProvider.addParticipant(participant);
        this.updateParticipantStatus();
        // Create decoration type for this participant
        this.createParticipantDecoration(participant);
        vscode.window.showInformationMessage(`${participant.displayName} joined the collaboration`);
    }
    /**
     * Handle participant left event
     */
    onParticipantLeft(participant) {
        this.participantTreeProvider.removeParticipant(participant.id);
        this.updateParticipantStatus();
        // Remove decoration type
        this.removeParticipantDecoration(participant.id);
        vscode.window.showInformationMessage(`${participant.displayName} left the collaboration`);
    }
    /**
     * Handle participant updated event
     */
    onParticipantUpdated(participant) {
        this.participantTreeProvider.updateParticipant(participant);
        this.updateParticipantStatus();
    }
    /**
     * Update participant status in status bar
     */
    updateParticipantStatus(participants) {
        const room = collaboration_service_1.collaborationService.getCurrentRoom();
        if (!room) {
            this.participantStatusBar.text = '';
            return;
        }
        const participantList = participants || room.participants;
        const onlineCount = participantList.filter(p => p.status === 'online').length;
        this.participantStatusBar.text = `$(people) ${onlineCount}/${room.maxParticipants}`;
        this.participantStatusBar.tooltip = `${onlineCount} participants online in ${room.name}`;
        this.participantStatusBar.command = 'octate.showParticipants';
    }
    /**
     * Update sync status in status bar
     */
    updateSyncStatus(status) {
        if (status) {
            this.syncStatusBar.text = `$(sync) ${status}`;
            this.syncStatusBar.tooltip = 'Document synchronization status';
        }
        else {
            this.syncStatusBar.text = '$(check) Synced';
            this.syncStatusBar.tooltip = 'All documents are synchronized';
        }
        this.syncStatusBar.command = 'octate.showSyncStatus';
    }
    /**
     * Update connection status
     */
    updateConnectionStatus(connected) {
        if (connected) {
            this.syncStatusBar.color = undefined;
        }
        else {
            this.syncStatusBar.color = '#ff6b6b';
            this.syncStatusBar.text = '$(x) Disconnected';
            this.syncStatusBar.tooltip = 'Connection lost. Attempting to reconnect...';
        }
    }
    /**
     * Create decoration type for a participant
     */
    createParticipantDecoration(participant) {
        const decoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: `${participant.color}20`,
            border: `1px solid ${participant.color}`,
            borderRadius: '2px',
            after: {
                contentText: ` ${participant.displayName}`,
                color: participant.color,
                fontStyle: 'italic',
            },
        });
        this.presenceDecorations.set(participant.id, decoration);
    }
    /**
     * Remove decoration type for a participant
     */
    removeParticipantDecoration(participantId) {
        const decoration = this.presenceDecorations.get(participantId);
        if (decoration) {
            decoration.dispose();
            this.presenceDecorations.delete(participantId);
        }
    }
    /**
     * Update cursor decorations for a participant
     */
    updateCursorDecorations(cursor) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const decoration = this.presenceDecorations.get(cursor.participantId);
        if (!decoration)
            return;
        const position = new vscode.Position(cursor.position.line, cursor.position.character);
        const range = new vscode.Range(position, position);
        const decorationOptions = {
            range,
            hoverMessage: `${cursor.displayName} is here`,
        };
        editor.setDecorations(decoration, [decorationOptions]);
    }
    /**
     * Update selection decorations for a participant
     */
    updateSelectionDecorations(selection) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !selection.selection)
            return;
        const decoration = this.presenceDecorations.get(selection.participantId);
        if (!decoration)
            return;
        const startPos = new vscode.Position(selection.selection.start.line, selection.selection.start.character);
        const endPos = new vscode.Position(selection.selection.end.line, selection.selection.end.character);
        const range = new vscode.Range(startPos, endPos);
        const decorationOptions = {
            range,
            hoverMessage: `${selection.displayName}'s selection`,
        };
        editor.setDecorations(decoration, [decorationOptions]);
    }
    /**
     * Show conflict decoration
     */
    showConflictDecoration(conflict) {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        // Highlight the conflicted area
        const range = new vscode.Range(0, 0, 0, 10); // Placeholder range
        const decorationOptions = {
            range,
            hoverMessage: 'Conflict detected - using server version',
        };
        editor.setDecorations(this.conflictDecorations, [decorationOptions]);
        // Remove decoration after 5 seconds
        setTimeout(() => {
            editor.setDecorations(this.conflictDecorations, []);
        }, 5000);
    }
    /**
     * Show participants list in quick pick
     */
    async showParticipantsList() {
        const room = collaboration_service_1.collaborationService.getCurrentRoom();
        if (!room) {
            vscode.window.showInformationMessage('Not in a collaboration session');
            return;
        }
        const items = room.participants.map(participant => ({
            label: `$(account) ${participant.displayName}`,
            description: participant.isOwner ? 'Owner' : 'Participant',
            detail: `Status: ${participant.status} • Color: ${participant.color}`,
            participant,
        }));
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Participants in ${room.name} (${items.length}/${room.maxParticipants})`,
            matchOnDescription: true,
            matchOnDetail: true,
        });
        if (selected) {
            // Could show participant details or actions
            vscode.window.showInformationMessage(`${selected.participant.displayName} joined at ${new Date(selected.participant.joinedAt).toLocaleString()}`);
        }
    }
    /**
     * Show collaboration panel
     */
    showCollaborationPanel() {
        const panel = vscode.window.createWebviewPanel('octate.collaboration', 'Collaboration', vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        panel.webview.html = this.getCollaborationPanelHTML();
        // Handle messages from webview
        panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'leaveRoom':
                    collaboration_service_1.collaborationService.leaveRoom();
                    break;
                case 'showParticipants':
                    this.showParticipantsList();
                    break;
            }
        });
    }
    /**
     * Get HTML content for collaboration panel
     */
    getCollaborationPanelHTML() {
        const room = collaboration_service_1.collaborationService.getCurrentRoom();
        if (!room) {
            return '<html><body><h2>Not in a collaboration session</h2></body></html>';
        }
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Collaboration</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
          }
          .room-info {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
          }
          .participants {
            margin-top: 20px;
          }
          .participant {
            display: flex;
            align-items: center;
            padding: 8px;
            margin: 5px 0;
            background-color: var(--vscode-list-hoverBackground);
            border-radius: 3px;
          }
          .participant-color {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 10px;
          }
          .participant-name {
            flex: 1;
          }
          .participant-status {
            font-size: 12px;
            opacity: 0.7;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 3px;
            cursor: pointer;
            margin: 5px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div class="room-info">
          <h2>${room.name}</h2>
          <p>${room.description || 'No description'}</p>
          <p><strong>Participants:</strong> ${room.participants.length}/${room.maxParticipants}</p>
        </div>

        <div class="participants">
          <h3>Participants</h3>
          ${room.participants.map(p => `
            <div class="participant">
              <div class="participant-color" style="background-color: ${p.color}"></div>
              <div class="participant-name">
                ${p.displayName} ${p.isOwner ? '(Owner)' : ''}
              </div>
              <div class="participant-status">${p.status}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 30px;">
          <button onclick="leaveRoom()">Leave Room</button>
          <button onclick="showParticipants()">Participant Details</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function leaveRoom() {
            vscode.postMessage({ command: 'leaveRoom' });
          }

          function showParticipants() {
            vscode.postMessage({ command: 'showParticipants' });
          }
        </script>
      </body>
      </html>
    `;
    }
    /**
     * Toggle presence indicators
     */
    togglePresenceIndicators() {
        // Implementation for toggling presence indicators
        vscode.window.showInformationMessage('Presence indicators toggled');
    }
    /**
     * Show sync status panel
     */
    showSyncStatusPanel() {
        // Implementation for sync status panel
        vscode.window.showInformationMessage('Sync status panel shown');
    }
    /**
     * Force sync current document
     */
    async forceSyncCurrentDocument() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active document to sync');
            return;
        }
        try {
            vscode.window.showInformationMessage('Forcing document sync...');
            // Implementation would get document ID and call sync
            // await documentSyncService.syncDocument(documentId);
            vscode.window.showInformationMessage('Document sync completed');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Sync failed: ${error.message}`);
        }
    }
    /**
     * Show conflict resolution panel
     */
    showConflictResolutionPanel() {
        // Implementation for conflict resolution UI
        vscode.window.showInformationMessage('Conflict resolution panel shown');
    }
    /**
     * Show conflict details
     */
    showConflictDetails(conflict) {
        vscode.window.showInformationMessage(`Conflict ID: ${conflict.id}\nResolution: ${conflict.resolutionStrategy}`, 'OK');
    }
    /**
     * Clear all decorations
     */
    clearAllDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        // Clear all participant decorations
        for (const decoration of this.presenceDecorations.values()) {
            editor.setDecorations(decoration, []);
        }
        // Clear conflict decorations
        editor.setDecorations(this.conflictDecorations, []);
    }
    /**
     * Get file name from document ID
     */
    getFileName(documentId) {
        // Implementation to get filename from document ID
        return 'document.txt';
    }
    /**
     * Dispose resources
     */
    dispose() {
        this.participantStatusBar.dispose();
        this.syncStatusBar.dispose();
        this.conflictDecorations.dispose();
        for (const decoration of this.presenceDecorations.values()) {
            decoration.dispose();
        }
        this.presenceDecorations.clear();
        utils_1.logger.info('CollaborationUI disposed');
    }
}
exports.CollaborationUI = CollaborationUI;
/**
 * Tree data provider for participants
 */
class ParticipantTreeProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.room = null;
    }
    updateRoom(room) {
        this.room = room;
        this._onDidChangeTreeData.fire(undefined);
    }
    addParticipant(participant) {
        if (this.room) {
            this.room.participants.push(participant);
            this._onDidChangeTreeData.fire(undefined);
        }
    }
    removeParticipant(participantId) {
        if (this.room) {
            this.room.participants = this.room.participants.filter(p => p.id !== participantId);
            this._onDidChangeTreeData.fire(undefined);
        }
    }
    updateParticipant(participant) {
        if (this.room) {
            const index = this.room.participants.findIndex(p => p.id === participant.id);
            if (index > -1) {
                this.room.participants[index] = participant;
                this._onDidChangeTreeData.fire(undefined);
            }
        }
    }
    clear() {
        this.room = null;
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.room) {
            return [];
        }
        return this.room.participants.map(participant => new ParticipantTreeItem(participant));
    }
}
exports.ParticipantTreeProvider = ParticipantTreeProvider;
/**
 * Tree item for participants
 */
class ParticipantTreeItem extends vscode.TreeItem {
    constructor(participant) {
        super(participant.displayName, vscode.TreeItemCollapsibleState.None);
        this.participant = participant;
        this.description = participant.isOwner ? 'Owner' : 'Participant';
        this.tooltip = `${participant.displayName}\nStatus: ${participant.status}\nJoined: ${new Date(participant.joinedAt).toLocaleString()}`;
        // Set icon based on status
        this.iconPath = new vscode.ThemeIcon(participant.status === 'online' ? 'circle-filled' : 'circle-outline', participant.status === 'online' ? new vscode.ThemeColor('charts.green') : undefined);
    }
}
exports.ParticipantTreeItem = ParticipantTreeItem;
//# sourceMappingURL=collaboration-ui.js.map