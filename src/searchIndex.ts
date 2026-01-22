/**
 * Search Index Module
 * 
 * Provides fuzzy search across keybindings using Fuse.js
 * Searches: key sequences, command IDs, command labels, categories
 */

import Fuse, { type FuseResultMatch } from 'fuse.js';
import { ParsedKeybinding, SearchResult } from './types';

export class SearchIndex {
  private fuse: Fuse<ParsedKeybinding> | undefined;
  private bindings: ParsedKeybinding[] = [];
  
  /**
   * Build search index from bindings
   */
  buildIndex(bindings: ParsedKeybinding[]): void {
    this.bindings = bindings;
    
    this.fuse = new Fuse(bindings, {
      keys: [
        { name: 'key', weight: 2 },
        { name: 'command', weight: 1.5 },
        { name: 'commandLabel', weight: 1.5 },
        { name: 'category', weight: 1 },
        { name: 'when', weight: 0.5 }
      ],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2
    });
  }
  
  /**
   * Search for keybindings
   */
  search(query: string, limit: number = 50): SearchResult[] {
    if (!this.fuse || !query) {
      return [];
    }
    
    const results = this.fuse.search(query, { limit });
    
    return results.map(result => ({
      binding: result.item,
      score: result.score || 0,
      matches: this.extractMatches(result.matches)
    }));
  }
  
  /**
   * Extract which fields matched
   */
  private extractMatches(matches: readonly FuseResultMatch[] | undefined): {
    key?: boolean;
    command?: boolean;
    category?: boolean;
  } {
    if (!matches) {
      return {};
    }
    
    return {
      key: matches.some(m => m.key === 'key'),
      command: matches.some(m => m.key === 'command' || m.key === 'commandLabel'),
      category: matches.some(m => m.key === 'category')
    };
  }
  
  /**
   * Filter bindings by category
   */
  filterByCategory(category: string): ParsedKeybinding[] {
    return this.bindings.filter(b => b.category === category);
  }
  
  /**
   * Filter multi-chord only
   */
  filterMultiChord(): ParsedKeybinding[] {
    return this.bindings.filter(b => b.isMultiChord);
  }
  
  /**
   * Filter single-chord only
   */
  filterSingleChord(): ParsedKeybinding[] {
    return this.bindings.filter(b => !b.isMultiChord);
  }
  
  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set(this.bindings.map(b => b.category).filter(c => c !== undefined));
    return Array.from(categories).sort();
  }
  
  /**
   * Get bindings count by category
   */
  getCategoryCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    
    for (const binding of this.bindings) {
      if (binding.category) {
        counts.set(binding.category, (counts.get(binding.category) || 0) + 1);
      }
    }
    
    return counts;
  }
}
