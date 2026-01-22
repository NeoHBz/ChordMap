/**
 * Settings Manager Module
 * 
 * Manages extension configuration:
 * - Reads settings from workspace configuration
 * - Provides type-safe access to settings
 * - Listens for configuration changes
 * - Applies filters based on settings
 */

import * as vscode from 'vscode';
import { ChordMapConfig, ParsedKeybinding } from './types';

export class SettingsManager {
  private static readonly CONFIG_SECTION = 'chordMap';
  private changeListeners: Set<(config: ChordMapConfig) => void> = new Set();
  private disposables: vscode.Disposable[] = [];
  
  constructor() {
    // Listen for configuration changes
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(SettingsManager.CONFIG_SECTION)) {
          this.notifyListeners();
        }
      })
    );
  }
  
  /**
   * Get current configuration
   */
  getConfig(): ChordMapConfig {
    const config = vscode.workspace.getConfiguration(SettingsManager.CONFIG_SECTION);
    
    return {
      autoSync: config.get<boolean>('autoSync', true),
      enableFileWatcher: config.get<boolean>('enableFileWatcher', true),
      showDisabledBindings: config.get<boolean>('showDisabledBindings', true),
      showWhenClauses: config.get<boolean>('showWhenClauses', true),
      showCommands: config.get<boolean>('showCommands', true),
      showCategories: config.get<boolean>('showCategories', true),
      categoryDerivationMethod: config.get<'simple' | 'metadata' | 'off'>('categoryDerivationMethod', 'simple'),
      showSyncMetadata: config.get<boolean>('showSyncMetadata', true),
      compactView: config.get<boolean>('compactView', false),
      viewMode: config.get<'tree' | 'list' | 'blocks'>('viewMode', 'tree'),
      showCommandTitle: config.get<boolean>('showCommandTitle', true),
      autoExpandOnSearch: config.get<boolean>('autoExpandOnSearch', true)
    };
  }
  
  /**
   * Update a configuration value
   */
  async updateConfig<K extends keyof ChordMapConfig>(
    key: K,
    value: ChordMapConfig[K],
    global: boolean = true
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(SettingsManager.CONFIG_SECTION);
    await config.update(key, value, global);
  }
  
  /**
   * Register a listener for configuration changes
   */
  onConfigChange(listener: (config: ChordMapConfig) => void): vscode.Disposable {
    this.changeListeners.add(listener);
    
    return new vscode.Disposable(() => {
      this.changeListeners.delete(listener);
    });
  }
  
  /**
   * Notify all listeners of configuration change
   */
  private notifyListeners(): void {
    const config = this.getConfig();
    
    for (const listener of this.changeListeners) {
      try {
        listener(config);
      } catch (error) {
        console.error('Error in config change listener:', error);
      }
    }
  }
  
  /**
   * Apply filters to bindings based on current settings
   */
  applyFilters(bindings: ParsedKeybinding[]): ParsedKeybinding[] {
    const config = this.getConfig();
    let filtered = [...bindings];
    
    // Filter disabled bindings
    if (!config.showDisabledBindings) {
      filtered = filtered.filter(b => !b.disabled);
    }
    
    return filtered;
  }
  
  /**
   * Check if categories should be shown
   */
  shouldShowCategories(): boolean {
    const config = this.getConfig();
    return config.showCategories && config.categoryDerivationMethod !== 'off';
  }
  
  /**
   * Check if when clauses should be shown
   */
  shouldShowWhenClauses(): boolean {
    return this.getConfig().showWhenClauses;
  }
  
  /**
   * Check if command IDs should be shown
   */
  shouldShowCommands(): boolean {
    return this.getConfig().showCommands;
  }
  
  /**
   * Check if compact view is enabled
   */
  isCompactView(): boolean {
    return this.getConfig().compactView;
  }
  
  /**
   * Get category derivation method
   */
  getCategoryDerivationMethod(): 'simple' | 'metadata' | 'off' {
    return this.getConfig().categoryDerivationMethod;
  }
  
  /**
   * Open settings page for ChordMap
   */
  openSettings(): void {
    vscode.commands.executeCommand('workbench.action.openSettings', '@ext:neohbz.chordmap');
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.changeListeners.clear();
  }
}
