/**
 * Configuration management for VS Code collaboration extension
 * Handles extension settings, user preferences, and environment configuration
 */

import * as vscode from 'vscode';
import { logger } from './utils';

export interface CollaborationConfig {
	// Connection settings
	backendUrl: string;
	socketUrl: string;
	apiKey?: string;

	// User preferences
	displayName: string;
	defaultColor: string;
	enableNotifications: boolean;
	enablePresenceIndicators: boolean;
	enableAutoSync: boolean;

	// Performance settings
	syncInterval: number;
	maxParticipants: number;
	conflictResolutionStrategy: 'server-wins' | 'client-wins' | 'merge' | 'manual';

	// UI settings
	showParticipantList: boolean;
	showSyncStatus: boolean;
	cursorAnimations: boolean;
	presenceTimeout: number;

	// Development settings
	debugMode: boolean;
	logLevel: 'error' | 'warn' | 'info' | 'debug';
}

export class ConfigurationManager {
	private static instance: ConfigurationManager;
	private config: CollaborationConfig;
	private readonly configSection = 'octate.collaboration';

	private constructor() {
		this.config = this.loadConfiguration();
		this.setupConfigurationWatcher();
	}

	public static getInstance(): ConfigurationManager {
		if (!ConfigurationManager.instance) {
			ConfigurationManager.instance = new ConfigurationManager();
		}
		return ConfigurationManager.instance;
	}

	/**
	 * Get current configuration
	 */
	public getConfig(): CollaborationConfig {
		return { ...this.config };
	}

	/**
	 * Get specific configuration value
	 */
	public get<K extends keyof CollaborationConfig>(key: K): CollaborationConfig[K] {
		return this.config[key];
	}

	/**
	 * Update configuration value
	 */
	public async set<K extends keyof CollaborationConfig>(
		key: K,
		value: CollaborationConfig[K]
	): Promise<void> {
		try {
			const configuration = vscode.workspace.getConfiguration(this.configSection);
			await configuration.update(key, value, vscode.ConfigurationTarget.Global);

			// Update local config
			this.config[key] = value;

			logger.info('Configuration updated', { key, value });
		} catch (error) {
			logger.error('Failed to update configuration', error as Error, { key, value });
			throw error;
		}
	}

	/**
	 * Reset configuration to defaults
	 */
	public async resetToDefaults(): Promise<void> {
		const defaultConfig = this.getDefaultConfiguration();
		const configuration = vscode.workspace.getConfiguration(this.configSection);

		for (const [key, value] of Object.entries(defaultConfig)) {
			await configuration.update(key, value, vscode.ConfigurationTarget.Global);
		}

		this.config = defaultConfig;
		logger.info('Configuration reset to defaults');
	}

