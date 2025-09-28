/**
 * VS Code extension integration for the collaboration backend
 * This file integrates the collaboration service with VS Code's extension API
 */
import * as vscode from 'vscode';
export declare class CollaborationExtension {
    private context;
    private statusBarItem;
    private diagnosticCollection;
    private cursorsDecorationType;
    private selectionsDecorationType;
    private participantCursors;
    private isCollaborating;
    constructor(context: vscode.ExtensionContext);
    /**
     * Setup collaboration service event listeners
     */
    private setupCollaborationService;
    /**
     * Register VS Code commands
     */
    private registerCommands;
    /**
     * Register VS Code event listeners
     */
    private registerEventListeners;
    /**
     * Start collaboration session
     */
    private startCollaboration;
    /**
     * Stop collaboration session
     */
    private stopCollaboration;
    /**
     * Create a new collaboration room
     */
    private createRoom;
    /**
     * Join an existing room
     */
    private joinRoom;
    /**
     * Show participants list
     */
    private showParticipants;
    /**
     * Get user display name
     */
    private getDisplayName;
    /**
     * Handle document changes
     */
    private handleDocumentChange;
    /**
     * Handle selection changes
     */
    private handleSelectionChange;
    /**
     * Handle active editor changes
     */
    private handleActiveEditorChange;
    /**
     * Apply remote operation to local editor
     */
    private applyRemoteOperation;
    /**
     * Update cursor decorations in the editor
     */
    private updateCursorDecorations;
    /**
     * Update status bar
     */
    private updateStatusBar;
    /**
     * Dispose resources
     */
    dispose(): void;
}
/**
 * Activate the collaboration extension
 */
export declare function activate(context: vscode.ExtensionContext): void;
/**
 * Deactivate the collaboration extension
 */
export declare function deactivate(): void;
//# sourceMappingURL=vscode-integration.d.ts.map