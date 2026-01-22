/**
 * Keybinding Parser Module
 * 
 * Parses keybindings.json (jsonc format) and converts to structured data.
 * Handles:
 * - Multi-chord sequences (e.g., "cmd+k left")
 * - Disabled bindings (command starts with "-")
 * - Platform-specific modifier normalization
 * - Validation and error handling
 */

import * as jsonc from 'jsonc-parser';
import { ParsedKeybinding, KeyChord, ValidationResult } from './types';

export class KeybindingParser {
  
  /**
   * Parse keybindings.json file content
   */
  static parseKeybindingsFile(content: string, sourceEditor: string): ParsedKeybinding[] {
    const errors: jsonc.ParseError[] = [];
    const rawBindings = jsonc.parse(content, errors);
    
    // Only throw on critical parse errors (not on JSONC features like trailing commas/comments)
    // Error codes that are acceptable in JSONC:
    // - 3 (PropertyNameExpected): trailing comma
    // - 4 (ValueExpected): trailing comma
    const criticalErrors = errors.filter(e => 
      e.error !== 3 && // PropertyNameExpected (trailing comma)
      e.error !== 4    // ValueExpected (trailing comma)
    );
    
    if (criticalErrors.length > 0) {
      throw new Error(`Failed to parse keybindings.json: ${criticalErrors.map(e => jsonc.printParseErrorCode(e.error)).join(', ')}`);
    }
    
    if (!Array.isArray(rawBindings)) {
      throw new Error('keybindings.json must contain an array');
    }
    
    const parsed: ParsedKeybinding[] = [];
    
    for (const binding of rawBindings) {
      try {
        const result = this.parseBinding(binding, sourceEditor);
        if (result) {
          parsed.push(result);
        }
      } catch (error) {
        // Log but don't fail on individual malformed bindings
        console.warn(`Skipping malformed binding:`, binding, error);
      }
    }
    
    return parsed;
  }
  
  /**
   * Parse a single binding entry
   */
  private static parseBinding(raw: any, sourceEditor: string): ParsedKeybinding | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    
    const key = raw.key;
    const command = raw.command;
    
    // Must have both key and command
    if (!key || !command) {
      return null;
    }
    
    // Check if this is a disabled binding
    const disabled = command.startsWith('-');
    const actualCommand = disabled ? command.slice(1) : command;
    
    // Parse the key sequence to determine if multi-chord
    const chords = this.parseKeySequence(key);
    const isMultiChord = chords.length > 1;
    
    // Derive category from command
    const category = this.deriveCategory(actualCommand);
    
    return {
      key,
      command: actualCommand,
      when: raw.when,
      disabled,
      sourceEditor,
      isMultiChord,
      category,
      conflictsWith: [] // Will be populated by conflict detection
    };
  }
  
  /**
   * Parse a key sequence into individual chords
   * Example: "cmd+option+g p" -> [KeyChord, KeyChord]
   */
  static parseKeySequence(keySequence: string): KeyChord[] {
    // Split by whitespace to get individual chords
    const chordStrings = keySequence.trim().split(/\s+/);
    
    return chordStrings.map(chordStr => this.parseChord(chordStr));
  }
  
  /**
   * Parse a single chord into modifiers and base key
   * Example: "cmd+shift+k" -> { modifiers: ["cmd", "shift"], key: "k" }
   */
  static parseChord(chord: string): KeyChord {
    const parts = chord.toLowerCase().split('+');
    
    // Known modifiers
    const modifierSet = new Set(['cmd', 'ctrl', 'shift', 'alt', 'option', 'meta']);
    
    const modifiers: string[] = [];
    let key = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (modifierSet.has(part) && i < parts.length - 1) {
        modifiers.push(part);
      } else {
        // Last part or non-modifier is the key
        key = part;
      }
    }
    
    return {
      modifiers,
      key,
      raw: chord
    };
  }
  
  /**
   * Normalize modifiers for cross-platform display
   * macOS: cmd → ⌘, option → ⌥, ctrl → ⌃, shift → ⇧
   * Windows/Linux: Use text labels
   */
  static normalizeChordForDisplay(chord: KeyChord, platform: 'darwin' | 'win32' | 'linux'): string {
    if (platform === 'darwin') {
      const modifierMap: Record<string, string> = {
        'cmd': '⌘',
        'ctrl': '⌃',
        'alt': '⌥',
        'option': '⌥',
        'shift': '⇧',
        'meta': '⌘'
      };
      
      const displayMods = chord.modifiers.map(m => modifierMap[m] || m);
      return [...displayMods, chord.key.toUpperCase()].join('');
    } else {
      // Windows/Linux: use text
      const modifierMap: Record<string, string> = {
        'cmd': 'Ctrl',
        'ctrl': 'Ctrl',
        'alt': 'Alt',
        'option': 'Alt',
        'shift': 'Shift',
        'meta': 'Meta'
      };
      
      const displayMods = chord.modifiers.map(m => modifierMap[m] || m);
      return [...displayMods, chord.key.toUpperCase()].join('+');
    }
  }
  
  /**
   * Normalize full key sequence for display
   */
  static normalizeKeySequenceForDisplay(keySequence: string, platform: 'darwin' | 'win32' | 'linux'): string {
    const chords = this.parseKeySequence(keySequence);
    return chords.map(c => this.normalizeChordForDisplay(c, platform)).join(' ');
  }
  
  /**
   * Derive category from command namespace
   * Example: "git.pull" -> "Git"
   */
  private static deriveCategory(command: string): string {
    const prefix = command.split('.')[0];
    
    const categoryMap: Record<string, string> = {
      'git': 'Git',
      'workbench': 'Workbench',
      'editor': 'Editor',
      'terminal': 'Terminal',
      'debug': 'Debug',
      'explorer': 'Explorer',
      'search': 'Search',
      'scm': 'Source Control',
      'extensions': 'Extensions',
      'notebook': 'Notebook',
      'testing': 'Testing',
      'task': 'Tasks',
      'file': 'Files',
      'view': 'Views',
      'list': 'Lists',
      'problems': 'Problems',
      'output': 'Output',
      'markdown': 'Markdown',
      'references': 'References',
      'rename': 'Refactoring',
      'go': 'Navigation',
      'window': 'Window'
    };
    
    return categoryMap[prefix] || 'Other';
  }
  
  /**
   * Validate a keybinding entry
   */
  static validateBinding(binding: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!binding.key) {
      errors.push('Missing "key" field');
    }
    
    if (!binding.command) {
      errors.push('Missing "command" field');
    }
    
    if (binding.key && typeof binding.key !== 'string') {
      errors.push('"key" must be a string');
    }
    
    if (binding.command && typeof binding.command !== 'string') {
      errors.push('"command" must be a string');
    }
    
    if (binding.when && typeof binding.when !== 'string') {
      warnings.push('"when" should be a string');
    }
    
    // Validate key format
    if (binding.key) {
      try {
        this.parseKeySequence(binding.key);
      } catch (error) {
        errors.push(`Invalid key format: ${binding.key}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Batch validate all bindings
   */
  static validateBindings(bindings: any[]): { valid: ParsedKeybinding[], invalid: any[] } {
    const valid: ParsedKeybinding[] = [];
    const invalid: any[] = [];
    
    for (const binding of bindings) {
      const result = this.validateBinding(binding);
      if (result.valid) {
        // Re-parse as valid
        const parsed = this.parseBinding(binding, 'unknown');
        if (parsed) {
          valid.push(parsed);
        }
      } else {
        invalid.push({ binding, errors: result.errors, warnings: result.warnings });
      }
    }
    
    return { valid, invalid };
  }
}
