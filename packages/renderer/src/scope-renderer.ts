import type { ScopeResult } from '@openscope/core';
import type { RenderOptions, ScopeRenderFn } from './types.js';
import { renderWaveform } from './render-waveform.js';
import { renderParade } from './render-parade.js';
import { renderVectorscope } from './render-vectorscope.js';
import { renderHistogram } from './render-histogram.js';
import { renderFalseColor } from './render-false-color.js';

const builtinRenderers = new Map<string, ScopeRenderFn>([
  ['waveform', renderWaveform],
  ['rgbParade', renderParade],
  ['vectorscope', renderVectorscope],
  ['histogram', renderHistogram],
  ['falseColor', renderFalseColor],
]);

/**
 * Renders scope results to Canvas 2D contexts.
 * Includes built-in renderers for all standard scopes;
 * custom renderers can be registered for plugin scopes.
 */
export class ScopeRenderer {
  private renderers = new Map<string, ScopeRenderFn>(builtinRenderers);

  /** Register a custom renderer for a scope type. */
  registerRenderer(scopeId: string, fn: ScopeRenderFn): void {
    this.renderers.set(scopeId, fn);
  }

  /** Render a single scope result to a canvas context. */
  render(
    ctx: CanvasRenderingContext2D,
    result: ScopeResult,
    options?: RenderOptions,
  ): void {
    const fn = this.renderers.get(result.scopeId);
    if (!fn) {
      this.renderPlaceholder(ctx, result.scopeId);
      return;
    }
    fn(ctx, result, options);
  }

  /** Render all results to their respective canvases. */
  renderAll(
    canvases: Map<string, CanvasRenderingContext2D>,
    results: Map<string, ScopeResult>,
    options?: RenderOptions,
  ): void {
    for (const [id, result] of results) {
      const ctx = canvases.get(id);
      if (ctx) this.render(ctx, result, options);
    }
  }

  /** Check whether a renderer exists for a given scope. */
  hasRenderer(scopeId: string): boolean {
    return this.renderers.has(scopeId);
  }

  private renderPlaceholder(ctx: CanvasRenderingContext2D, scopeId: string): void {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#666';
    ctx.font = '14px monospace';
    ctx.fillText(`No renderer for "${scopeId}"`, 10, height / 2);
  }
}
