/**
 * Result of scope analysis on a single frame.
 */
export interface ScopeResult {
  scopeId: string;
  /** Raw numeric data — shape depends on scope type */
  data: Uint32Array;
  /** Scope-specific metadata (min/max IRE, clipping flags, etc.) */
  metadata: Record<string, number | boolean | string>;
  /** Dimensions of the data buffer: [columns, rows] or [channels, bins] */
  shape: [number, number];
}

/**
 * Raw pixel data for CPU analysis or GPU upload.
 */
export interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Frame input accepted by the pipeline. Browser sources are converted
 * to GPU textures efficiently; PixelData works everywhere including Node.js.
 */
export type FrameSource = ImageBitmap | PixelData;

/**
 * Core abstraction for adding new scope types.
 *
 * All built-in shaders follow a standard bind group convention:
 *   @group(0) @binding(0) var inputTexture: texture_2d<f32>;
 *   @group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;
 */
export interface ScopePlugin {
  /** Unique identifier (e.g. 'waveform', 'vectorscope') */
  id: string;
  /** Human-readable name */
  name: string;

  // --- GPU path (browser) ---

  /** WGSL compute shader source */
  shader?: string;
  /** Size of output buffer in u32 elements for a given frame size */
  getBufferSize?(width: number, height: number): number;
  /** Convert raw GPU output buffer to a structured ScopeResult */
  parseResult?(data: Uint32Array, width: number, height: number): ScopeResult;

  // --- CPU path (Node.js CLI, fallback) ---

  /** Pure TypeScript analysis — no GPU required */
  analyzeCpu?(pixels: Uint8ClampedArray, width: number, height: number): ScopeResult;
}

/**
 * Options for pipeline creation.
 */
export interface PipelineOptions {
  /** Force CPU-only mode even when WebGPU is available */
  forceCpu?: boolean;
}

/**
 * Unified pipeline interface for scope analysis.
 */
export interface Pipeline {
  readonly mode: 'gpu' | 'cpu';
  register(plugin: ScopePlugin): void;
  analyze(frame: FrameSource, scopeIds?: string[]): Promise<Map<string, ScopeResult>>;
  destroy(): void;
}
