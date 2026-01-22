/**
 * Live Chord Tracker Module
 * 
 * Tracks keyboard input in real-time and filters the tree view
 * to show only relevant keybindings for the current chord sequence.
 */

import * as vscode from 'vscode';
import { ParsedKeybinding, PrefixNode } from './types';
import { KeybindingParser } from './parser';
import { PrefixGraphBuilder } from './prefixGraph';

export class LiveChordTracker implements vscode.WebviewViewProvider {
  private isActive = false;
  private currentChordSequence: string[] = [];
  private quickPick: vscode.QuickPick<vscode.QuickPickItem> | undefined;
  private resetTimer: NodeJS.Timeout | undefined;
  private onChordChangeEmitter = new vscode.EventEmitter<string[]>();
  private context: vscode.ExtensionContext;
  private view: vscode.WebviewView | undefined;
  
  readonly onChordChange = this.onChordChangeEmitter.event;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView;
    const nonce = getNonce();
    
    webviewView.webview.options = {
      enableScripts: true
    };
    
    const config = vscode.workspace.getConfiguration('chordMap');
    const useSymbols = config.get<boolean>('useSymbolsInLiveMode', true);
    
    webviewView.webview.html = this.getWebviewContent(useSymbols, nonce);
    
    // Listen for messages from webview
    webviewView.webview.onDidReceiveMessage(message => {
      if (message.type === 'keypress') {
        this.handleKeyPress(message.chord);
      } else if (message.type === 'reset') {
        this.currentChordSequence = [];
        this.onChordChangeEmitter.fire([]);
      }
    });
    
    // Auto-activate when view is shown
    if (!this.isActive) {
      this.isActive = true;
    }
  }
  
  /**
   * Toggle live tracking mode
   */
  async toggle(): Promise<void> {
    if (this.isActive) {
      this.deactivate();
    } else {
      await this.activate();
    }
  }
  
  /**
   * Activate live tracking
   */
  private async activate(): Promise<void> {
    this.isActive = true;
    this.currentChordSequence = [];
    
    // Open the live tracker view in sidebar
    await vscode.commands.executeCommand('chordmapLiveTracker.focus');
    
    // Show info message only if user hasn't dismissed it
    const dontShowAgain = this.context.globalState.get<boolean>('chordmap.hideLiveModeInfo', false);
    
    if (!dontShowAgain) {
      vscode.window.showInformationMessage(
        'Live Tracker active! Focus the tracker panel and press any keys - the tree filters in real-time. Auto-resets after 3s.',
        'Got it',
        'Never show again'
      ).then(selection => {
        if (selection === 'Never show again') {
          this.context.globalState.update('chordmap.hideLiveModeInfo', true);
        }
      });
    }
  }
  
  /**
   * Deactivate live tracking
   */
  private deactivate(): void {
    this.isActive = false;
    this.currentChordSequence = [];
    
    if (this.view) {
      // Send reset message to webview
      this.view.webview.postMessage({ type: 'reset' });
    }
    
    if (this.quickPick) {
      this.quickPick.dispose();
      this.quickPick = undefined;
    }
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
    
    // Fire empty array to restore full tree when live mode is disabled
    this.onChordChangeEmitter.fire([]);
  }
  
  /**
   * Handle key press from webview
   */
  private handleKeyPress(chord: string): void {
    if (!chord) {
      return;
    }
    
    this.currentChordSequence.push(chord);
    
    this.onChordChangeEmitter.fire(this.currentChordSequence);
    
    // Auto-reset after 2 seconds of no input
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    
    this.resetTimer = setTimeout(() => {
      this.resetSequence();
    }, 3000);
  }
  
  /**
   * Reset the chord sequence
   */
  private resetSequence(): void {
    // Only reset the sequence, keep listener active
    if (!this.isActive) {
      return;
    }
    
    this.currentChordSequence = [];
    
    // DON'T send reset to webview - let it show the last sequence
    // Webview will clear on next keypress
    // DON'T fire event - tree will update on next keypress
  }
  
  private getWebviewContent(useSymbols: boolean = true, nonce: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src https: data:; connect-src https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Tracker</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    #tracker {
      width: 100%;
      max-width: 500px;
      text-align: center;
    }
    
    #capture {
      width: 100%;
      min-height: 120px;
      border: 2px dashed var(--vscode-input-border, #555);
      border-radius: 6px;
      padding: 20px;
      cursor: text;
      background: var(--vscode-input-background);
      transition: border-color 0.2s;
    }
    
    #capture:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }
    
    .hint {
      font-size: 13px;
      opacity: 0.6;
      margin-bottom: 10px;
    }
    
    #display {
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 20px;
      font-weight: 600;
      color: var(--vscode-textLink-activeForeground);
      min-height: 30px;
      margin-top: 10px;
    }
    
    .empty { opacity: 0.4; font-weight: normal; }
    
    .controls {
      margin-top: 15px;
      display: flex;
      justify-content: center;
      gap: 10px;
    }
    
    button {
      padding: 6px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }
    
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <div id="tracker">
    <div id="capture" tabindex="0">
      <div class="hint">Press any keys</div>
      <div id="display" class="empty">⌨️</div>
    </div>
    <div class="controls">
      <button id="resetButton">Reset</button>
    </div>
  </div>
  
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const capture = document.getElementById('capture');
    const display = document.getElementById('display');
    const useSymbols = ${useSymbols};
    const isMac = navigator.userAgent.includes('Mac');
    let sequence = [];
    let resetTimer = null;
    
    capture.focus();
    capture.onclick = () => capture.focus();
    
    capture.onkeydown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // If timer expired (or doesn't exist), start new sequence
      if (!resetTimer) {
        sequence = [];
      }
      
      // Clear timer if exists
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      
      const mods = [];
      if (e.metaKey) mods.push('cmd');
      if (e.ctrlKey) mods.push('ctrl');
      if (e.altKey) mods.push(isMac ? 'opt' : 'alt');
      if (e.shiftKey) mods.push('shift');
      
      const keyMap = {
        keya:'a',keyb:'b',keyc:'c',keyd:'d',keye:'e',keyf:'f',keyg:'g',keyh:'h',keyi:'i',keyj:'j',keyk:'k',keyl:'l',keym:'m',keyn:'n',keyo:'o',keyp:'p',keyq:'q',keyr:'r',keys:'s',keyt:'t',keyu:'u',keyv:'v',keyw:'w',keyx:'x',keyy:'y',keyz:'z',
        digit0:'0',digit1:'1',digit2:'2',digit3:'3',digit4:'4',digit5:'5',digit6:'6',digit7:'7',digit8:'8',digit9:'9',
        space:'space',minus:'-',equal:'=',bracketleft:'[',bracketright:']',backslash:'\\\\',semicolon:';',quote:"'",comma:',',period:'.',slash:'/',backquote:'\`',
        arrowup:'up',arrowdown:'down',arrowleft:'left',arrowright:'right',
        escape:'escape',enter:'enter',tab:'tab',backspace:'backspace',delete:'delete',
        home:'home',end:'end',pageup:'pageup',pagedown:'pagedown',
        f1:'f1',f2:'f2',f3:'f3',f4:'f4',f5:'f5',f6:'f6',f7:'f7',f8:'f8',f9:'f9',f10:'f10',f11:'f11',f12:'f12'
      };
      
      let key = keyMap[e.code.toLowerCase()] || e.key.toLowerCase();
      
      if (['control','meta','alt','shift'].some(m => key.includes(m))) return;
      
      const isSingleLetter = /^[a-z]$/.test(key);
      const hasOnlyShift = e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
      
      const chord = (isSingleLetter && hasOnlyShift) ? key : (mods.length ? mods.join('+') + '+' + key : key);
      
      sequence.push(chord);
      update();
      vscode.postMessage({ type: 'keypress', chord });
      
      // Set timer to mark as ready for reset (but don't actually reset display)
      resetTimer = setTimeout(() => {
        resetTimer = null;
        // Display persists, just mark that we're ready for next sequence
      }, 3000);
    };
    
    function update() {
      if (sequence.length === 0) {
        display.className = 'empty';
        display.textContent = '⌨️';
      } else {
        display.className = '';
        display.textContent = sequence.map(c => {
          if (!useSymbols) return c;
          return isMac ? c.replace(/cmd/g,'⌘').replace(/opt/g,'⌥').replace(/ctrl/g,'⌃').replace(/shift/g,'⇧').replace(/\\+/g,'') : c;
        }).join(' → ');
      }
    }
    
    function reset() {
      if (resetTimer) clearTimeout(resetTimer);
      sequence = [];
      update();
      vscode.postMessage({ type: 'reset' });
      capture.focus();
    }
    
    document.getElementById('resetButton')?.addEventListener('click', () => reset());
    
    window.onmessage = (e) => {
      if (e.data.type === 'reset') {
        if (resetTimer) clearTimeout(resetTimer);
        sequence = [];
        update();
      }
    };
  </script>
