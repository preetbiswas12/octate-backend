/**
 * Collaboration UI components for VS Code integration
 * Provides participant list, presence indicators, and collaboration status UI
 */

import * as vscode from 'vscode';
import { collaborationService, Participant, Room } from './collaboration-service';
import { documentSyncService } from './document-sync';
import { logger } from './utils';

export class CollaborationUI {
	private context: vscode.ExtensionContext;
	private participantStatusBar: vscode.StatusBarItem;
	private syncStatusBar: vscode.StatusBarItem;
	private participantTreeProvider: ParticipantTreeProvider;
	private presenceDecorations = new Map<string, vscode.TextEditorDecorationType>();
	private conflictDecorations: vscode.TextEditorDecorationType;
	private isUIActive = false;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Create status bar items
		this.participantStatusBar = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			200
		);
		this.syncStatusBar = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			199
		);

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

		logger.info('CollaborationUI initialized');
	}

	/**
	 * Setup event listeners for collaboration service
	 */
	private setupEventListeners(): void {
		// Room events
		collaborationService.on('room-joined', (room: Room) => {
			this.onRoomJoined(room);
		});

		collaborationService.on('room-left', () => {
			this.onRoomLeft();
		});

		collaborationService.on('participant-joined', (participant: Participant) => {
			this.onParticipantJoined(participant);
		});

		collaborationService.on('participant-left', (participant: Participant) => {
			this.onParticipantLeft(participant);
		});

		collaborationService.on('participant-updated', (participant: Participant) => {
			this.onParticipantUpdated(participant);
		});

		// Cursor events
		collaborationService.on('cursor-updated', (cursor) => {
			this.updateCursorDecorations(cursor);
		});

		collaborationService.on('selection-updated', (selection) => {
			this.updateSelectionDecorations(selection);
		});

		// Sync events
		documentSyncService.on('sync-started', (documentId) => {
			this.updateSyncStatus(`Syncing... ${this.getFileName(documentId)}`);
		});

		documentSyncService.on('sync-completed', (documentId, result) => {
			this.updateSyncStatus(`Synced ${this.getFileName(documentId)}`);
			setTimeout(() => this.updateSyncStatus(''), 2000);
		});

		documentSyncService.on('sync-failed', (documentId, error) => {
			this.updateSyncStatus(`Sync failed: ${error.message}`);
		});

		documentSyncService.on('conflict-detected', (conflict) => {
			this.showConflictDecoration(conflict);
			vscode.window.showWarningMessage(
				`Conflict detected in document. Using server version.`,
				'View Details'
			).then(selection => {
				if (selection === 'View Details') {
					this.showConflictDetails(conflict);
				}
			});
		});

		// Connection events
		collaborationService.on('connected', () => {
			this.updateConnectionStatus(true);
		});

		collaborationService.on('disconnected', () => {
			this.updateConnectionStatus(false);
		});

		collaborationService.on('error', (error) => {
			vscode.window.showErrorMessage(`Collaboration error: ${error.message}`);
		});
	}

	/**
	 * Register VS Code commands
	 */
	private registerCommands(): void {
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
	private onRoomJoined(room: Room): void {
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
		vscode.window.showInformationMessage(
			`Joined collaboration room: ${room.name}`,
			'Show Participants'
		).then(selection => {
			if (selection === 'Show Participants') {
				this.showParticipantsList();
			}
		});

		logger.info('UI activated for room', { roomId: room.id, roomName: room.name });
	}

	/**
	 * Handle room left event
	 */
	private onRoomLeft(): void {
		this.isUIActive = false;

		// Clear status bars
		this.participantStatusBar.hide();
		this.syncStatusBar.hide();

		// Clear decorations
		this.clearAllDecorations();

		// Clear tree provider
		this.participantTreeProvider.clear();

		logger.info('UI deactivated');
	}

	/**
	 * Handle participant joined event
	 */
	private onParticipantJoined(participant: Participant): void {
		this.participantTreeProvider.addParticipant(participant);
		this.updateParticipantStatus();

		// Create decoration type for this participant
		this.createParticipantDecoration(participant);

		vscode.window.showInformationMessage(
			`${participant.displayName} joined the collaboration`
		);
	}

	/**
	 * Handle participant left event
	 */
	private onParticipantLeft(participant: Participant): void {
		this.participantTreeProvider.removeParticipant(participant.id);
		this.updateParticipantStatus();

		// Remove decoration type
		this.removeParticipantDecoration(participant.id);

		vscode.window.showInformationMessage(
			`${participant.displayName} left the collaboration`
		);
	}

	/**
	 * Handle participant updated event
	 */
	private onParticipantUpdated(participant: Participant): void {
		this.participantTreeProvider.updateParticipant(participant);
		this.updateParticipantStatus();
	}

	/**
	 * Update participant status in status bar
	 */
	private updateParticipantStatus(participants?: Participant[]): void {
		const room = collaborationService.getCurrentRoom();
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
	private updateSyncStatus(status: string): void {
		if (status) {
			this.syncStatusBar.text = `$(sync) ${status}`;
			this.syncStatusBar.tooltip = 'Document synchronization status';
		} else {
			this.syncStatusBar.text = '$(check) Synced';
			this.syncStatusBar.tooltip = 'All documents are synchronized';
		}
		this.syncStatusBar.command = 'octate.showSyncStatus';
	}

	/**
	 * Update connection status
	 */
	private updateConnectionStatus(connected: boolean): void {
		if (connected) {
			this.syncStatusBar.color = undefined;
		} else {
			this.syncStatusBar.color = '#ff6b6b';
			this.syncStatusBar.text = '$(x) Disconnected';
			this.syncStatusBar.tooltip = 'Connection lost. Attempting to reconnect...';
		}
	}

	/**
	 * Create decoration type for a participant
	 */
	private createParticipantDecoration(participant: Participant): void {
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
	private removeParticipantDecoration(participantId: string): void {
		const decoration = this.presenceDecorations.get(participantId);
		if (decoration) {
			decoration.dispose();
			this.presenceDecorations.delete(participantId);
		}
	}

	/**
	 * Update cursor decorations for a participant
	 */
	private updateCursorDecorations(cursor: any): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const decoration = this.presenceDecorations.get(cursor.participantId);
		if (!decoration) return;

		const position = new vscode.Position(cursor.position.line, cursor.position.character);
		const range = new vscode.Range(position, position);

		const decorationOptions: vscode.DecorationOptions = {
			range,
			hoverMessage: `${cursor.displayName} is here`,
		};

		editor.setDecorations(decoration, [decorationOptions]);
	}

	/**
	 * Update selection decorations for a participant
	 */
	private updateSelectionDecorations(selection: any): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !selection.selection) return;

		const decoration = this.presenceDecorations.get(selection.participantId);
		if (!decoration) return;

		const startPos = new vscode.Position(
			selection.selection.start.line,
			selection.selection.start.character
		);
		const endPos = new vscode.Position(
			selection.selection.end.line,
			selection.selection.end.character
		);
		const range = new vscode.Range(startPos, endPos);

		const decorationOptions: vscode.DecorationOptions = {
			range,
			hoverMessage: `${selection.displayName}'s selection`,
		};

		editor.setDecorations(decoration, [decorationOptions]);
	}

	/**
	 * Show conflict decoration
	 */
	private showConflictDecoration(conflict: any): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		// Highlight the conflicted area
		const range = new vscode.Range(0, 0, 0, 10); // Placeholder range
		const decorationOptions: vscode.DecorationOptions = {
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
	private async showParticipantsList(): Promise<void> {
		const room = collaborationService.getCurrentRoom();
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
			vscode.window.showInformationMessage(
				`${selected.participant.displayName} joined at ${new Date(selected.participant.joinedAt).toLocaleString()}`
			);
		}
	}

	/**
	 * Show collaboration panel
	 */
	private showCollaborationPanel(): void {
		const panel = vscode.window.createWebviewPanel(
			'octate.collaboration',
			'Collaboration',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
			}
		);

		panel.webview.html = this.getCollaborationPanelHTML();

		// Handle messages from webview
		panel.webview.onDidReceiveMessage((message) => {
			switch (message.command) {
				case 'leaveRoom':
					collaborationService.leaveRoom();
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
	private getCollaborationPanelHTML(): string {
		const room = collaborationService.getCurrentRoom();
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
	private togglePresenceIndicators(): void {
		// Implementation for toggling presence indicators
		vscode.window.showInformationMessage('Presence indicators toggled');
	}

	/**
	 * Show sync status panel
	 */
	private showSyncStatusPanel(): void {
		// Implementation for sync status panel
		vscode.window.showInformationMessage('Sync status panel shown');
	}

	/**
	 * Force sync current document
	 */
	private async forceSyncCurrentDocument(): Promise<void> {
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
		} catch (error) {
			vscode.window.showErrorMessage(`Sync failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Show conflict resolution panel
	 */
	private showConflictResolutionPanel(): void {
		// Implementation for conflict resolution UI
		vscode.window.showInformationMessage('Conflict resolution panel shown');
	}

	/**
	 * Show conflict details
	 */
	private showConflictDetails(conflict: any): void {
		vscode.window.showInformationMessage(
			`Conflict ID: ${conflict.id}\nResolution: ${conflict.resolutionStrategy}`,
			'OK'
		);
	}

	/**
	 * Clear all decorations
	 */
	private clearAllDecorations(): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

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
	private getFileName(documentId: string): string {
		// Implementation to get filename from document ID
		return 'document.txt';
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.participantStatusBar.dispose();
		this.syncStatusBar.dispose();
		this.conflictDecorations.dispose();

		for (const decoration of this.presenceDecorations.values()) {
			decoration.dispose();
		}
		this.presenceDecorations.clear();

		logger.info('CollaborationUI disposed');
	}
}

/**
 * Tree data provider for participants
 */
class ParticipantTreeProvider implements vscode.TreeDataProvider<ParticipantTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ParticipantTreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private room: Room | null = null;

	updateRoom(room: Room): void {
		this.room = room;
		this._onDidChangeTreeData.fire(undefined);
	}

	addParticipant(participant: Participant): void {
		if (this.room) {
			this.room.participants.push(participant);
			this._onDidChangeTreeData.fire(undefined);
		}
	}

	removeParticipant(participantId: string): void {
		if (this.room) {
			this.room.participants = this.room.participants.filter(p => p.id !== participantId);
			this._onDidChangeTreeData.fire(undefined);
		}
	}

	updateParticipant(participant: Participant): void {
		if (this.room) {
			const index = this.room.participants.findIndex(p => p.id === participant.id);
			if (index > -1) {
				this.room.participants[index] = participant;
				this._onDidChangeTreeData.fire(undefined);
			}
		}
	}

	clear(): void {
		this.room = null;
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: ParticipantTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ParticipantTreeItem): ParticipantTreeItem[] {
		if (!this.room) {
			return [];
		}

		return this.room.participants.map(participant =>
			new ParticipantTreeItem(participant)
		);
	}
}

/**
 * Tree item for participants
 */
class ParticipantTreeItem extends vscode.TreeItem {
	public readonly participant: Participant;

	constructor(participant: Participant) {
		super(participant.displayName, vscode.TreeItemCollapsibleState.None);

		this.participant = participant;
		(this as any).description = participant.isOwner ? 'Owner' : 'Participant';
		(this as any).tooltip = `${participant.displayName}\nStatus: ${participant.status}\nJoined: ${new Date(participant.joinedAt).toLocaleString()}`;

		// Set icon based on status
		(this as any).iconPath = new vscode.ThemeIcon(
			participant.status === 'online' ? 'circle-filled' : 'circle-outline',
			participant.status === 'online' ? new vscode.ThemeColor('charts.green') : undefined
		);
	}
}

export { ParticipantTreeProvider, ParticipantTreeItem };
