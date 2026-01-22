/**
 * Types for ChordMap extension
 */

export interface ParsedKeybinding {
  /** Raw key sequence as string (e.g., "cmd+option+g p") */
  key: string;
  
  /** Command ID (e.g., "git.pull") or disabled command ("-git.pull") */
  command: string;
  
  /** Context clause for when this binding is active */
  when?: string;
  
  /** Whether this binding disables another */
  disabled: boolean;
  
  /** Which editor this binding came from */
  sourceEditor: string;
  
  /** Human-readable command label (fetched from VS Code) */
  commandLabel?: string;
  
  /** Derived category (e.g., "Git", "Editor", "Terminal") */
  category?: string;
  
  /** Whether this is a multi-chord sequence */
  isMultiChord: boolean;
  
  /** Array of key sequences this binding conflicts with */
  conflictsWith?: string[];
}

export interface KeyChord {
  /** Individual modifiers (cmd, ctrl, shift, alt, option) */
  modifiers: string[];
  
  /** Base key (letter, number, or special key) */
  key: string;
  
  /** Original chord string */
  raw: string;
}

export interface PrefixNode {
  /** The chord at this level (e.g., "cmd+k") */
  chord: string;
  
  /** Child nodes representing next possible chords */
  children: Map<string, PrefixNode>;
  
  /** Keybindings that complete at this node (leaf nodes only) */
  bindings: ParsedKeybinding[];
  
  /** Full key sequence path to this node */
  fullPath: string[];
}

export interface SyncMetadata {
  /** ISO timestamp of last sync */
  lastSync: string;
  
  /** Editor name (VS Code, VS Code Insiders, Antigravity) */
  editorName: string;
  
  /** Path to synced keybindings.json */
  filePath: string;
  
  /** Number of bindings synced */
  bindingCount: number;
  
  /** Schema version for migration support */
  schemaVersion: number;
}

export interface ChordMapConfig {
  autoSync: boolean;
  enableFileWatcher: boolean;
  showDisabledBindings: boolean;
  showWhenClauses: boolean;
  showCommands: boolean;
  showCategories: boolean;
  categoryDerivationMethod: 'simple' | 'metadata' | 'off';
  showSyncMetadata: boolean;
  compactView: boolean;
  viewMode: 'tree' | 'list' | 'blocks';
  showCommandTitle: boolean;
  autoExpandOnSearch: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SearchResult {
  binding: ParsedKeybinding;
  score: number;
  matches: {
    key?: boolean;
    command?: boolean;
    category?: boolean;
  };
}
