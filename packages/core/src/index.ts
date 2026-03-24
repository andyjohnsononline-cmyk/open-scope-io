export type {
  ScopeResult,
  ScopePlugin,
  PixelData,
  FrameSource,
  Pipeline,
  PipelineOptions,
} from './types.js';

export { PluginRegistry } from './registry.js';
export { CpuPipeline, createCpuPipeline } from './cpu-pipeline.js';
export { GpuPipeline } from './gpu-pipeline.js';

import type { Pipeline, PipelineOptions } from './types.js';
import { GpuPipeline } from './gpu-pipeline.js';
import { CpuPipeline } from './cpu-pipeline.js';

/**
 * Create a scope analysis pipeline. Attempts WebGPU first,
 * falls back to CPU-only mode.
 */
export async function createPipeline(
  options?: PipelineOptions,
): Promise<Pipeline> {
  if (!options?.forceCpu && typeof navigator !== 'undefined' && navigator.gpu) {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      const device = await adapter.requestDevice();
      return new GpuPipeline(device);
    }
  }
  return new CpuPipeline();
}
