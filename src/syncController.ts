/**
 * Sync Controller Module
 * 
 * Handles syncing keybindings.json with the extension:
 * - Detects editor variant (VS Code, Insiders, Antigravity)
 * - Resolves platform-specific paths
 * - Manages auto-sync with user permission
 * - Handles FileSystemWatcher for changes
 * - Persists sync metadata
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ParsedKeybinding, SyncMetadata } from './types';
import { KeybindingParser } from './parser';

export class SyncController {
  private static readonly STORAGE_KEY_METADATA = 'chordmap.syncMetadata';
  private static readonly STORAGE_KEY_BINDINGS = 'chordmap.bindings';
  private static readonly SCHEMA_VERSION = 1;
  
  private context: vscode.ExtensionContext;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private lastSyncedPath: string | undefined;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  
  /**
   * Initialize sync controller
   * - Check for auto-sync permission
   * - Attempt auto-sync if enabled
   * - Set up file watcher
   */
  async initialize(): Promise<void> {
    const config = vscode.workspace.getConfiguration('chordMap');
    const autoSync = config.get<boolean>('autoSync', true);
    
    if (autoSync) {
      // Check if we've asked for permission before
      const hasAskedPermission = this.context.globalState.get<boolean>('chordmap.hasAskedPermission', false);
      
      if (!hasAskedPermission) {
        await this.requestAutoSyncPermission();
      } else {
        // Permission already granted, try auto-sync
        await this.performAutoSync();
      }
    }
    
    // Set up file watcher if enabled
    await this.setupFileWatcher();
  }
  
  /**
   * Request permission for auto-sync on first launch
   */
  private async requestAutoSyncPermission(): Promise<void> {
    const response = await vscode.window.showInformationMessage(
      'ChordMap can automatically sync your keybindings.json file. Allow automatic synchronization?',
      'Yes',
      'No',
      'Not Now'
    );
    
    if (response === 'Yes') {
      await this.context.globalState.update('chordmap.hasAskedPermission', true);
      await this.performAutoSync();
    } else if (response === 'No') {
      await this.context.globalState.update('chordmap.hasAskedPermission', true);
      // Disable auto-sync
      await vscode.workspace.getConfiguration('chordMap').update('autoSync', false, true);
      vscode.window.showInformationMessage('Auto-sync disabled. You can manually sync using the sync button.');
    }
    // "Not Now" doesn't set the flag, so we'll ask again next time
  }
  
  /**
   * Perform automatic sync
   */
  private async performAutoSync(): Promise<void> {
    try {
      const keybindingsPath = this.getDefaultKeybindingsPath();
      
      if (!keybindingsPath) {
        console.log('Could not determine default keybindings path');
        return;
      }
      
      // Check if file exists
      try {
        await fs.access(keybindingsPath);
      } catch {
        // File doesn't exist, that's okay
        console.log(`Keybindings file not found at ${keybindingsPath}`);
        return;
      }
      
      // Sync without prompting
      await this.syncFromPath(keybindingsPath);
      
    } catch (error) {
      console.error('Auto-sync failed:', error);
      // Don't show error to user for silent auto-sync
    }
  }
  
  /**
   * Manual sync - show file picker
   */
  async syncManually(): Promise<void> {
    const defaultPath = this.getDefaultKeybindingsPath();
    
    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
      filters: {
        'JSON Files': ['json']
      },
      title: 'Select keybindings.json'
    });
    
    if (!fileUri || fileUri.length === 0) {
      return;
    }
    
    const selectedPath = fileUri[0].fsPath;
    
    try {
      await this.syncFromPath(selectedPath);
      vscode.window.showInformationMessage(`Synced ${await this.getBindingCount()} keybindings successfully!`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to sync keybindings: ${error}`);
    }
  }
  
  /**
   * Sync from a specific path
   */
  async syncFromPath(filePath: string): Promise<void> {
    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Parse
    const editorName = this.detectEditorName();
    const bindings = KeybindingParser.parseKeybindingsFile(content, editorName);
    
    // Store bindings
    await this.context.globalState.update(SyncController.STORAGE_KEY_BINDINGS, bindings);
    
    // Store metadata
    const metadata: SyncMetadata = {
      lastSync: new Date().toISOString(),
      editorName,
      filePath,
      bindingCount: bindings.length,
      schemaVersion: SyncController.SCHEMA_VERSION
    };
    
    await this.context.globalState.update(SyncController.STORAGE_KEY_METADATA, metadata);
    
    this.lastSyncedPath = filePath;
    
    // Update file watcher
    await this.setupFileWatcher();
  }
  
  /**
   * Get synced bindings from storage
   */
  async getBindings(): Promise<ParsedKeybinding[]> {
    const bindings = this.context.globalState.get<ParsedKeybinding[]>(SyncController.STORAGE_KEY_BINDINGS);
    return bindings || [];
  }
  
  /**
   * Get sync metadata
   */
  getSyncMetadata(): SyncMetadata | undefined {
    return this.context.globalState.get<SyncMetadata>(SyncController.STORAGE_KEY_METADATA);
  }
  
  /**
   * Get binding count
   */
  async getBindingCount(): Promise<number> {
    const bindings = await this.getBindings();
    return bindings.length;
  }
  
  /**
   * Detect editor name from vscode.env
   */
  private detectEditorName(): string {
    const appName = vscode.env.appName;
    
    if (appName.includes('Insiders')) {
      return 'VS Code Insiders';
    } else if (appName.includes('Antigravity')) {
      return 'Antigravity';
    } else {
      return 'VS Code';
    }
  }
  
  /**
   * Get default keybindings.json path for current editor and platform
   * Auto-detects profiles and checks multiple locations
   */
  getDefaultKeybindingsPath(): string | undefined {
    const platform = os.platform();
    const homeDir = os.homedir();
    const editorName = this.detectEditorName();
    
    let appDataPath: string;
    
    if (platform === 'darwin') {
      // macOS
      appDataPath = path.join(homeDir, 'Library', 'Application Support');
    } else if (platform === 'win32') {
      // Windows
      appDataPath = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    } else {
      // Linux
      appDataPath = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
    }
    
    // Determine editor folder name
    let editorFolder: string;
    if (editorName === 'VS Code Insiders') {
      editorFolder = platform === 'darwin' ? 'Code - Insiders' : 'Code - Insiders';
    } else if (editorName === 'Antigravity') {
      editorFolder = 'Antigravity';
    } else {
      editorFolder = 'Code';
    }
    
    const basePath = path.join(appDataPath, editorFolder, 'User');
    
    // Check multiple possible locations synchronously
    const possiblePaths = [
      // First check for active profile keybindings
      ...this.findProfileKeybindings(basePath),
      // Fall back to default User keybindings
      path.join(basePath, 'keybindings.json')
    ];
    
    // Return first existing path
    for (const testPath of possiblePaths) {
      try {
        // Sync check for immediate return
        require('fs').accessSync(testPath);
        return testPath;
      } catch {
        // Try next path
      }
    }
    
    // Default to standard location even if it doesn't exist yet
    return path.join(basePath, 'keybindings.json');
  }
  
  /**
   * Find profile-specific keybindings paths
   */
  private findProfileKeybindings(userPath: string): string[] {
    const profilesPath = path.join(userPath, 'profiles');
    const paths: string[] = [];
    
    try {
      const fs = require('fs');
      if (fs.existsSync(profilesPath)) {
        const profiles = fs.readdirSync(profilesPath);
        
        // Add all profile keybindings paths
        for (const profile of profiles) {
          const profileKeybindings = path.join(profilesPath, profile, 'keybindings.json');
          if (fs.existsSync(profileKeybindings)) {
            paths.push(profileKeybindings);
          }
        }
      }
    } catch (error) {
      // Ignore errors, will fall back to default
    }
    
    return paths;
  }
  
  /**
   * Set up FileSystemWatcher for keybindings.json
   */
  private async setupFileWatcher(): Promise<void> {
    const config = vscode.workspace.getConfiguration('chordMap');
    const enableFileWatcher = config.get<boolean>('enableFileWatcher', true);
    
    // Dispose existing watcher
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
    
    if (!enableFileWatcher) {
      return;
    }
    
    // Get the path to watch
    const metadata = this.getSyncMetadata();
    const watchPath = metadata?.filePath || this.lastSyncedPath || this.getDefaultKeybindingsPath();
    
    if (!watchPath) {
      return;
    }
    
    // Create watcher
    try {
      const pattern = new vscode.RelativePattern(path.dirname(watchPath), path.basename(watchPath));
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
      
      this.fileWatcher.onDidChange(async () => {
        await this.handleFileChange(watchPath);
      });
      
      console.log(`Watching for changes: ${watchPath}`);
    } catch (error) {
      console.error('Failed to set up file watcher:', error);
    }
  }
  
  /**
   * Handle keybindings.json file change
   */
  private async handleFileChange(filePath: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('chordMap');
    const autoSync = config.get<boolean>('autoSync', true);
    
    if (autoSync) {
      // Auto-sync silently
      try {
        await this.syncFromPath(filePath);
        vscode.window.showInformationMessage('ChordMap: Keybindings auto-synced', 'View').then(action => {
          if (action === 'View') {
            vscode.commands.executeCommand('workbench.view.extension.chordmap');
          }
        });
      } catch (error) {
        console.error('Auto-sync on file change failed:', error);
      }
    } else {
      // Prompt user to re-sync
      const response = await vscode.window.showInformationMessage(
        'ChordMap: Your keybindings.json has changed. Re-sync?',
        'Sync Now',
        'Later'
      );
      
      if (response === 'Sync Now') {
        try {
          await this.syncFromPath(filePath);
          vscode.window.showInformationMessage('Keybindings synced successfully!');
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to sync: ${error}`);
        }
      }
    }
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }
  }
}
