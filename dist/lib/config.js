"use strict";
/**
 * Configuration management for VS Code collaboration extension
 * Handles extension settings, user preferences, and environment configuration
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
exports.configManager = exports.ConfigurationManager = void 0;
const vscode = __importStar(require("vscode"));
const utils_1 = require("./utils");
class ConfigurationManager {
    constructor() {
        this.configSection = 'octate.collaboration';
        this.config = this.loadConfiguration();
        this.setupConfigurationWatcher();
    }
    static getInstance() {
        if (!ConfigurationManager.instance) {
            ConfigurationManager.instance = new ConfigurationManager();
        }
        return ConfigurationManager.instance;
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Get specific configuration value
     */
    get(key) {
        return this.config[key];
    }
    /**
     * Update configuration value
     */
    async set(key, value) {
        try {
            const configuration = vscode.workspace.getConfiguration(this.configSection);
            await configuration.update(key, value, vscode.ConfigurationTarget.Global);
            // Update local config
            this.config[key] = value;
            utils_1.logger.info('Configuration updated', { key, value });
        }
        catch (error) {
            utils_1.logger.error('Failed to update configuration', error, { key, value });
            throw error;
        }
    }
    /**
     * Reset configuration to defaults
     */
    async resetToDefaults() {
        const defaultConfig = this.getDefaultConfiguration();
        const configuration = vscode.workspace.getConfiguration(this.configSection);
        for (const [key, value] of Object.entries(defaultConfig)) {
            await configuration.update(key, value, vscode.ConfigurationTarget.Global);
        }
        this.config = defaultConfig;
        utils_1.logger.info('Configuration reset to defaults');
    }
    /**
     * Validate configuration
     */
    validateConfiguration() {
        const errors = [];
        // Validate required fields
        if (!this.config.backendUrl) {
            errors.push('Backend URL is required');
        }
        if (!this.config.displayName) {
            errors.push('Display name is required');
        }
        // Validate URL format
        try {
            new URL(this.config.backendUrl);
        }
        catch {
            errors.push('Backend URL must be a valid URL');
        }
        // Validate numeric values
        if (this.config.syncInterval < 1000) {
            errors.push('Sync interval must be at least 1000ms');
        }
        if (this.config.maxParticipants < 1 || this.config.maxParticipants > 50) {
            errors.push('Max participants must be between 1 and 50');
        }
        if (this.config.presenceTimeout < 5000) {
            errors.push('Presence timeout must be at least 5000ms');
        }
        // Validate color format
        if (!/^#[0-9A-F]{6}$/i.test(this.config.defaultColor)) {
            errors.push('Default color must be a valid hex color');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    /**
     * Get environment-specific configuration
     */
    getEnvironmentConfig() {
        const isDevelopment = process.env.NODE_ENV === 'development';
        return {
            debugMode: isDevelopment,
            logLevel: isDevelopment ? 'debug' : 'info',
            backendUrl: isDevelopment
                ? 'http://localhost:3000'
                : 'https://your-vercel-app.vercel.app',
            socketUrl: isDevelopment
                ? 'http://localhost:3001'
                : 'https://your-socket-server.vercel.app'
        };
    }
    /**
     * Load configuration from VS Code settings
     */
    loadConfiguration() {
        const configuration = vscode.workspace.getConfiguration(this.configSection);
        const defaultConfig = this.getDefaultConfiguration();
        const environmentConfig = this.getEnvironmentConfig();
        // Merge default, environment, and user configuration
        const config = {
            ...defaultConfig,
            ...environmentConfig,
            // Override with user settings
            backendUrl: configuration.get('backendUrl', defaultConfig.backendUrl),
            socketUrl: configuration.get('socketUrl', defaultConfig.socketUrl),
            apiKey: configuration.get('apiKey'),
            displayName: configuration.get('displayName', this.generateDefaultDisplayName()),
            defaultColor: configuration.get('defaultColor', defaultConfig.defaultColor),
            enableNotifications: configuration.get('enableNotifications', defaultConfig.enableNotifications),
            enablePresenceIndicators: configuration.get('enablePresenceIndicators', defaultConfig.enablePresenceIndicators),
            enableAutoSync: configuration.get('enableAutoSync', defaultConfig.enableAutoSync),
            syncInterval: configuration.get('syncInterval', defaultConfig.syncInterval),
            maxParticipants: configuration.get('maxParticipants', defaultConfig.maxParticipants),
            conflictResolutionStrategy: configuration.get('conflictResolutionStrategy', defaultConfig.conflictResolutionStrategy),
            showParticipantList: configuration.get('showParticipantList', defaultConfig.showParticipantList),
            showSyncStatus: configuration.get('showSyncStatus', defaultConfig.showSyncStatus),
            cursorAnimations: configuration.get('cursorAnimations', defaultConfig.cursorAnimations),
            presenceTimeout: configuration.get('presenceTimeout', defaultConfig.presenceTimeout),
            debugMode: configuration.get('debugMode', environmentConfig.debugMode || defaultConfig.debugMode),
            logLevel: configuration.get('logLevel', environmentConfig.logLevel || defaultConfig.logLevel),
        };
        utils_1.logger.info('Configuration loaded', { config: this.sanitizeConfigForLogging(config) });
        return config;
    }
    /**
     * Get default configuration
     */
    getDefaultConfiguration() {
        return {
            backendUrl: 'https://your-vercel-app.vercel.app',
            socketUrl: 'https://your-socket-server.vercel.app',
            displayName: this.generateDefaultDisplayName(),
            defaultColor: '#007ACC',
            enableNotifications: true,
            enablePresenceIndicators: true,
            enableAutoSync: true,
            syncInterval: 5000,
            maxParticipants: 10,
            conflictResolutionStrategy: 'server-wins',
            showParticipantList: true,
            showSyncStatus: true,
            cursorAnimations: true,
            presenceTimeout: 30000,
            debugMode: false,
            logLevel: 'info',
        };
    }
    /**
     * Generate default display name
     */
    generateDefaultDisplayName() {
        // Try to get user name from Git config
        try {
            const gitConfig = vscode.workspace.getConfiguration('git');
            const userName = gitConfig.get('defaultUserName');
            if (userName) {
                return userName;
            }
        }
        catch {
            // Ignore errors
        }
        // Fallback to OS username or anonymous
        return process.env.USERNAME || process.env.USER || 'Anonymous User';
    }
    /**
     * Setup configuration change watcher
     */
    setupConfigurationWatcher() {
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(this.configSection)) {
                const oldConfig = { ...this.config };
                this.config = this.loadConfiguration();
                utils_1.logger.info('Configuration changed', {
                    oldConfig: this.sanitizeConfigForLogging(oldConfig),
                    newConfig: this.sanitizeConfigForLogging(this.config)
                });
                // Emit configuration change event
                this.onConfigurationChanged(oldConfig, this.config);
            }
        });
    }
    /**
     * Handle configuration changes
     */
    onConfigurationChanged(oldConfig, newConfig) {
        // Check for critical changes that require reconnection
        const criticalChanges = [
            'backendUrl',
            'socketUrl',
            'apiKey'
        ];
        const requiresReconnection = criticalChanges.some(key => oldConfig[key] !== newConfig[key]);
        if (requiresReconnection) {
            vscode.window.showInformationMessage('Collaboration settings changed. Restart VS Code or reconnect to apply changes.', 'Reconnect').then(selection => {
                if (selection === 'Reconnect') {
                    // Trigger reconnection
                    vscode.commands.executeCommand('octate.reconnect');
                }
            });
        }
        // Handle display name changes
        if (oldConfig.displayName !== newConfig.displayName) {
            vscode.commands.executeCommand('octate.updateDisplayName', newConfig.displayName);
        }
        // Handle UI preference changes
        if (oldConfig.enablePresenceIndicators !== newConfig.enablePresenceIndicators) {
            vscode.commands.executeCommand('octate.togglePresenceIndicators');
        }
    }
    /**
     * Sanitize configuration for logging (remove sensitive data)
     */
    sanitizeConfigForLogging(config) {
        const sanitized = { ...config };
        if (sanitized.apiKey) {
            sanitized.apiKey = '***';
        }
        return sanitized;
    }
    /**
     * Export configuration for backup
     */
    exportConfiguration() {
        const exportConfig = this.sanitizeConfigForLogging(this.config);
        return JSON.stringify(exportConfig, null, 2);
    }
    /**
     * Import configuration from backup
     */
    async importConfiguration(configJson) {
        try {
            const importedConfig = JSON.parse(configJson);
            const configuration = vscode.workspace.getConfiguration(this.configSection);
            for (const [key, value] of Object.entries(importedConfig)) {
                if (key !== 'apiKey') { // Skip sensitive data
                    await configuration.update(key, value, vscode.ConfigurationTarget.Global);
                }
            }
            this.config = this.loadConfiguration();
            utils_1.logger.info('Configuration imported successfully');
            vscode.window.showInformationMessage('Configuration imported successfully');
        }
        catch (error) {
            utils_1.logger.error('Failed to import configuration', error);
            vscode.window.showErrorMessage(`Failed to import configuration: ${error.message}`);
            throw error;
        }
    }
    /**
     * Show configuration UI
     */
    async showConfigurationUI() {
        const items = [
            {
                label: '$(person) Display Name',
                description: this.config.displayName,
                key: 'displayName',
                type: 'string'
            },
            {
                label: '$(server) Backend URL',
                description: this.config.backendUrl,
                key: 'backendUrl',
                type: 'string'
            },
            {
                label: '$(symbol-color) Default Color',
                description: this.config.defaultColor,
                key: 'defaultColor',
                type: 'string'
            },
            {
                label: '$(bell) Enable Notifications',
                description: this.config.enableNotifications ? 'Enabled' : 'Disabled',
                key: 'enableNotifications',
                type: 'boolean'
            },
            {
                label: '$(eye) Presence Indicators',
                description: this.config.enablePresenceIndicators ? 'Enabled' : 'Disabled',
                key: 'enablePresenceIndicators',
                type: 'boolean'
            },
            {
                label: '$(sync) Auto Sync',
                description: this.config.enableAutoSync ? 'Enabled' : 'Disabled',
                key: 'enableAutoSync',
                type: 'boolean'
            },
            {
                label: '$(clock) Sync Interval',
                description: `${this.config.syncInterval}ms`,
                key: 'syncInterval',
                type: 'number'
            },
            {
                label: '$(merge) Conflict Resolution',
                description: this.config.conflictResolutionStrategy,
                key: 'conflictResolutionStrategy',
                type: 'enum'
            }
        ];
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select setting to configure',
            matchOnDescription: true
        });
        if (selected) {
            await this.showSettingEditor(selected.key, selected.type);
        }
    }
    /**
     * Show setting editor for specific configuration
     */
    async showSettingEditor(key, type) {
        switch (type) {
            case 'string':
                const stringValue = await vscode.window.showInputBox({
                    prompt: `Enter new value for ${key}`,
                    value: String(this.config[key]),
                    validateInput: (value) => {
                        if (!value)
                            return 'Value cannot be empty';
                        if (key === 'backendUrl' || key === 'socketUrl') {
                            try {
                                new URL(value);
                            }
                            catch {
                                return 'Must be a valid URL';
                            }
                        }
                        return null;
                    }
                });
                if (stringValue !== undefined) {
                    await this.set(key, stringValue);
                }
                break;
            case 'number':
                const numberValue = await vscode.window.showInputBox({
                    prompt: `Enter new value for ${key}`,
                    value: String(this.config[key]),
                    validateInput: (value) => {
                        const num = parseInt(value);
                        if (isNaN(num) || num <= 0)
                            return 'Must be a positive number';
                        return null;
                    }
                });
                if (numberValue !== undefined) {
                    await this.set(key, parseInt(numberValue));
                }
                break;
            case 'boolean':
                const booleanValue = await vscode.window.showQuickPick(['true', 'false'], { placeHolder: `Select value for ${key}` });
                if (booleanValue !== undefined) {
                    await this.set(key, (booleanValue === 'true'));
                }
                break;
            case 'enum':
                if (key === 'conflictResolutionStrategy') {
                    const enumValue = await vscode.window.showQuickPick(['server-wins', 'client-wins', 'merge', 'manual'], { placeHolder: 'Select conflict resolution strategy' });
                    if (enumValue !== undefined) {
                        await this.set(key, enumValue);
                    }
                }
                break;
        }
    }
}
exports.ConfigurationManager = ConfigurationManager;
// Export singleton instance
exports.configManager = ConfigurationManager.getInstance();
//# sourceMappingURL=config.js.map