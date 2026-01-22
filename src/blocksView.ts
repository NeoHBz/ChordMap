/**
 * Blocks View Module
 * 
 * Renders keybindings as a responsive grid of cards in a webview view (sidebar)
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { ParsedKeybinding } from './types';
import { KeybindingParser } from './parser';

export class BlocksView implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private bindings: ParsedKeybinding[] = [];
  private webviewNonce: string | undefined;
  
  constructor(private context: vscode.ExtensionContext) {}
  
  /**
   * Update bindings and refresh view
   */
  updateBindings(bindings: ParsedKeybinding[]): void {
    this.bindings = bindings;
    if (this._view && this.webviewNonce) {
      this._view.webview.html = this.getWebviewContent(bindings, this.webviewNonce);
    }
  }
  
  /**
   * Resolve webview view
   */
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;
    this.webviewNonce = getNonce();
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };
    
    webviewView.webview.html = this.getWebviewContent(this.bindings, this.webviewNonce);
  }
  
  /**
   * Generate HTML for blocks view
   */
  private getWebviewContent(bindings: ParsedKeybinding[], nonce: string): string {
    const platform = os.platform() as 'darwin' | 'win32' | 'linux';
    const config = vscode.workspace.getConfiguration('chordMap');
    const showCommandTitle = config.get<boolean>('showCommandTitle', true);
    
    // Group by category
    const categories = new Map<string, ParsedKeybinding[]>();
    
    for (const binding of bindings) {
      const category = binding.category || 'Other';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(binding);
    }
    
    // Generate cards HTML
    let cardsHtml = '';
    
    for (const [category, categoryBindings] of categories) {
      cardsHtml += `<div class="category-section">
        <h2 class="category-title">${category}</h2>
        <div class="cards-grid">`;
      
      for (const binding of categoryBindings) {
        const displayKey = this.formatKey(binding.key, platform);
        const commandId = binding.command;
        const label = binding.commandLabel || binding.command;
        const when = binding.when;
        const disabled = binding.disabled;
        
        // Determine what to show based on setting
        const primaryLabel = showCommandTitle ? label : commandId;
        const secondaryLabel = showCommandTitle && binding.commandLabel ? commandId : (binding.commandLabel || '');
        
        cardsHtml += `
          <div class="card${disabled ? ' disabled' : ''}">
            <div class="card-key">${displayKey}</div>
            <div class="card-label">${this.escapeHtml(primaryLabel)}</div>
            ${secondaryLabel && secondaryLabel !== primaryLabel ? `<div class="card-command">${this.escapeHtml(secondaryLabel)}</div>` : ''}
            ${when ? `<div class="card-when" title="${this.escapeHtml(when)}">⚙️ Context-dependent</div>` : ''}
            ${disabled ? '<div class="card-badge">Disabled</div>' : ''}
          </div>`;
      }
      
      cardsHtml += `</div></div>`;
    }
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'none'; font-src https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ChordMap Blocks</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 12px;
      line-height: 1.5;
      overflow-y: auto;
    }
    
    .category-section {
      margin-bottom: 24px;
    }
    
    .category-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--vscode-textLink-foreground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    
    .cards-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }
    
    .card {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 10px;
      transition: all 0.15s;
      cursor: default;
      position: relative;
    }
    
    .card:hover {
      border-color: var(--vscode-focusBorder);
      background: var(--vscode-list-hoverBackground);
    }
    
    .card.disabled {
      opacity: 0.5;
    }
    
    .card-key {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-textLink-activeForeground);
      margin-bottom: 8px;
      padding: 4px 8px;
      background: var(--vscode-sideBar-background);
      border-radius: 4px;
      display: inline-block;
      border: 1px solid var(--vscode-input-border);
    }
    
    .card-label {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 4px;
      color: var(--vscode-foreground);
      word-wrap: break-word;
    }
    
    .card-command {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-family: 'SF Mono', Monaco, monospace;
      margin-bottom: 6px;
      word-wrap: break-word;
    }
    
    .card-when {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 6px;
      padding: 3px 6px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      display: inline-block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }
    
    .card-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      font-size: 9px;
      padding: 2px 5px;
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 600;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  ${cardsHtml || '<div class="empty-state"><div class="empty-state-icon">📋</div><div>No keybindings to display</div></div>'}
</body>
</html>`;
  }
  
  /**
   * Format key with symbols
   */
  private formatKey(key: string, platform: 'darwin' | 'win32' | 'linux'): string {
    const chords = KeybindingParser.parseKeySequence(key);
    const formatted = chords.map(chord => 
      KeybindingParser.normalizeChordForDisplay(chord, platform)
    );
    return formatted.join(' → ');
  }
  
  /**
   * Escape HTML
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
