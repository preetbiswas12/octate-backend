/**
 * VS Code extension integration for the collaboration backend
 * This file integrates the collaboration service with VS Code's extension API
 */

import * as vscode from 'vscode';
import { collaborationService, CollaborationService, Participant, Room, CursorData } from './collaboration-service';
import { logger, sanitizeDisplayName, getLanguageFromFilePath } from './utils';

export class CollaborationExtension {
	private context: vscode.ExtensionContext;
	private statusBarItem: vscode.StatusBarItem;
	private diagnosticCollection: vscode.DiagnosticCollection;
	private cursorsDecorationType: vscode.TextEditorDecorationType;
	private selectionsDecorationType: vscode.TextEditorDecorationType;
	private participantCursors: Map<string, CursorData> = new Map();
	private isCollaborating = false;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Create status bar item
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.statusBarItem.text = '$(link) Collaboration';
		this.statusBarItem.tooltip = 'Start collaboration session';
		this.statusBarItem.command = 'octate.startCollaboration';
		this.statusBarItem.show();

		// Create diagnostic collection
		this.diagnosticCollection = vscode.languages.createDiagnosticCollection('collaboration');

		// Create decoration types for cursors and selections
		this.cursorsDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(255, 0, 0, 0.2)',
			border: '1px solid red',
		});

		this.selectionsDecorationType = vscode.window.createTextEditorDecorationType({
			backgroundColor: 'rgba(0, 255, 0, 0.1)',
			border: '1px solid green',
		});

		this.setupCollaborationService();
		this.registerCommands();
		this.registerEventListeners();

		logger.info('CollaborationExtension initialized');
	}

	/**
	 * Setup collaboration service event listeners
	 */
	private setupCollaborationService(): void {
		// Connection events
		collaborationService.on('connected', () => {
			this.updateStatusBar('$(check) Connected', 'Connected to collaboration server');
			vscode.window.showInformationMessage('Connected to collaboration server');
		});

		collaborationService.on('disconnected', () => {
			this.updateStatusBar('$(x) Disconnected', 'Disconnected from collaboration server');
			vscode.window.showWarningMessage('Disconnected from collaboration server');
		});

		collaborationService.on('error', (error: Error) => {
			this.updateStatusBar('$(alert) Error', `Collaboration error: ${error.message}`);
			vscode.window.showErrorMessage(`Collaboration error: ${error.message}`);
		});

		collaborationService.on('reconnecting', (attemptNumber: number) => {
			this.updateStatusBar('$(sync~spin) Reconnecting', `Reconnecting... (attempt ${attemptNumber})`);
		});

		// Room events
		collaborationService.on('room-joined', (room: Room) => {
			this.isCollaborating = true;
			this.updateStatusBar(
				`$(people) ${room.currentParticipants}/${room.maxParticipants}`,
				`Collaborating in room: ${room.name}`
			);
			vscode.window.showInformationMessage(`Joined collaboration room: ${room.name}`);
		});

		collaborationService.on('room-left', () => {
			this.isCollaborating = false;
			this.participantCursors.clear();
			this.updateCursorDecorations();
			this.updateStatusBar('$(link) Start Collaboration', 'Start collaboration session');
			vscode.window.showInformationMessage('Left collaboration session');
		});

		collaborationService.on('participant-joined', (participant: Participant) => {
			vscode.window.showInformationMessage(`${participant.displayName} joined the session`);
		});

		collaborationService.on('participant-left', (participant: Participant) => {
			this.participantCursors.delete(participant.id);
			this.updateCursorDecorations();
			vscode.window.showInformationMessage(`${participant.displayName} left the session`);
		});

		// Document events
		collaborationService.on('operation-applied', (operation) => {
			// Handle incoming text changes
			this.applyRemoteOperation(operation);
		});

		collaborationService.on('cursor-updated', (cursor: CursorData) => {
			this.participantCursors.set(cursor.participantId, cursor);
			this.updateCursorDecorations();
		});

		collaborationService.on('selection-updated', (selection: CursorData) => {
			this.participantCursors.set(selection.participantId, selection);
			this.updateCursorDecorations();
		});
	}

	/**
	 * Register VS Code commands
	 */
	private registerCommands(): void {
		// Start collaboration command
		const startCollabCommand = vscode.commands.registerCommand('octate.startCollaboration', async () => {
			try {
				if (this.isCollaborating) {
					await this.stopCollaboration();
				} else {
					await this.startCollaboration();
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to start collaboration: ${(error as Error).message}`);
			}
		});

		// Join room command
		const joinRoomCommand = vscode.commands.registerCommand('octate.joinRoom', async () => {
			const roomId = await vscode.window.showInputBox({
				prompt: 'Enter room ID or invitation link',
				placeHolder: 'Room ID or vscode://octate/collaboration/room/...',
			});

			if (roomId) {
				await this.joinRoom(roomId);
			}
		});

		// Create room command
		const createRoomCommand = vscode.commands.registerCommand('octate.createRoom', async () => {
			await this.createRoom();
		});

		// Leave room command
		const leaveRoomCommand = vscode.commands.registerCommand('octate.leaveRoom', async () => {
			await this.stopCollaboration();
		});

		// Show participants command
		const showParticipantsCommand = vscode.commands.registerCommand('octate.showParticipants', async () => {
			await this.showParticipants();
		});

		// Add commands to context
		this.context.subscriptions.push(
			startCollabCommand,
			joinRoomCommand,
			createRoomCommand,
			leaveRoomCommand,
			showParticipantsCommand
		);
	}

	/**
	 * Register VS Code event listeners
	 */
	private registerEventListeners(): void {
		// Document change events
		const onDocumentChange = vscode.workspace.onDidChangeTextDocument((event) => {
			if (!this.isCollaborating || event.document.uri.scheme !== 'file') {
				return;
			}

			this.handleDocumentChange(event);
		});

		// Cursor/selection change events
		const onSelectionChange = vscode.window.onDidChangeTextEditorSelection((event) => {
			if (!this.isCollaborating) {
				return;
			}

			this.handleSelectionChange(event);
		});

		// Active editor change events
		const onActiveEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (!this.isCollaborating || !editor) {
				return;
			}

			this.handleActiveEditorChange(editor);
		});

		// Add to context
		this.context.subscriptions.push(
			onDocumentChange,
			onSelectionChange,
			onActiveEditorChange
		);
	}

	/**
	 * Start collaboration session
	 */
	private async startCollaboration(): Promise<void> {
		try {
			// Initialize collaboration service
			await collaborationService.initialize();

			// Get user display name
			const displayName = await this.getDisplayName();
			if (!displayName) {
				return;
			}

			// Show options: Create room or Join room
			const option = await vscode.window.showQuickPick([
				{ label: 'Create New Room', value: 'create' },
				{ label: 'Join Existing Room', value: 'join' },
			], {
				placeHolder: 'Choose collaboration option',
			});

			if (!option) {
				return;
			}

			if (option.value === 'create') {
				await this.createRoom();
			} else {
				const roomId = await vscode.window.showInputBox({
					prompt: 'Enter room ID or invitation link',
					placeHolder: 'Room ID or invitation link',
				});

				if (roomId) {
					await this.joinRoom(roomId);
				}
			}
		} catch (error) {
			logger.error('Failed to start collaboration', error as Error);
			throw error;
		}
	}

	/**
	 * Stop collaboration session
	 */
	private async stopCollaboration(): Promise<void> {
		try {
			await collaborationService.leaveRoom();
			this.isCollaborating = false;
			this.participantCursors.clear();
			this.updateCursorDecorations();
			this.updateStatusBar('$(link) Start Collaboration', 'Start collaboration session');
		} catch (error) {
			logger.error('Failed to stop collaboration', error as Error);
		}
	}

	/**
	 * Create a new collaboration room
	 */
	private async createRoom(): Promise<void> {
		try {
			const roomName = await vscode.window.showInputBox({
				prompt: 'Enter room name',
				placeHolder: 'My Collaboration Room',
				value: 'My Collaboration Room',
			});

			if (!roomName) {
				return;
			}

			const displayName = await this.getDisplayName();
			if (!displayName) {
				return;
			}

			// Create room via API
			const response = await fetch(`${process.env.VSCODE_COLLABORATION_API_URL || 'http://localhost:3000'}/api/rooms`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					name: roomName,
					description: `Collaboration room created by ${displayName}`,
					isPublic: false,
					maxParticipants: 10,
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to create room');
			}

			const responseData = await response.json() as { data: { id: string; name: string } };
			const room = responseData.data;

			// Join the created room
			await collaborationService.joinRoom(room.id, displayName);

			// Copy room invitation to clipboard
			const inviteUrl = `vscode://octate/collaboration/room/${room.id}`;
			await vscode.env.clipboard.writeText(inviteUrl);

			vscode.window.showInformationMessage(
				`Room created successfully! Invitation link copied to clipboard.`,
				'Share Link'
			).then((selection) => {
				if (selection === 'Share Link') {
					vscode.window.showInformationMessage(inviteUrl);
				}
			});

		} catch (error) {
			logger.error('Failed to create room', error as Error);
			vscode.window.showErrorMessage(`Failed to create room: ${(error as Error).message}`);
		}
	}

	/**
	 * Join an existing room
	 */
	private async joinRoom(roomIdOrUrl: string): Promise<void> {
		try {
			// Extract room ID from URL if needed
			let roomId = roomIdOrUrl;
			if (roomIdOrUrl.includes('vscode://octate/collaboration/room/')) {
				roomId = roomIdOrUrl.split('/').pop() || roomIdOrUrl;
			}

			const displayName = await this.getDisplayName();
			if (!displayName) {
				return;
			}

			await collaborationService.joinRoom(roomId, displayName);

		} catch (error) {
			logger.error('Failed to join room', error as Error);
			vscode.window.showErrorMessage(`Failed to join room: ${(error as Error).message}`);
		}
	}

	/**
	 * Show participants list
	 */
	private async showParticipants(): Promise<void> {
		const room = collaborationService.getCurrentRoom();
		if (!room) {
			vscode.window.showInformationMessage('Not in a collaboration session');
			return;
		}

		const participants = room.participants.map(p => ({
			label: p.displayName,
			description: p.isOwner ? 'Owner' : 'Participant',
			detail: `Status: ${p.status}`,
		}));

		await vscode.window.showQuickPick(participants, {
			placeHolder: `Participants in ${room.name}`,
		});
	}

	/**
	 * Get user display name
	 */
	private async getDisplayName(): Promise<string | undefined> {
		const saved = this.context.globalState.get<string>('collaboration.displayName');

		const displayName = await vscode.window.showInputBox({
			prompt: 'Enter your display name for collaboration',
			placeHolder: 'Your Name',
			value: saved || '',
		});

		if (displayName) {
			const sanitized = sanitizeDisplayName(displayName);
			await this.context.globalState.update('collaboration.displayName', sanitized);
			return sanitized;
		}

		return undefined;
	}

	/**
	 * Handle document changes
	 */
	private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
		if (!this.isCollaborating) {
			return;
		}

		const document = collaborationService.getCurrentDocument();
		if (!document || document.filePath !== event.document.fileName) {
			return;
		}

		// Apply changes using collaboration service
		for (const change of event.contentChanges) {
			const startLine = change.range.start.line;
			const startCharacter = change.range.start.character;

			collaborationService.applyTextEdit(
				document.id,
				change.text, // old text (what was replaced)
				change.text, // new text
				startLine,
				startCharacter
			);
		}
	}

	/**
	 * Handle selection changes
	 */
	private handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
		if (!this.isCollaborating) {
			return;
		}

		const selection = event.selections[0];
		if (!selection) {
			return;
		}

		const cursor = {
			line: selection.active.line,
			character: selection.active.character,
		};

		const selectionRange = selection.isEmpty ? undefined : {
			start: { line: selection.start.line, character: selection.start.character },
			end: { line: selection.end.line, character: selection.end.character },
		};

		collaborationService.updateCursor(cursor.line, cursor.character, selectionRange);
	}

	/**
	 * Handle active editor changes
	 */
	private async handleActiveEditorChange(editor: vscode.TextEditor): Promise<void> {
		if (!this.isCollaborating) {
			return;
		}

		try {
			const document = editor.document;
			const filePath = document.fileName;
			const content = document.getText();
			const language = getLanguageFromFilePath(filePath);

			await collaborationService.openDocument(filePath, content, language);

		} catch (error) {
			logger.error('Failed to handle active editor change', error as Error);
		}
	}

	/**
	 * Apply remote operation to local editor
	 */
	private applyRemoteOperation(operation: any): void {
		// This would integrate with VS Code's WorkspaceEdit API
		// For now, we just log the operation
		logger.debug('Applying remote operation', { operationId: operation.id });
	}

	/**
	 * Update cursor decorations in the editor
	 */
	private updateCursorDecorations(): void {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const cursorDecorations: vscode.DecorationOptions[] = [];
		const selectionDecorations: vscode.DecorationOptions[] = [];

		for (const cursor of this.participantCursors.values()) {
			// Cursor decoration
			const cursorRange = new vscode.Range(
				cursor.position.line,
				cursor.position.character,
				cursor.position.line,
				cursor.position.character + 1
			);

			cursorDecorations.push({
				range: cursorRange,
				hoverMessage: `${cursor.displayName}'s cursor`,
			});

			// Selection decoration
			if (cursor.selection) {
				const selectionRange = new vscode.Range(
					cursor.selection.start.line,
					cursor.selection.start.character,
					cursor.selection.end.line,
					cursor.selection.end.character
				);

				selectionDecorations.push({
					range: selectionRange,
					hoverMessage: `${cursor.displayName}'s selection`,
				});
			}
		}

		editor.setDecorations(this.cursorsDecorationType, cursorDecorations);
		editor.setDecorations(this.selectionsDecorationType, selectionDecorations);
	}

	/**
	 * Update status bar
	 */
	private updateStatusBar(text: string, tooltip: string): void {
		this.statusBarItem.text = text;
		this.statusBarItem.tooltip = tooltip;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.statusBarItem.dispose();
		this.diagnosticCollection.dispose();
		this.cursorsDecorationType.dispose();
		this.selectionsDecorationType.dispose();
		collaborationService.dispose();

		logger.info('CollaborationExtension disposed');
	}
}

/**
 * Activate the collaboration extension
 */
export function activate(context: vscode.ExtensionContext): void {
	const collaborationExtension = new CollaborationExtension(context);
	context.subscriptions.push(collaborationExtension);

	logger.info('Collaboration extension activated');
}

/**
 * Deactivate the collaboration extension
 */
export function deactivate(): void {
	logger.info('Collaboration extension deactivated');
}
