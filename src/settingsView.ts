/**
 * Settings View Module
 * 
 * Provides a visual settings interface with toggles and organized sections
 */

import * as vscode from 'vscode';

export class SettingsView {
  private panel: vscode.WebviewPanel | undefined;
  
  constructor(private context: vscode.ExtensionContext) {}
  
  /**
   * Show or focus the settings panel
   */
  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const nonce = getNonce();
    
    this.panel = vscode.window.createWebviewPanel(
      'chordmapSettings',
      'ChordMap Settings',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    
    this.panel.webview.html = this.getWebviewContent(nonce);
    
    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message);
    });
    
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
    
    // Send current settings to webview
    this.sendCurrentSettings();
  }
  
  /**
   * Send current settings to webview
   */
  private async sendCurrentSettings(): Promise<void> {
    if (!this.panel) return;
    
    const config = vscode.workspace.getConfiguration('chordMap');
    const settings = {
      // View Settings
      viewMode: config.get('viewMode'),
      showCommandTitle: config.get('showCommandTitle'),
      autoExpandOnSearch: config.get('autoExpandOnSearch'),
      showCategories: config.get('showCategories'),
      compactView: config.get('compactView'),
      useSymbolsInLiveMode: config.get('useSymbolsInLiveMode'),
      
      // Display Settings
      showDisabledBindings: config.get('showDisabledBindings'),
      showWhenClauses: config.get('showWhenClauses'),
      showCommands: config.get('showCommands'),
      showSyncMetadata: config.get('showSyncMetadata'),
      
      // Sync Settings
      autoSync: config.get('autoSync'),
      enableFileWatcher: config.get('enableFileWatcher'),
      categoryDerivationMethod: config.get('categoryDerivationMethod')
    };
    
    this.panel.webview.postMessage({ type: 'settings', settings });
  }
  
  /**
   * Handle message from webview
   */
  private async handleMessage(message: any): Promise<void> {
    if (message.type === 'updateSetting') {
      const config = vscode.workspace.getConfiguration('chordMap');
      await config.update(message.key, message.value, vscode.ConfigurationTarget.Global);
      
      // Send updated settings back
      await this.sendCurrentSettings();
    } else if (message.type === 'openVSCodeSettings') {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:neohbz.chordmap');
    } else if (message.type === 'requestSettings') {
      await this.sendCurrentSettings();
    }
  }
  
  /**
   * Get webview HTML content
   */
  private getWebviewContent(nonce: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src https: data:; connect-src https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChordMap Settings</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    h1 {
      font-size: 24px;
      margin-bottom: 20px;
      color: var(--vscode-textLink-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    
    .section {
      margin-bottom: 30px;
      padding: 20px;
      background: var(--vscode-sideBar-background);
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
    }
    
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 15px;
      color: var(--vscode-textLink-activeForeground);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .section-icon {
      opacity: 0.8;
    }
    
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    
    .setting-row:last-child {
      border-bottom: none;
    }
    
    .setting-info {
      flex: 1;
    }
    
    .setting-label {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    
    .setting-description {
      font-size: 12px;
      opacity: 0.7;
    }
    
    .toggle-switch {
      position: relative;
      width: 44px;
      height: 24px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .toggle-switch.active {
      background: var(--vscode-button-background);
    }
    
    .toggle-slider {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    
    .toggle-switch.active .toggle-slider {
      transform: translateX(20px);
    }
    
    select {
      padding: 6px 12px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      min-width: 150px;
    }
    
    select:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid var(--vscode-panel-border);
      text-align: center;
    }
    
    .button {
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
    }
    
    .button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    
    .button-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    .button-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚙️ ChordMap Settings</h1>
    
    <!-- View Settings -->
    <div class="section">
      <div class="section-title">
        <span class="section-icon">👁️</span>
        View Settings
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">View Mode</div>
          <div class="setting-description">Choose how keybindings are displayed</div>
        </div>
        <select id="viewMode" data-setting-key="viewMode">
          <option value="tree">Tree View</option>
          <option value="list">List View</option>
          <option value="blocks">Blocks (Grid)</option>
        </select>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Show Command Title</div>
          <div class="setting-description">Display command title instead of ID as primary label</div>
        </div>
        <div class="toggle-switch" id="showCommandTitle" data-setting-key="showCommandTitle">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Auto-Expand on Search</div>
          <div class="setting-description">Automatically expand tree items when filtering</div>
        </div>
        <div class="toggle-switch" id="autoExpandOnSearch" data-setting-key="autoExpandOnSearch">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Show Categories</div>
          <div class="setting-description">Group keybindings by derived categories</div>
        </div>
        <div class="toggle-switch" id="showCategories" data-setting-key="showCategories">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Compact View</div>
          <div class="setting-description">Use condensed layout with less spacing</div>
        </div>
        <div class="toggle-switch" id="compactView" data-setting-key="compactView">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Use Symbols in Live Mode</div>
          <div class="setting-description">Display ⌘⌥⌃⇧ instead of text (macOS)</div>
        </div>
        <div class="toggle-switch" id="useSymbolsInLiveMode" data-setting-key="useSymbolsInLiveMode">
          <div class="toggle-slider"></div>
        </div>
      </div>
    </div>
    
    <!-- Display Settings -->
    <div class="section">
      <div class="section-title">
        <span class="section-icon">🎨</span>
        Display Settings
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Show Disabled Bindings</div>
          <div class="setting-description">Include disabled keybindings in the tree</div>
        </div>
        <div class="toggle-switch" id="showDisabledBindings" data-setting-key="showDisabledBindings">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Show When Clauses</div>
          <div class="setting-description">Display context conditions for bindings</div>
        </div>
        <div class="toggle-switch" id="showWhenClauses" data-setting-key="showWhenClauses">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Show Command IDs</div>
          <div class="setting-description">Display command IDs alongside labels</div>
        </div>
        <div class="toggle-switch" id="showCommands" data-setting-key="showCommands">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Show Sync Metadata</div>
          <div class="setting-description">Display last sync info at top of tree</div>
        </div>
        <div class="toggle-switch" id="showSyncMetadata" data-setting-key="showSyncMetadata">
          <div class="toggle-slider"></div>
        </div>
      </div>
    </div>
    
    <!-- Sync Settings -->
    <div class="section">
      <div class="section-title">
        <span class="section-icon">🔄</span>
        Sync Settings
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Auto-Sync</div>
          <div class="setting-description">Automatically sync keybindings on startup</div>
        </div>
        <div class="toggle-switch" id="autoSync" data-setting-key="autoSync">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Enable File Watcher</div>
          <div class="setting-description">Watch keybindings.json for changes</div>
        </div>
        <div class="toggle-switch" id="enableFileWatcher" data-setting-key="enableFileWatcher">
          <div class="toggle-slider"></div>
        </div>
      </div>
      
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Category Method</div>
          <div class="setting-description">How to derive keybinding categories</div>
        </div>
        <select id="categoryDerivationMethod" data-setting-key="categoryDerivationMethod">
          <option value="simple">Simple (namespace)</option>
          <option value="metadata">Metadata (experimental)</option>
          <option value="off">Off</option>
        </select>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <button class="button button-secondary" id="openVSCodeSettings">
        Open in VS Code Settings
      </button>
    </div>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let settings = {};
    
    vscode.postMessage({ type: 'requestSettings' });
    
    // Listen for settings updates from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'settings') {
        settings = message.settings;
        applySettings();
      }
    });
    
    function applySettings() {
      // Apply toggle states
      const toggles = ['showCommandTitle', 'autoExpandOnSearch', 'showCategories', 
                      'compactView', 'useSymbolsInLiveMode', 'showDisabledBindings',
                      'showWhenClauses', 'showCommands', 'showSyncMetadata', 
                      'autoSync', 'enableFileWatcher'];
      
      toggles.forEach(key => {
        const element = document.getElementById(key);
        if (element && settings[key] !== undefined) {
          if (settings[key]) {
            element.classList.add('active');
          } else {
            element.classList.remove('active');
          }
        }
      });
      
      // Apply select values
      const selects = ['viewMode', 'categoryDerivationMethod'];
      selects.forEach(key => {
        const element = document.getElementById(key);
        if (element && settings[key] !== undefined) {
          element.value = settings[key];
        }
      });
    }
    
    function toggleSetting(key) {
      const currentValue = settings[key];
      const newValue = !currentValue;
      vscode.postMessage({ type: 'updateSetting', key, value: newValue });
    }
    
    function updateSetting(key, value) {
      vscode.postMessage({ type: 'updateSetting', key, value });
    }
    
    function openVSCodeSettings() {
      vscode.postMessage({ type: 'openVSCodeSettings' });
    }
    
    function wireControls() {
      const toggleElements = document.querySelectorAll('.toggle-switch[data-setting-key]');
      toggleElements.forEach(el => {
        const key = el.getAttribute('data-setting-key');
        if (!key) return;
        el.addEventListener('click', () => toggleSetting(key));
      });
      const selectElements = document.querySelectorAll('select[data-setting-key]');
      selectElements.forEach(el => {
        const key = el.getAttribute('data-setting-key');
        if (!key) return;
        el.addEventListener('change', (event) => {
          const target = event.target;
          if (target instanceof HTMLSelectElement) {
            updateSetting(key, target.value);
          }
        });
      });
      const openSettingsButton = document.getElementById('openVSCodeSettings');
      if (openSettingsButton) {
        openSettingsButton.addEventListener('click', () => openVSCodeSettings());
      }
    }
    
    document.addEventListener('DOMContentLoaded', wireControls);
  </script>
</body>
</html>`;
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}

/**
 * Generate a nonce for CSP
 */
function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 16; i++) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return nonce;
}