	/**
	 * Validate configuration
	 */
	public validateConfiguration(): { isValid: boolean; errors: string[] } {
		const errors: string[] = [];

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
		} catch {
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
	public getEnvironmentConfig(): Partial<CollaborationConfig> {
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
	private loadConfiguration(): CollaborationConfig {
		const configuration = vscode.workspace.getConfiguration(this.configSection);
		const defaultConfig = this.getDefaultConfiguration();
		const environmentConfig = this.getEnvironmentConfig();

		// Merge default, environment, and user configuration
		const config: CollaborationConfig = {
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

		logger.info('Configuration loaded', { config: this.sanitizeConfigForLogging(config) });
		return config;
	}

	/**
	 * Get default configuration
	 */
	private getDefaultConfiguration(): CollaborationConfig {
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
	private generateDefaultDisplayName(): string {
		// Try to get user name from Git config
		try {
			const gitConfig = vscode.workspace.getConfiguration('git');
			const userName = gitConfig.get<string>('defaultUserName');
			if (userName) {
				return userName;
			}
		} catch {
			// Ignore errors
		}

		// Fallback to OS username or anonymous
		return process.env.USERNAME || process.env.USER || 'Anonymous User';
	}

	/**
	 * Setup configuration change watcher
	 */
	private setupConfigurationWatcher(): void {
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(this.configSection)) {
				const oldConfig = { ...this.config };
				this.config = this.loadConfiguration();

				logger.info('Configuration changed', {
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
	private onConfigurationChanged(
		oldConfig: CollaborationConfig,
		newConfig: CollaborationConfig
	): void {
		// Check for critical changes that require reconnection
		const criticalChanges = [
			'backendUrl',
			'socketUrl',
			'apiKey'
		];

		const requiresReconnection = criticalChanges.some(
			key => oldConfig[key as keyof CollaborationConfig] !== newConfig[key as keyof CollaborationConfig]
		);

		if (requiresReconnection) {
			vscode.window.showInformationMessage(
				'Collaboration settings changed. Restart VS Code or reconnect to apply changes.',
				'Reconnect'
			).then(selection => {
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
	private sanitizeConfigForLogging(config: CollaborationConfig): Partial<CollaborationConfig> {
		const sanitized = { ...config };
		if (sanitized.apiKey) {
			sanitized.apiKey = '***';
		}
		return sanitized;
	}

	/**
	 * Export configuration for backup
	 */
	public exportConfiguration(): string {
		const exportConfig = this.sanitizeConfigForLogging(this.config);
		return JSON.stringify(exportConfig, null, 2);
	}

	/**
	 * Import configuration from backup
	 */
	public async importConfiguration(configJson: string): Promise<void> {
		try {
			const importedConfig = JSON.parse(configJson) as Partial<CollaborationConfig>;
			const configuration = vscode.workspace.getConfiguration(this.configSection);

			for (const [key, value] of Object.entries(importedConfig)) {
				if (key !== 'apiKey') { // Skip sensitive data
					await configuration.update(key, value, vscode.ConfigurationTarget.Global);
				}
			}

			this.config = this.loadConfiguration();
			logger.info('Configuration imported successfully');

			vscode.window.showInformationMessage('Configuration imported successfully');
		} catch (error) {
			logger.error('Failed to import configuration', error as Error);
			vscode.window.showErrorMessage(`Failed to import configuration: ${(error as Error).message}`);
			throw error;
		}
	}

	/**
	 * Show configuration UI
	 */
	public async showConfigurationUI(): Promise<void> {
		const items = [
			{
				label: '$(person) Display Name',
				description: this.config.displayName,
				key: 'displayName' as const,
				type: 'string' as const
			},
			{
				label: '$(server) Backend URL',
				description: this.config.backendUrl,
				key: 'backendUrl' as const,
				type: 'string' as const
			},
			{
				label: '$(symbol-color) Default Color',
				description: this.config.defaultColor,
				key: 'defaultColor' as const,
				type: 'string' as const
			},
			{
				label: '$(bell) Enable Notifications',
				description: this.config.enableNotifications ? 'Enabled' : 'Disabled',
				key: 'enableNotifications' as const,
				type: 'boolean' as const
			},
			{
				label: '$(eye) Presence Indicators',
				description: this.config.enablePresenceIndicators ? 'Enabled' : 'Disabled',
				key: 'enablePresenceIndicators' as const,
				type: 'boolean' as const
			},
			{
				label: '$(sync) Auto Sync',
				description: this.config.enableAutoSync ? 'Enabled' : 'Disabled',
				key: 'enableAutoSync' as const,
				type: 'boolean' as const
			},
			{
				label: '$(clock) Sync Interval',
				description: `${this.config.syncInterval}ms`,
				key: 'syncInterval' as const,
				type: 'number' as const
			},
			{
				label: '$(merge) Conflict Resolution',
				description: this.config.conflictResolutionStrategy,
				key: 'conflictResolutionStrategy' as const,
				type: 'enum' as const
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
	private async showSettingEditor(
		key: keyof CollaborationConfig,
		type: 'string' | 'number' | 'boolean' | 'enum'
	): Promise<void> {
		switch (type) {
			case 'string':
				const stringValue = await vscode.window.showInputBox({
					prompt: `Enter new value for ${key}`,
					value: String(this.config[key]),
					validateInput: (value) => {
						if (!value) return 'Value cannot be empty';
						if (key === 'backendUrl' || key === 'socketUrl') {
							try {
								new URL(value);
							} catch {
								return 'Must be a valid URL';
							}
						}
						return null;
					}
				});
				if (stringValue !== undefined) {
					await this.set(key, stringValue as CollaborationConfig[typeof key]);
				}
				break;

			case 'number':
				const numberValue = await vscode.window.showInputBox({
					prompt: `Enter new value for ${key}`,
					value: String(this.config[key]),
					validateInput: (value) => {
						const num = parseInt(value);
						if (isNaN(num) || num <= 0) return 'Must be a positive number';
						return null;
					}
				});
				if (numberValue !== undefined) {
					await this.set(key, parseInt(numberValue) as CollaborationConfig[typeof key]);
				}
				break;

			case 'boolean':
				const booleanValue = await vscode.window.showQuickPick(
					['true', 'false'],
					{ placeHolder: `Select value for ${key}` }
				);
				if (booleanValue !== undefined) {
					await this.set(key, (booleanValue === 'true') as CollaborationConfig[typeof key]);
				}
				break;

			case 'enum':
				if (key === 'conflictResolutionStrategy') {
					const enumValue = await vscode.window.showQuickPick(
						['server-wins', 'client-wins', 'merge', 'manual'],
						{ placeHolder: 'Select conflict resolution strategy' }
					);
					if (enumValue !== undefined) {
						await this.set(key, enumValue as CollaborationConfig[typeof key]);
					}
				}
				break;
		}
	}
}

// Export singleton instance
export const configManager = ConfigurationManager.getInstance();
