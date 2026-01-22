/**
 * TreeView UI Module
 * 
 * Provides the TreeView visualization for keybindings:
 * - Hierarchical display of prefix chains
 * - Category grouping
 * - Visual indicators for disabled bindings, when clauses
 * - Icons and tooltips
 */

import * as vscode from 'vscode';
import * as os from 'os';
import { ParsedKeybinding, PrefixNode, SyncMetadata } from './types';
import { PrefixGraphBuilder } from './prefixGraph';
import { SettingsManager } from './settingsManager';
import { KeybindingParser } from './parser';
import { LiveChordTracker } from './liveTracker';
import { BlocksView } from './blocksView';

/**
 * Tree item types
 */
type TreeItemType = 'category' | 'prefix' | 'binding' | 'metadata' | 'empty';

/**
 * Tree item data
 */
interface ChordMapTreeItem {
  type: TreeItemType;
  label: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  iconPath?: vscode.ThemeIcon;
  collapsibleState?: vscode.TreeItemCollapsibleState;
  
  // Type-specific data
  category?: string;
  prefixNode?: PrefixNode;
  binding?: ParsedKeybinding;
  metadata?: SyncMetadata;
}

export class ChordMapTreeDataProvider implements vscode.TreeDataProvider<ChordMapTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChordMapTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private bindings: ParsedKeybinding[] = [];
  private prefixTree: Map<string, PrefixNode> | undefined;
  private syncMetadata: SyncMetadata | undefined;
  private allBindings: ParsedKeybinding[] = [];
  private blocksView: BlocksView;
  
  constructor(
    private settingsManager: SettingsManager,
    private liveTracker: LiveChordTracker,
    private context: vscode.ExtensionContext
  ) {
    this.blocksView = new BlocksView(context);
    
    // Listen for settings changes
    settingsManager.onConfigChange(() => {
      this.refresh();
    });
    
    // Listen for live chord changes
    liveTracker.onChordChange(() => {
      this.refresh();
    });
  }
  
  /**
   * Update data and refresh view
   */
  update(bindings: ParsedKeybinding[], metadata?: SyncMetadata): void {
    // Store all bindings
    this.allBindings = bindings;
    this.syncMetadata = metadata;
    
    // Apply filters and live tracking
    this.applyFiltersAndLiveMode();
    
    this.refresh();
  }
  
  /**
   * Apply settings filters and live mode filtering
   */
  private applyFiltersAndLiveMode(): void {
    // Apply settings filters
    let filtered = this.settingsManager.applyFilters(this.allBindings);
    
    // Apply live mode filtering if active
    if (this.liveTracker.isLiveMode()) {
      filtered = this.liveTracker.filterBindings(filtered);
    }
    
    this.bindings = filtered;
    
    // Build prefix tree
    this.prefixTree = PrefixGraphBuilder.buildPrefixTree(this.bindings);
  }
  
  /**
   * Refresh the tree view
   */
  refresh(): void {
    // Reapply filters in case live mode state changed
    if (this.allBindings.length > 0) {
      this.applyFiltersAndLiveMode();
    }
    
    const config = this.settingsManager.getConfig();
    
    // If blocks mode, update blocks view
    if (config.viewMode === 'blocks') {
      this.blocksView.updateBindings(this.bindings);
    }
    
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Get tree item
   */
  getTreeItem(element: ChordMapTreeItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      element.label,
      element.collapsibleState || vscode.TreeItemCollapsibleState.None
    );
    
    treeItem.description = element.description;
    treeItem.tooltip = element.tooltip;
    treeItem.contextValue = element.contextValue;
    treeItem.iconPath = element.iconPath;
    
    return treeItem;
  }
  
  /**
   * Get children of a tree item
   */
  async getChildren(element?: ChordMapTreeItem): Promise<ChordMapTreeItem[]> {
    if (!element) {
      // Root level
      return this.getRootItems();
    }
    
    switch (element.type) {
      case 'category':
        return this.getCategoryChildren(element.category!);
      
      case 'prefix':
        return this.getPrefixChildren(element.prefixNode!);
      
      case 'metadata':
      case 'binding':
      case 'empty':
      default:
        return [];
    }
  }
  
  /**
   * Get root level items
   */
  private getRootItems(): ChordMapTreeItem[] {
    const items: ChordMapTreeItem[] = [];
    const config = this.settingsManager.getConfig();
    
    // Show sync metadata if enabled
    if (config.showSyncMetadata && this.syncMetadata) {
      items.push(this.createMetadataItem());
    }
    
    // Check if we have bindings
    if (this.bindings.length === 0) {
      items.push(this.createEmptyItem());
      return items;
    }
    
    // Render based on view mode
    switch (config.viewMode) {
      case 'list':
        return this.getRootItemsList(items);
      case 'blocks':
        return this.getRootItemsBlocks(items);
      case 'tree':
      default:
        return this.getRootItemsTree(items);
    }
  }
  
  /**
   * Get root items in tree mode (hierarchical)
   */
  private getRootItemsTree(items: ChordMapTreeItem[]): ChordMapTreeItem[] {
    // Group by category if enabled
    if (this.settingsManager.shouldShowCategories()) {
      const categories = this.getCategories();
      
      for (const category of categories) {
        items.push(this.createCategoryItem(category));
      }
    } else {
      // Show prefix tree directly
      if (this.prefixTree) {
        for (const node of this.prefixTree.values()) {
          items.push(this.createPrefixItem(node));
        }
      }
    }
    
    return items;
  }
  
  /**
   * Get root items in list mode (flat)
   */
  private getRootItemsList(items: ChordMapTreeItem[]): ChordMapTreeItem[] {
    // Show all bindings as a flat list
    for (const binding of this.bindings) {
      items.push(this.createBindingItem(binding));
    }
    
    return items;
  }
  
  /**
   * Get root items in blocks mode (grouped cards)
   */
  private getRootItemsBlocks(items: ChordMapTreeItem[]): ChordMapTreeItem[] {
    // Group by category, show bindings directly under each category
    if (this.settingsManager.shouldShowCategories()) {
      const categories = this.getCategories();
      
      for (const category of categories) {
        items.push(this.createCategoryItemForBlocks(category));
      }
    } else {
      // No categories, just show all bindings
      for (const binding of this.bindings) {
        items.push(this.createBindingItem(binding));
      }
    }
    
    return items;
  }
  
  /**
   * Create category item for blocks mode
   */
  private createCategoryItemForBlocks(category: string): ChordMapTreeItem {
    const count = this.bindings.filter(b => b.category === category).length;
    
    // Auto-expand in blocks mode
    const config = this.settingsManager.getConfig();
    const shouldAutoExpand = config.viewMode === 'blocks' || 
                            this.liveTracker.isLiveMode() || 
                            (config.autoExpandOnSearch && this.bindings.length < this.allBindings.length);
    
    return {
      type: 'category',
      label: category,
      description: `${count} binding${count !== 1 ? 's' : ''}`,
      iconPath: new vscode.ThemeIcon('symbol-namespace'),
      collapsibleState: shouldAutoExpand ? 
        vscode.TreeItemCollapsibleState.Expanded : 
        vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: 'category',
      category
    };
  }
  
  /**
   * Get children for a category
   */
  private getCategoryChildren(category: string): ChordMapTreeItem[] {
    const categoryBindings = this.bindings.filter(b => b.category === category);
    const config = this.settingsManager.getConfig();
    
    // In blocks mode, show bindings directly
    if (config.viewMode === 'blocks') {
      return categoryBindings.map(b => this.createBindingItem(b));
    }
    
    // In tree/list mode, build prefix tree for this category
    const categoryTree = PrefixGraphBuilder.buildPrefixTree(categoryBindings);
    
    const items: ChordMapTreeItem[] = [];
    
    for (const node of categoryTree.values()) {
      items.push(this.createPrefixItem(node));
    }
    
    return items;
  }
  
  /**
   * Get children for a prefix node
   */
  private getPrefixChildren(node: PrefixNode): ChordMapTreeItem[] {
    const items: ChordMapTreeItem[] = [];
    
    // Add child prefix nodes
    if (node.children) {
      for (const child of node.children.values()) {
        items.push(this.createPrefixItem(child));
      }
    }
    
    // Add bindings at this node
    if (node.bindings && Array.isArray(node.bindings)) {
      for (const binding of node.bindings) {
        items.push(this.createBindingItem(binding));
      }
    }
    
    return items;
  }
  
  /**
   * Create metadata item
   */
  private createMetadataItem(): ChordMapTreeItem {
    const lastSync = new Date(this.syncMetadata!.lastSync);
    const timeAgo = this.getTimeAgo(lastSync);
    
    return {
      type: 'metadata',
      label: `Last Sync: ${timeAgo}`,
      description: `${this.syncMetadata!.bindingCount} bindings`,
      tooltip: `Editor: ${this.syncMetadata!.editorName}\nPath: ${this.syncMetadata!.filePath}\nSynced: ${lastSync.toLocaleString()}`,
      iconPath: new vscode.ThemeIcon('info'),
      contextValue: 'metadata',
      metadata: this.syncMetadata
    };
  }
  
  /**
   * Create empty state item
   */
  private createEmptyItem(): ChordMapTreeItem {
    if (this.liveTracker.isLiveMode()) {
      const sequence = this.liveTracker.getCurrentSequence();
      return {
        type: 'empty',
        label: sequence.length > 0 ? 'No matches for current sequence' : 'Start typing a key sequence',
        description: sequence.length > 0 ? sequence.join(' → ') : 'Use live mode input',
        iconPath: new vscode.ThemeIcon('search'),
        contextValue: 'empty'
      };
    }
    
    return {
      type: 'empty',
      label: 'No keybindings synced',
      description: 'Click the sync button above',
      iconPath: new vscode.ThemeIcon('warning'),
      contextValue: 'empty'
    };
  }
  
  /**
   * Create category item
   */
  private createCategoryItem(category: string): ChordMapTreeItem {
    const count = this.bindings.filter(b => b.category === category).length;
    
    // Auto-expand if live mode is active or auto-expand on search is enabled
    const config = this.settingsManager.getConfig();
    const isLiveModeActive = this.liveTracker.isLiveMode();
    const hasActiveSequence = this.liveTracker.getCurrentSequence().length > 0;
    const isFiltered = config.autoExpandOnSearch && this.bindings.length < this.allBindings.length;
    
    const shouldAutoExpand = (isLiveModeActive && hasActiveSequence) || isFiltered;
    
    return {
      type: 'category',
      label: category,
      description: `${count} binding${count !== 1 ? 's' : ''}`,
      iconPath: new vscode.ThemeIcon('folder'),
      collapsibleState: shouldAutoExpand ? 
        vscode.TreeItemCollapsibleState.Expanded : 
        vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: 'category',
      category
    };
  }
  
  /**
   * Create prefix node item
   */
  private createPrefixItem(node: PrefixNode): ChordMapTreeItem {
    const platform = os.platform() as 'darwin' | 'win32' | 'linux';
    const displayChord = KeybindingParser.normalizeChordForDisplay(
      KeybindingParser.parseChord(node.chord),
      platform
    );
    
    const childrenSize = node.children ? node.children.size : 0;
    const bindingsLength = node.bindings ? node.bindings.length : 0;
    const hasChildren = childrenSize > 0 || bindingsLength > 0;
    const childCount = childrenSize + bindingsLength;
    
    // Auto-expand if live mode is active or auto-expand on search is enabled
    const config = this.settingsManager.getConfig();
    const shouldAutoExpand = this.liveTracker.isLiveMode() || 
                            (config.autoExpandOnSearch && this.bindings.length < this.allBindings.length);
    
    return {
      type: 'prefix',
      label: displayChord,
      description: hasChildren ? `${childCount} option${childCount !== 1 ? 's' : ''}` : undefined,
      tooltip: `Full path: ${node.fullPath ? node.fullPath.join(' → ') : node.chord}`,
      iconPath: new vscode.ThemeIcon('keyboard'),
      collapsibleState: hasChildren ? 
        (shouldAutoExpand ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) : 
        vscode.TreeItemCollapsibleState.None,
      contextValue: 'prefix',
      prefixNode: node
    };
  }
  
  /**
   * Create binding item
   */
  private createBindingItem(binding: ParsedKeybinding): ChordMapTreeItem {
    const config = this.settingsManager.getConfig();
    
    // Build label based on showCommandTitle setting
    let label: string;
    let description: string = '';
    
    if (config.showCommandTitle) {
      // Show title as primary, ID as description
      label = binding.commandLabel || binding.command;
      if (config.showCommands && binding.commandLabel) {
        description = binding.command;
      }
    } else {
      // Show ID as primary, title as description
      label = binding.command;
      if (binding.commandLabel) {
        description = binding.commandLabel;
      }
    }
    
    // Build tooltip
    const tooltipParts: string[] = [];
    tooltipParts.push(`Command: ${binding.command}`);
    if (binding.commandLabel) {
      tooltipParts.push(`Title: ${binding.commandLabel}`);
    }
    tooltipParts.push(`Key: ${binding.key}`);
    
    if (binding.when && config.showWhenClauses) {
      tooltipParts.push(`When: ${binding.when}`);
    }
    
    if (binding.category) {
      tooltipParts.push(`Category: ${binding.category}`);
    }
    
    // Icon based on binding type
    let icon = 'symbol-event';
    if (binding.disabled) {
      icon = 'circle-slash';
      label = `${label} (disabled)`;
    }
    
    return {
      type: 'binding',
      label,
      description,
      tooltip: tooltipParts.join('\n'),
      iconPath: new vscode.ThemeIcon(icon),
      contextValue: 'binding',
      binding
    };
  }
  
  /**
   * Get unique categories from bindings
   */
  private getCategories(): string[] {
    const categories = new Set(this.bindings.map(b => b.category).filter(c => c !== undefined));
    return Array.from(categories).sort();
  }
  
  /**
   * Get blocks view provider
   */
  getBlocksView(): BlocksView {
    return this.blocksView;
  }
  
  /**
   * Format time ago
   */
  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffMins / 1440);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
  }
}
