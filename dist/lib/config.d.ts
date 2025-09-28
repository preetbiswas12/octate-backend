/**
 * Configuration management for VS Code collaboration extension
 * Handles extension settings, user preferences, and environment configuration
 */
export interface CollaborationConfig {
    backendUrl: string;
    socketUrl: string;
    apiKey?: string;
    displayName: string;
    defaultColor: string;
    enableNotifications: boolean;
    enablePresenceIndicators: boolean;
    enableAutoSync: boolean;
    syncInterval: number;
    maxParticipants: number;
    conflictResolutionStrategy: 'server-wins' | 'client-wins' | 'merge' | 'manual';
    showParticipantList: boolean;
    showSyncStatus: boolean;
    cursorAnimations: boolean;
    presenceTimeout: number;
    debugMode: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
}
export declare class ConfigurationManager {
    private static instance;
    private config;
    private readonly configSection;
    private constructor();
    static getInstance(): ConfigurationManager;
    /**
     * Get current configuration
     */
    getConfig(): CollaborationConfig;
    /**
     * Get specific configuration value
     */
    get<K extends keyof CollaborationConfig>(key: K): CollaborationConfig[K];
    /**
     * Update configuration value
     */
    set<K extends keyof CollaborationConfig>(key: K, value: CollaborationConfig[K]): Promise<void>;
    /**
     * Reset configuration to defaults
     */
    resetToDefaults(): Promise<void>;
    /**
     * Validate configuration
     */
    validateConfiguration(): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * Get environment-specific configuration
     */
    getEnvironmentConfig(): Partial<CollaborationConfig>;
    /**
     * Load configuration from VS Code settings
     */
    private loadConfiguration;
    /**
     * Get default configuration
     */
    private getDefaultConfiguration;
    /**
     * Generate default display name
     */
    private generateDefaultDisplayName;
    /**
     * Setup configuration change watcher
     */
    private setupConfigurationWatcher;
    /**
     * Handle configuration changes
     */
    private onConfigurationChanged;
    /**
     * Sanitize configuration for logging (remove sensitive data)
     */
    private sanitizeConfigForLogging;
    /**
     * Export configuration for backup
     */
    exportConfiguration(): string;
    /**
     * Import configuration from backup
     */
    importConfiguration(configJson: string): Promise<void>;
    /**
     * Show configuration UI
     */
    showConfigurationUI(): Promise<void>;
    /**
     * Show setting editor for specific configuration
     */
    private showSettingEditor;
}
export declare const configManager: ConfigurationManager;
//# sourceMappingURL=config.d.ts.map