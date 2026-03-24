import type { ScopePlugin } from './types.js';

export class PluginRegistry {
  private plugins = new Map<string, ScopePlugin>();

  register(plugin: ScopePlugin): void {
    if (!plugin.id) throw new Error('ScopePlugin must have an id');
    if (!plugin.shader && !plugin.analyzeCpu) {
      throw new Error(`ScopePlugin "${plugin.id}" must implement at least shader (GPU) or analyzeCpu (CPU)`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): ScopePlugin | undefined {
    return this.plugins.get(id);
  }

  getAll(): ScopePlugin[] {
    return Array.from(this.plugins.values());
  }

  getIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }
}
