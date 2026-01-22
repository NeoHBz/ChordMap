/**
 * Simplified Live Chord Tracker
 * 
 * Shows detected keybindings in status bar without a separate panel.
 * Note: VS Code doesn't expose raw keyboard events to extensions,
 * so this tracks based on actual registered command executions.
 */

import * as vscode from 'vscode';
import { ParsedKeybinding } from './types';

export class LiveChordTracker {
  private isActive = false;
  private currentChordSequence: string[] = [];
  private statusBarItem: vscode.StatusBarItem;
  private resetTimer: NodeJS.Timeout | undefined;
  private onChordChangeEmitter = new vscode.EventEmitter<string[]>();
  private context: vscode.ExtensionContext;
  private commandListener: vscode.Disposable | undefined;
  
  readonly onChordChange = this.onChordChangeEmitter.event;
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      1000
    );
    this.statusBarItem.command = 'chordmap.toggleLiveMode';
    this.updateStatusBar();
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
    
    // Update status bar
    this.updateStatusBar();
    this.statusBarItem.show();
    
    // Show info message
    const dontShowAgain = this.context.globalState.get<boolean>('chordmap.hideLiveModeInfo', false);
    
    if (!dontShowAgain) {
      vscode.window.showInformationMessage(
        'ChordMap Live Mode: Tree filters as you press keybindings. Press any registered keybinding to see it in the tree.',
        'Got it',
        'Never show again',
        'Disable'
      ).then(selection => {
        if (selection === 'Never show again') {
          this.context.globalState.update('chordmap.hideLiveModeInfo', true);
        } else if (selection === 'Disable') {
          this.deactivate();
        }
      });
    }
    
    // Note: VS Code doesn't expose a way to intercept all keyboard events
    // Extensions can only react to registered commands
    // For now, this is a passive filter - users must execute actual commands
    vscode.window.showInformationMessage(
      'Note: VS Code extensions cannot capture raw keyboard input. Live mode will filter the tree, but you must press actual registered keybindings to see them tracked.',
      { modal: false }
    );
  }
  
  /**
   * Deactivate live tracking
   */
  private deactivate(): void {
    this.isActive = false;
    this.currentChordSequence = [];
    
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
    
    if (this.commandListener) {
      this.commandListener.dispose();
      this.commandListener = undefined;
    }
    
    this.updateStatusBar();
    this.onChordChangeEmitter.fire([]);
  }
  
  /**
   * Register a detected keybinding
   */
  registerKeybinding(keybinding: string): void {
    if (!this.isActive) {
      return;
    }
    
    this.currentChordSequence.push(keybinding);
    this.updateStatusBar();
    this.onChordChangeEmitter.fire(this.currentChordSequence);
    
    // Auto-reset after 3 seconds
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
    this.currentChordSequence = [];
    this.updateStatusBar();
    this.onChordChangeEmitter.fire([]);
  }
  
  /**
   * Update status bar with current sequence
   */
  private updateStatusBar(): void {
    if (!this.isActive) {
      this.statusBarItem.text = '$(keyboard) ChordMap';
      this.statusBarItem.tooltip = 'Click to activate live chord tracking';
      return;
    }
    
    if (this.currentChordSequence.length === 0) {
      this.statusBarItem.text = '$(keyboard) ChordMap: Active';
      this.statusBarItem.tooltip = 'Live mode active - execute keybindings to see them tracked';
    } else {
      const config = vscode.workspace.getConfiguration('chordMap');
      const useSymbols = config.get<boolean>('useSymbolsInLiveMode', true);
      const isMac = process.platform === 'darwin';
      
      const displaySequence = this.currentChordSequence.map(chord => {
        if (!useSymbols) return chord;
        
        if (isMac) {
          return chord
            .replace(/cmd/g, '⌘')
            .replace(/opt/g, '⌥')
            .replace(/ctrl/g, '⌃')
            .replace(/shift/g, '⇧')
            .replace(/\+/g, '');
        }
        return chord;
      });
      
      this.statusBarItem.text = `$(keyboard) ${displaySequence.join(' → ')}`;
      this.statusBarItem.tooltip = 'Current chord sequence (click to disable live mode)';
    }
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
    
    const currentSequenceStr = this.currentChordSequence.join(' ').toLowerCase();
    
    return bindings.filter(binding => {
      const bindingKey = binding.key.toLowerCase();
      return bindingKey.startsWith(currentSequenceStr);
    });
  }
  
  /**
   * Dispose resources
   */
  dispose(): void {
    this.deactivate();
    this.statusBarItem.dispose();
    this.onChordChangeEmitter.dispose();
  }
}
