/**
 * Prefix Graph Builder Module
 * 
 * Builds a tree structure from keybindings to visualize chord chains.
 * Each node represents a chord in a sequence, with children representing
 * possible continuations.
 */

import { ParsedKeybinding, PrefixNode } from './types';
import { KeybindingParser } from './parser';

export class PrefixGraphBuilder {
  
  /**
   * Build a prefix tree from parsed keybindings
   */
  static buildPrefixTree(bindings: ParsedKeybinding[]): Map<string, PrefixNode> {
    // Root map: first chord -> node
    const roots = new Map<string, PrefixNode>();
    
    for (const binding of bindings) {
      if (!binding.key) {
        continue;
      }
      
      // Parse the key sequence into chords
      const chords = KeybindingParser.parseKeySequence(binding.key);
      
      if (chords.length === 0) {
        continue;
      }
      
      // Get or create root node for first chord
      const firstChordKey = this.normalizeChordKey(chords[0].raw);
      let currentNode = roots.get(firstChordKey);
      
      if (!currentNode) {
        currentNode = this.createNode(chords[0].raw, [chords[0].raw]);
        roots.set(firstChordKey, currentNode);
      }
      
      // If single chord, add binding to root node
      if (chords.length === 1) {
        if (!currentNode.bindings) {
          currentNode.bindings = [];
        }
        currentNode.bindings.push(binding);
        continue;
      }
      
      // Multi-chord: traverse/create tree
      let fullPath = [chords[0].raw];
      
      for (let i = 1; i < chords.length; i++) {
        const chord = chords[i];
        const chordKey = this.normalizeChordKey(chord.raw);
        fullPath.push(chord.raw);
        
        let childNode: PrefixNode | undefined = currentNode.children.get(chordKey);
        
        if (!childNode) {
          childNode = this.createNode(chord.raw, [...fullPath]);
          currentNode.children.set(chordKey, childNode);
        }
        
        currentNode = childNode;
      }
      
      // Add binding to leaf node
      if (!currentNode.bindings) {
        currentNode.bindings = [];
      }
      currentNode.bindings.push(binding);
    }
    
    return roots;
  }
  
  /**
   * Create a new prefix node
   */
  private static createNode(chord: string, fullPath: string[]): PrefixNode {
    return {
      chord,
      children: new Map(),
      bindings: [],
      fullPath
    };
  }
  
  /**
   * Normalize chord for consistent lookup
   * Lowercase and sort modifiers
   */
  private static normalizeChordKey(chord: string): string {
    const parsed = KeybindingParser.parseChord(chord);
    
    // Sort modifiers alphabetically for consistency
    const sortedModifiers = [...parsed.modifiers].sort();
    
    // Reconstruct normalized key
    if (sortedModifiers.length > 0) {
      return [...sortedModifiers, parsed.key].join('+');
    }
    
    return parsed.key;
  }
  
  /**
   * Get all leaf nodes (nodes with actual bindings)
   */
  static getLeafNodes(roots: Map<string, PrefixNode>): PrefixNode[] {
    const leaves: PrefixNode[] = [];
    
    function traverse(node: PrefixNode) {
      if (node.bindings && node.bindings.length > 0) {
        leaves.push(node);
      }
      
      if (node.children) {
        for (const child of node.children.values()) {
          traverse(child);
        }
      }
    }
    
    for (const root of roots.values()) {
      traverse(root);
    }
    
    return leaves;
  }
  
  /**
   * Get all nodes at a specific depth
   */
  static getNodesAtDepth(roots: Map<string, PrefixNode>, depth: number): PrefixNode[] {
    const nodes: PrefixNode[] = [];
    
    function traverse(node: PrefixNode, currentDepth: number) {
      if (currentDepth === depth) {
        nodes.push(node);
        return;
      }
      
      if (node.children) {
        for (const child of node.children.values()) {
          traverse(child, currentDepth + 1);
        }
      }
    }
    
    if (depth === 0) {
      return Array.from(roots.values());
    }
    
    for (const root of roots.values()) {
      traverse(root, 0);
    }
    
    return nodes;
  }
  
  /**
   * Find node by full key sequence
   */
  static findNode(roots: Map<string, PrefixNode>, keySequence: string): PrefixNode | undefined {
    const chords = KeybindingParser.parseKeySequence(keySequence);
    
    if (chords.length === 0) {
      return undefined;
    }
    
    // Find root
    const firstChordKey = this.normalizeChordKey(chords[0].raw);
    let currentNode = roots.get(firstChordKey);
    
    if (!currentNode) {
      return undefined;
    }
    
    // Traverse to find target node
    for (let i = 1; i < chords.length; i++) {
      const chordKey = this.normalizeChordKey(chords[i].raw);
      currentNode = currentNode.children.get(chordKey);
      
      if (!currentNode) {
        return undefined;
      }
    }
    
    return currentNode;
  }
  
  /**
   * Get statistics about the prefix tree
   */
  static getTreeStats(roots: Map<string, PrefixNode>): {
    totalNodes: number;
    maxDepth: number;
    multiChordCount: number;
    singleChordCount: number;
  } {
    let totalNodes = 0;
    let maxDepth = 0;
    let multiChordCount = 0;
    let singleChordCount = 0;
    
    function traverse(node: PrefixNode, depth: number) {
      totalNodes++;
      maxDepth = Math.max(maxDepth, depth);
      
      if (node.bindings && node.bindings.length > 0) {
        if (depth === 0) {
          singleChordCount += node.bindings.length;
        } else {
          multiChordCount += node.bindings.length;
        }
      }
      
      if (node.children) {
        for (const child of node.children.values()) {
          traverse(child, depth + 1);
        }
      }
    }
    
    for (const root of roots.values()) {
      traverse(root, 0);
    }
    
    return {
      totalNodes,
      maxDepth,
      multiChordCount,
      singleChordCount
    };
  }
  
  /**
   * Flatten tree to array of all bindings (for search/filtering)
   */
  static flattenTree(roots: Map<string, PrefixNode>): ParsedKeybinding[] {
    const bindings: ParsedKeybinding[] = [];
    
    function traverse(node: PrefixNode) {
      if (node.bindings && Array.isArray(node.bindings)) {
        bindings.push(...node.bindings);
      }
      
      if (node.children) {
        for (const child of node.children.values()) {
          traverse(child);
        }
      }
    }
    
    for (const root of roots.values()) {
      traverse(root);
    }
    
    return bindings;
  }
}
