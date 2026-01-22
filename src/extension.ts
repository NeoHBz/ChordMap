/**
 * ChordMap Extension Entry Point
 * 
 * Registers commands, initializes modules, and sets up the TreeView.
 */

import * as vscode from 'vscode';
import { SyncController } from './syncController';
import { SettingsManager } from './settingsManager';
import { SearchIndex } from './searchIndex';
import { ChordMapTreeDataProvider } from './treeView';
import { LiveChordTracker } from './liveTracker';
import { SettingsView } from './settingsView';

let syncController: SyncController;
let settingsManager: SettingsManager;
let searchIndex: SearchIndex;
let treeDataProvider: ChordMapTreeDataProvider;
let liveTracker: LiveChordTracker;
let settingsView: SettingsView;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('ChordMap extension activating...');
  
  // Initialize modules
  syncController = new SyncController(context);
  settingsManager = new SettingsManager();
  searchIndex = new SearchIndex();
  liveTracker = new LiveChordTracker(context);
  settingsView = new SettingsView(context);
  treeDataProvider = new ChordMapTreeDataProvider(settingsManager, liveTracker, context);
  
  // Register TreeView
  const treeView = vscode.window.createTreeView('chordmapExplorer', {
    treeDataProvider,
    showCollapseAll: true
  });
  
  context.subscriptions.push(treeView);
  
  // Register WebviewView for blocks mode
  const blocksViewProvider = treeDataProvider.getBlocksView();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('chordmapBlocksView', blocksViewProvider)
  );
  
  // Register live tracker webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('chordmapLiveTracker', liveTracker)
  );
  
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmap.syncKeybindings', async () => {
      await handleSyncCommand();
    })
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmap.refreshView', async () => {
      await handleRefreshCommand();
    })
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmap.search', async () => {
      await handleSearchCommand();
    })
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmap.openSettings', () => {
      settingsView.show();
    })
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmap.toggleLiveMode', async () => {
      await liveTracker.toggle();
    })
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmap.toggleCommandDisplay', async () => {
      const config = vscode.workspace.getConfiguration('chordMap');
      const current = config.get<boolean>('showCommandTitle', true);
      await config.update('showCommandTitle', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Now showing: ${!current ? 'Command Titles' : 'Command IDs'}`);
    })
  );
  
  context.subscriptions.push(
    vscode.commands.registerCommand('chordmap.setViewMode', async () => {
      const mode = await vscode.window.showQuickPick(
        [
          { label: 'Tree View', description: 'Hierarchical chord sequences', value: 'tree' },
          { label: 'List View', description: 'Flat list of all keybindings', value: 'list' },
          { label: 'Blocks View', description: 'Grid layout with cards', value: 'blocks' }
        ],
        { placeHolder: 'Select view mode' }
      );
      
      if (mode) {
        const config = vscode.workspace.getConfiguration('chordMap');
        await config.update('viewMode', mode.value, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`View mode changed to: ${mode.label}`);
      }
    })
  );
  
  // Register disposables
  context.subscriptions.push(syncController);
  context.subscriptions.push(settingsManager);
  context.subscriptions.push(liveTracker);
  context.subscriptions.push(settingsView);
  
  // Initialize sync controller (handles auto-sync)
  await syncController.initialize();
  
  // Load initial data
  await loadData();
  
  console.log('ChordMap extension activated successfully!');
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('ChordMap extension deactivating...');
}

/**
 * Handle sync command
 */
async function handleSyncCommand(): Promise<void> {
  try {
    await syncController.syncManually();
    await loadData();
  } catch (error) {
    vscode.window.showErrorMessage(`Sync failed: ${error}`);
  }
}

/**
 * Handle refresh command
 */
async function handleRefreshCommand(): Promise<void> {
  await loadData();
  vscode.window.showInformationMessage('ChordMap view refreshed');
}

/**
 * Handle search command
 */
async function handleSearchCommand(): Promise<void> {
  const query = await vscode.window.showInputBox({
    prompt: 'Search keybindings',
    placeHolder: 'Enter key sequence, command, or category...'
  });
  
  if (!query) {
    return;
  }
  
  const results = searchIndex.search(query, 20);
  
  if (results.length === 0) {
    vscode.window.showInformationMessage('No results found');
    return;
  }
  
  // Show results in quick pick
  interface SearchQuickPickItem extends vscode.QuickPickItem {
    binding: any;
  }
  
  const items: SearchQuickPickItem[] = results.map(result => ({
    label: result.binding.commandLabel || result.binding.command,
    description: result.binding.key,
    detail: result.binding.when ? `When: ${result.binding.when}` : undefined,
    binding: result.binding
  }));
  
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a keybinding to view details',
    matchOnDescription: true,
    matchOnDetail: true
  });
  
  if (selected) {
    // Show detailed info
    const binding = selected.binding;
    const info = [
      `Command: ${binding.command}`,
      `Key: ${binding.key}`,
      binding.category ? `Category: ${binding.category}` : '',
      binding.when ? `When: ${binding.when}` : '',
      binding.disabled ? 'Status: Disabled' : ''
    ].filter(s => s).join('\n');
    
    vscode.window.showInformationMessage(info, { modal: true });
  }
}

/**
 * Load data and update views
 */
async function loadData(): Promise<void> {
  const bindings = await syncController.getBindings();
  const metadata = syncController.getSyncMetadata();
  
  // Update search index
  searchIndex.buildIndex(bindings);
  
  // Update tree view
  treeDataProvider.update(bindings, metadata);
}
