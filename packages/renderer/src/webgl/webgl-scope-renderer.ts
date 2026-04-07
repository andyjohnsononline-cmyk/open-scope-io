import type { ScopeResult } from '@openscope/core';
import {
  type ScopeAppearance,
  type RenderOptions,
  DEFAULT_APPEARANCE,
} from '../types.js';
import { createWebGL2Context, resetGLState } from './gl-utils.js';
import {
  createPipelineResources,
  resizePipelineFBOs,
  destroyPipelineResources,
  type PipelineResources,
} from './gl-pipeline.js';
import {
  createGraticuleResources,
  destroyGraticuleResources,
  type GraticuleResources,
} from './gl-graticules.js';
import {
  createWaveformGLState,
  renderWaveformGL,
  type WaveformGLState,
} from './render-waveform-gl.js';
import {
  createParadeGLState,
  renderParadeGL,
  type ParadeGLState,
} from './render-parade-gl.js';
import {
  createVectorscopeGLState,
  renderVectorscopeGL,
  type VectorscopeGLState,
} from './render-vectorscope-gl.js';
import {
  createHistogramGLState,
  renderHistogramGL,
  type HistogramGLState,
} from './render-histogram-gl.js';
import {
  createFalseColorGLState,
  renderFalseColorGL,
  type FalseColorGLState,
} from './render-false-color-gl.js';

interface ScopeContext {
  canvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement | null;
  gl: WebGL2RenderingContext;
  overlayCtx: CanvasRenderingContext2D | null;
  pipeline: PipelineResources;
  graticule: GraticuleResources;
  waveformState: WaveformGLState;
  paradeState: ParadeGLState;
  vectorscopeState: VectorscopeGLState;
  histogramState: HistogramGLState;
  falseColorState: FalseColorGLState;
}

export type WaveformMode = 'luma' | 'rgb';

export class WebGlScopeRenderer {
  private scopes = new Map<string, ScopeContext>();
  private appearance: ScopeAppearance;
  private _contextLost = false;
  private _waveformMode: WaveformMode = 'luma';

  onContextLost?: () => void;
  onContextRestored?: () => void;

  constructor(appearance?: Partial<ScopeAppearance>) {
    this.appearance = mergeAppearance(appearance);
  }

  get contextLost(): boolean {
    return this._contextLost;
  }

  get waveformMode(): WaveformMode {
    return this._waveformMode;
  }

  set waveformMode(mode: WaveformMode) {
    this._waveformMode = mode;
  }

