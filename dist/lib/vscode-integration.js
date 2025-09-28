"use strict";
/**
 * VS Code extension integration for the collaboration backend
 * This file integrates the collaboration service with VS Code's extension API
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
exports.CollaborationExtension = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const collaboration_service_1 = require("./collaboration-service");
const utils_1 = require("./utils");
class CollaborationExtension {
    constructor(context) {
        this.participantCursors = new Map();
        this.isCollaborating = false;
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
        utils_1.logger.info('CollaborationExtension initialized');
    }
    /**
     * Setup collaboration service event listeners
     */
    setupCollaborationService() {
        // Connection events
        collaboration_service_1.collaborationService.on('connected', () => {
            this.updateStatusBar('$(check) Connected', 'Connected to collaboration server');
            vscode.window.showInformationMessage('Connected to collaboration server');
        });
        collaboration_service_1.collaborationService.on('disconnected', () => {
            this.updateStatusBar('$(x) Disconnected', 'Disconnected from collaboration server');
            vscode.window.showWarningMessage('Disconnected from collaboration server');
        });
        collaboration_service_1.collaborationService.on('error', (error) => {
            this.updateStatusBar('$(alert) Error', `Collaboration error: ${error.message}`);
            vscode.window.showErrorMessage(`Collaboration error: ${error.message}`);
        });
        collaboration_service_1.collaborationService.on('reconnecting', (attemptNumber) => {
            this.updateStatusBar('$(sync~spin) Reconnecting', `Reconnecting... (attempt ${attemptNumber})`);
        });
        // Room events
        collaboration_service_1.collaborationService.on('room-joined', (room) => {
            this.isCollaborating = true;
            this.updateStatusBar(`$(people) ${room.currentParticipants}/${room.maxParticipants}`, `Collaborating in room: ${room.name}`);
            vscode.window.showInformationMessage(`Joined collaboration room: ${room.name}`);
        });
        collaboration_service_1.collaborationService.on('room-left', () => {
            this.isCollaborating = false;
            this.participantCursors.clear();
            this.updateCursorDecorations();
            this.updateStatusBar('$(link) Start Collaboration', 'Start collaboration session');
            vscode.window.showInformationMessage('Left collaboration session');
        });
        collaboration_service_1.collaborationService.on('participant-joined', (participant) => {
            vscode.window.showInformationMessage(`${participant.displayName} joined the session`);
        });
        collaboration_service_1.collaborationService.on('participant-left', (participant) => {
            this.participantCursors.delete(participant.id);
            this.updateCursorDecorations();
            vscode.window.showInformationMessage(`${participant.displayName} left the session`);
        });
        // Document events
        collaboration_service_1.collaborationService.on('operation-applied', (operation) => {
            // Handle incoming text changes
            this.applyRemoteOperation(operation);
        });
        collaboration_service_1.collaborationService.on('cursor-updated', (cursor) => {
            this.participantCursors.set(cursor.participantId, cursor);
            this.updateCursorDecorations();
        });
        collaboration_service_1.collaborationService.on('selection-updated', (selection) => {
            this.participantCursors.set(selection.participantId, selection);
            this.updateCursorDecorations();
        });
    }
    /**
     * Register VS Code commands
     */
    registerCommands() {
        // Start collaboration command
        const startCollabCommand = vscode.commands.registerCommand('octate.startCollaboration', async () => {
            try {
                if (this.isCollaborating) {
                    await this.stopCollaboration();
                }
                else {
                    await this.startCollaboration();
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Failed to start collaboration: ${error.message}`);
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
        this.context.subscriptions.push(startCollabCommand, joinRoomCommand, createRoomCommand, leaveRoomCommand, showParticipantsCommand);
    }
    /**
     * Register VS Code event listeners
     */
    registerEventListeners() {
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
        this.context.subscriptions.push(onDocumentChange, onSelectionChange, onActiveEditorChange);
    }
    /**
     * Start collaboration session
     */
    async startCollaboration() {
        try {
            // Initialize collaboration service
            await collaboration_service_1.collaborationService.initialize();
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
            }
            else {
                const roomId = await vscode.window.showInputBox({
                    prompt: 'Enter room ID or invitation link',
                    placeHolder: 'Room ID or invitation link',
                });
                if (roomId) {
                    await this.joinRoom(roomId);
                }
            }
        }
        catch (error) {
            utils_1.logger.error('Failed to start collaboration', error);
            throw error;
        }
    }
    /**
     * Stop collaboration session
     */
    async stopCollaboration() {
        try {
            await collaboration_service_1.collaborationService.leaveRoom();
            this.isCollaborating = false;
            this.participantCursors.clear();
            this.updateCursorDecorations();
            this.updateStatusBar('$(link) Start Collaboration', 'Start collaboration session');
        }
        catch (error) {
            utils_1.logger.error('Failed to stop collaboration', error);
        }
    }
    /**
     * Create a new collaboration room
     */
    async createRoom() {
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
            const responseData = await response.json();
            const room = responseData.data;
            // Join the created room
            await collaboration_service_1.collaborationService.joinRoom(room.id, displayName);
            // Copy room invitation to clipboard
            const inviteUrl = `vscode://octate/collaboration/room/${room.id}`;
            await vscode.env.clipboard.writeText(inviteUrl);
            vscode.window.showInformationMessage(`Room created successfully! Invitation link copied to clipboard.`, 'Share Link').then((selection) => {
                if (selection === 'Share Link') {
                    vscode.window.showInformationMessage(inviteUrl);
                }
            });
        }
        catch (error) {
            utils_1.logger.error('Failed to create room', error);
            vscode.window.showErrorMessage(`Failed to create room: ${error.message}`);
        }
    }
    /**
     * Join an existing room
     */
    async joinRoom(roomIdOrUrl) {
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
            await collaboration_service_1.collaborationService.joinRoom(roomId, displayName);
        }
        catch (error) {
            utils_1.logger.error('Failed to join room', error);
            vscode.window.showErrorMessage(`Failed to join room: ${error.message}`);
        }
    }
    /**
     * Show participants list
     */
    async showParticipants() {
        const room = collaboration_service_1.collaborationService.getCurrentRoom();
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
    async getDisplayName() {
        const saved = this.context.globalState.get('collaboration.displayName');
        const displayName = await vscode.window.showInputBox({
            prompt: 'Enter your display name for collaboration',
            placeHolder: 'Your Name',
            value: saved || '',
        });
        if (displayName) {
            const sanitized = (0, utils_1.sanitizeDisplayName)(displayName);
            await this.context.globalState.update('collaboration.displayName', sanitized);
            return sanitized;
        }
        return undefined;
    }
    /**
     * Handle document changes
     */
    handleDocumentChange(event) {
        if (!this.isCollaborating) {
            return;
        }
        const document = collaboration_service_1.collaborationService.getCurrentDocument();
        if (!document || document.filePath !== event.document.fileName) {
            return;
        }
        // Apply changes using collaboration service
        for (const change of event.contentChanges) {
            const startLine = change.range.start.line;
            const startCharacter = change.range.start.character;
            collaboration_service_1.collaborationService.applyTextEdit(document.id, change.text, // old text (what was replaced)
            change.text, // new text
            startLine, startCharacter);
        }
    }
    /**
     * Handle selection changes
     */
    handleSelectionChange(event) {
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
        collaboration_service_1.collaborationService.updateCursor(cursor.line, cursor.character, selectionRange);
    }
    /**
     * Handle active editor changes
     */
    async handleActiveEditorChange(editor) {
        if (!this.isCollaborating) {
            return;
        }
        try {
            const document = editor.document;
            const filePath = document.fileName;
            const content = document.getText();
            const language = (0, utils_1.getLanguageFromFilePath)(filePath);
            await collaboration_service_1.collaborationService.openDocument(filePath, content, language);
        }
        catch (error) {
            utils_1.logger.error('Failed to handle active editor change', error);
        }
    }
    /**
     * Apply remote operation to local editor
     */
    applyRemoteOperation(operation) {
        // This would integrate with VS Code's WorkspaceEdit API
        // For now, we just log the operation
        utils_1.logger.debug('Applying remote operation', { operationId: operation.id });
    }
    /**
     * Update cursor decorations in the editor
     */
    updateCursorDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const cursorDecorations = [];
        const selectionDecorations = [];
        for (const cursor of this.participantCursors.values()) {
            // Cursor decoration
            const cursorRange = new vscode.Range(cursor.position.line, cursor.position.character, cursor.position.line, cursor.position.character + 1);
            cursorDecorations.push({
                range: cursorRange,
                hoverMessage: `${cursor.displayName}'s cursor`,
            });
            // Selection decoration
            if (cursor.selection) {
                const selectionRange = new vscode.Range(cursor.selection.start.line, cursor.selection.start.character, cursor.selection.end.line, cursor.selection.end.character);
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
    updateStatusBar(text, tooltip) {
        this.statusBarItem.text = text;
        this.statusBarItem.tooltip = tooltip;
    }
    /**
     * Dispose resources
     */
    dispose() {
        this.statusBarItem.dispose();
        this.diagnosticCollection.dispose();
        this.cursorsDecorationType.dispose();
        this.selectionsDecorationType.dispose();
        collaboration_service_1.collaborationService.dispose();
        utils_1.logger.info('CollaborationExtension disposed');
    }
}
exports.CollaborationExtension = CollaborationExtension;
/**
 * Activate the collaboration extension
 */
function activate(context) {
    const collaborationExtension = new CollaborationExtension(context);
    context.subscriptions.push(collaborationExtension);
    utils_1.logger.info('Collaboration extension activated');
}
/**
 * Deactivate the collaboration extension
 */
function deactivate() {
    utils_1.logger.info('Collaboration extension deactivated');
}
//# sourceMappingURL=vscode-integration.js.map