</body>
</html>`;
  }
  
  /**
   * Get current chord sequence
   */
  getCurrentSequence(): string[] {
    return [...this.currentChordSequence];
  }
  
  /**
   * Check if live mode is active
   */
  isLiveMode(): boolean {
    return this.isActive;
  }
  
  /**
   * Filter bindings based on current sequence
   */
  filterBindings(bindings: ParsedKeybinding[]): ParsedKeybinding[] {
    if (this.currentChordSequence.length === 0) {
      return bindings;
    }
    
    // Normalize 'opt' to 'option' to match parser's format
    // The webview sends 'opt' on macOS but the parser uses 'option'
    const normalizedSequence = this.currentChordSequence.map(chord => 
      chord.replace(/\bopt\b/g, 'option')
    );
    
    // Join current sequence with space
    const currentSequenceStr = normalizedSequence.join(' ').toLowerCase();
    
    return bindings.filter(binding => {
      const bindingKey = binding.key.toLowerCase();
      
      // Check if binding starts with current sequence
      // Handle both exact match and prefix match (for multi-step chords)
      if (bindingKey === currentSequenceStr) {
        return true; // Exact match
      }
      
      // Check if binding is a multi-step chord that starts with current sequence
      // e.g., current: "cmd+option+g", binding: "cmd+option+g s" should match
      if (bindingKey.startsWith(currentSequenceStr + ' ')) {
        return true; // Multi-step chord prefix match
      }
      
      return false;
    });
  }
  
  /**
   * Get next possible keys for current sequence
   */
  getNextPossibleKeys(prefixTree: Map<string, PrefixNode>): string[] {
    if (this.currentChordSequence.length === 0) {
      // Return all root chords
      return Array.from(prefixTree.keys());
    }
    
    // Try to find the node for current sequence
    const sequenceStr = this.currentChordSequence.join(' ');
    const node = PrefixGraphBuilder.findNode(prefixTree, sequenceStr);
    
    if (!node) {
      return [];
    }
    
    // Return all child chords
    const nextKeys: string[] = [];
    
    // Add child nodes
    for (const childKey of node.children.keys()) {
      nextKeys.push(childKey);
    }
    
    // If this node has bindings, it's also a valid completion
    if (node.bindings.length > 0) {
      nextKeys.push('(completes)');
    }
    
    return nextKeys;
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    this.deactivate();
    this.onChordChangeEmitter.dispose();
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