  /**
   * Initialize a scope canvas with WebGL2.
   * @returns true if WebGL2 was successfully created
   */
  initScope(
    scopeId: string,
    canvas: HTMLCanvasElement,
    overlayCanvas?: HTMLCanvasElement,
  ): boolean {
    const gl = createWebGL2Context(canvas);
    if (!gl) return false;

    const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
    const rect = canvas.parentElement?.getBoundingClientRect() ?? canvas.getBoundingClientRect();
    const w = Math.max(Math.floor(rect.width * dpr), 1);
    const h = Math.max(Math.floor(rect.height * dpr), 1);
    canvas.width = w;
    canvas.height = h;

    if (overlayCanvas) {
      overlayCanvas.width = w;
      overlayCanvas.height = h;
    }

    const pipeline = createPipelineResources(gl, w, h);
    if (!pipeline) {
      console.warn(`Failed to create pipeline for scope ${scopeId}`);
      return false;
    }

    const graticule = createGraticuleResources(gl);
    if (!graticule) {
      destroyPipelineResources(gl, pipeline);
      return false;
    }

    const overlayCtx = overlayCanvas?.getContext('2d') ?? null;

    const ctx: ScopeContext = {
      canvas,
      overlayCanvas: overlayCanvas ?? null,
      gl,
      overlayCtx,
      pipeline,
      graticule,
      waveformState: createWaveformGLState(),
      paradeState: createParadeGLState(),
      vectorscopeState: createVectorscopeGLState(),
      histogramState: createHistogramGLState(),
      falseColorState: createFalseColorGLState(),
    };

    this.scopes.set(scopeId, ctx);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._contextLost = true;
      this.onContextLost?.();
    });

    canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      this.reinitScope(scopeId);
      this.onContextRestored?.();
    });

    return true;
  }

  /** Resize a scope's canvas and FBOs to match its container. */
  resizeScope(scopeId: string): void {
    const ctx = this.scopes.get(scopeId);
    if (!ctx) return;

    const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
    const rect = ctx.canvas.parentElement?.getBoundingClientRect()
      ?? ctx.canvas.getBoundingClientRect();
    const w = Math.max(Math.floor(rect.width * dpr), 1);
    const h = Math.max(Math.floor(rect.height * dpr), 1);

    if (ctx.canvas.width === w && ctx.canvas.height === h) return;

    ctx.canvas.width = w;
    ctx.canvas.height = h;

    if (ctx.overlayCanvas) {
      ctx.overlayCanvas.width = w;
      ctx.overlayCanvas.height = h;
    }

    resizePipelineFBOs(ctx.gl, ctx.pipeline, w, h);
  }

  /** Resize all registered scopes. */
  resizeAll(): void {
    for (const id of this.scopes.keys()) {
      this.resizeScope(id);
    }
  }

  /** Render a single scope result. */
  render(scopeId: string, result: ScopeResult, options?: RenderOptions): void {
    const ctx = this.scopes.get(scopeId);
    if (!ctx || this._contextLost) return;

    const { gl, canvas, pipeline, graticule, overlayCtx } = ctx;
    const w = canvas.width;
    const h = canvas.height;
    const viewport: [number, number, number, number] = [0, 0, w, h];

    resetGLState(gl);
    gl.viewport(0, 0, w, h);

    const appearance = this.appearance;

    switch (result.scopeId) {
      case 'waveform':
        renderWaveformGL(
          gl, pipeline, graticule, ctx.waveformState,
          result, appearance, viewport, overlayCtx,
          this._waveformMode, options,
        );
        break;

      case 'rgbParade':
        renderParadeGL(
          gl, pipeline, graticule, ctx.paradeState,
          result, appearance, viewport, overlayCtx,
          options,
        );
        break;

      case 'vectorscope':
        renderVectorscopeGL(
          gl, pipeline, graticule, ctx.vectorscopeState,
          result, appearance, viewport, overlayCtx,
          options,
        );
        break;

      case 'histogram':
        renderHistogramGL(
          gl, graticule, ctx.histogramState,
          result, appearance, viewport, overlayCtx,
        );
        break;

      case 'falseColor':
        renderFalseColorGL(
          gl, ctx.falseColorState,
          result, appearance, options, viewport, overlayCtx,
        );
        break;

      default:
        console.warn(`WebGlScopeRenderer: unknown scopeId "${result.scopeId}"`);
    }
  }

  /** Render all scope results from a result map. */
  renderAll(results: Map<string, ScopeResult>, options?: RenderOptions): void {
    for (const [id, result] of results) {
      if (this.scopes.has(id)) {
        this.render(id, result, options);
      }
    }
  }

  /** Check if a scope is initialized. */
  hasScope(scopeId: string): boolean {
    return this.scopes.has(scopeId);
  }

  /** Clean up all WebGL resources. */
  destroy(): void {
    for (const [, ctx] of this.scopes) {
      const { gl } = ctx;
      destroyPipelineResources(gl, ctx.pipeline);
      destroyGraticuleResources(gl, ctx.graticule);

      if (ctx.waveformState.dataTexture) gl.deleteTexture(ctx.waveformState.dataTexture);
      for (const tex of ctx.paradeState.dataTextures) {
        if (tex) gl.deleteTexture(tex);
      }
      if (ctx.vectorscopeState.dataTexture) gl.deleteTexture(ctx.vectorscopeState.dataTexture);

      if (ctx.histogramState.program) gl.deleteProgram(ctx.histogramState.program);
      if (ctx.histogramState.buffer) gl.deleteBuffer(ctx.histogramState.buffer);
      if (ctx.histogramState.vao) gl.deleteVertexArray(ctx.histogramState.vao);

      if (ctx.falseColorState.program) gl.deleteProgram(ctx.falseColorState.program);
      if (ctx.falseColorState.vao) gl.deleteVertexArray(ctx.falseColorState.vao);
      if (ctx.falseColorState.frameTexture) gl.deleteTexture(ctx.falseColorState.frameTexture);
    }
    this.scopes.clear();
  }

  private reinitScope(scopeId: string): void {
    const ctx = this.scopes.get(scopeId);
    if (!ctx) return;

    const { gl, canvas } = ctx;
    const w = canvas.width;
    const h = canvas.height;

    const pipeline = createPipelineResources(gl, w, h);
    const graticule = createGraticuleResources(gl);
    if (pipeline && graticule) {
      ctx.pipeline = pipeline;
      ctx.graticule = graticule;
      ctx.waveformState = createWaveformGLState();
      ctx.paradeState = createParadeGLState();
      ctx.vectorscopeState = createVectorscopeGLState();
      ctx.histogramState = createHistogramGLState();
      ctx.falseColorState = createFalseColorGLState();
    }
  }
}

function mergeAppearance(
  partial?: Partial<ScopeAppearance>,
): ScopeAppearance {
  if (!partial) return { ...DEFAULT_APPEARANCE };
  return {
    intensity: { ...DEFAULT_APPEARANCE.intensity, ...partial.intensity },
    blur: { ...DEFAULT_APPEARANCE.blur, ...partial.blur },
    glow: { ...DEFAULT_APPEARANCE.glow, ...partial.glow },
    graticule: { ...DEFAULT_APPEARANCE.graticule, ...partial.graticule },
    background: partial.background ?? DEFAULT_APPEARANCE.background,
  };
}
