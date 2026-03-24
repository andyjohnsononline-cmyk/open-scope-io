import { PluginRegistry } from './registry.js';
import type { FrameSource, Pipeline, PixelData, ScopeResult } from './types.js';
import type { ScopePlugin } from './types.js';

export class CpuPipeline implements Pipeline {
  readonly mode = 'cpu' as const;
  private registry = new PluginRegistry();

  register(plugin: ScopePlugin): void {
    this.registry.register(plugin);
  }

  async analyze(
    frame: FrameSource,
    scopeIds?: string[],
  ): Promise<Map<string, ScopeResult>> {
    const ids = scopeIds ?? this.registry.getIds();
    const pixels = this.toPixelData(frame);
    const results = new Map<string, ScopeResult>();

    for (const id of ids) {
      const plugin = this.registry.get(id);
      if (!plugin?.analyzeCpu) {
        console.warn(`Scope "${id}" has no CPU implementation — skipping`);
        continue;
      }
      results.set(id, plugin.analyzeCpu(pixels.data, pixels.width, pixels.height));
    }

    return results;
  }

  destroy(): void {
    // No GPU resources to clean up
  }

  private toPixelData(frame: FrameSource): PixelData {
    if ('data' in frame && 'width' in frame && 'height' in frame) {
      return frame as PixelData;
    }
    throw new Error(
      'CpuPipeline only accepts PixelData ({ data, width, height }). ' +
      'Use createImageBitmap + canvas.getImageData to extract pixels from browser sources.',
    );
  }
}

/**
 * Create a CPU-only pipeline. Works in both browser and Node.js.
 */
export function createCpuPipeline(): CpuPipeline {
  return new CpuPipeline();
}
