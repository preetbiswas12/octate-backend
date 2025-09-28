/**
 * Collaboration UI components for VS Code integration
 * Provides participant list, presence indicators, and collaboration status UI
 */
import * as vscode from 'vscode';
import { Participant, Room } from './collaboration-service';
export declare class CollaborationUI {
    private context;
    private participantStatusBar;
    private syncStatusBar;
    private participantTreeProvider;
    private presenceDecorations;
    private conflictDecorations;
    private isUIActive;
    constructor(context: vscode.ExtensionContext);
    /**
     * Setup event listeners for collaboration service
     */
    private setupEventListeners;
    /**
     * Register VS Code commands
     */
    private registerCommands;
    /**
     * Handle room joined event
     */
    private onRoomJoined;
    /**
     * Handle room left event
     */
    private onRoomLeft;
    /**
     * Handle participant joined event
     */
    private onParticipantJoined;
    /**
     * Handle participant left event
     */
    private onParticipantLeft;
    /**
     * Handle participant updated event
     */
    private onParticipantUpdated;
    /**
     * Update participant status in status bar
     */
    private updateParticipantStatus;
    /**
     * Update sync status in status bar
     */
    private updateSyncStatus;
    /**
     * Update connection status
     */
    private updateConnectionStatus;
    /**
     * Create decoration type for a participant
     */
    private createParticipantDecoration;
    /**
     * Remove decoration type for a participant
     */
    private removeParticipantDecoration;
    /**
     * Update cursor decorations for a participant
     */
    private updateCursorDecorations;
    /**
     * Update selection decorations for a participant
     */
    private updateSelectionDecorations;
    /**
     * Show conflict decoration
     */
    private showConflictDecoration;
    /**
     * Show participants list in quick pick
     */
    private showParticipantsList;
    /**
     * Show collaboration panel
     */
    private showCollaborationPanel;
    /**
     * Get HTML content for collaboration panel
     */
    private getCollaborationPanelHTML;
    /**
     * Toggle presence indicators
     */
    private togglePresenceIndicators;
    /**
     * Show sync status panel
     */
    private showSyncStatusPanel;
    /**
     * Force sync current document
     */
    private forceSyncCurrentDocument;
    /**
     * Show conflict resolution panel
     */
    private showConflictResolutionPanel;
    /**
     * Show conflict details
     */
    private showConflictDetails;
    /**
     * Clear all decorations
     */
    private clearAllDecorations;
    /**
     * Get file name from document ID
     */
    private getFileName;
    /**
     * Dispose resources
     */
    dispose(): void;
}
/**
 * Tree data provider for participants
 */
declare class ParticipantTreeProvider implements vscode.TreeDataProvider<ParticipantTreeItem> {
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<void | ParticipantTreeItem | undefined>;
    private room;
    updateRoom(room: Room): void;
    addParticipant(participant: Participant): void;
    removeParticipant(participantId: string): void;
    updateParticipant(participant: Participant): void;
    clear(): void;
    getTreeItem(element: ParticipantTreeItem): vscode.TreeItem;
    getChildren(element?: ParticipantTreeItem): ParticipantTreeItem[];
}
/**
 * Tree item for participants
 */
declare class ParticipantTreeItem extends vscode.TreeItem {
    readonly participant: Participant;
    constructor(participant: Participant);
}
export { ParticipantTreeProvider, ParticipantTreeItem };
//# sourceMappingURL=collaboration-ui.d.ts.map