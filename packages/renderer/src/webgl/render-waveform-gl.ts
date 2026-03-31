import type { ScopeResult } from '@openscope/core';
import type { ScopeAppearance } from '../types.js';
import { parseHexColor } from '../types.js';
import type { PipelineResources } from './gl-pipeline.js';
import type { GraticuleResources } from './gl-graticules.js';
import { uploadR32UI, uploadR32F, transposeColumnMajor } from './gl-textures.js';
import { runDensityPipeline } from './gl-pipeline.js';
import {
  drawGraticuleLines,
  waveformGraticuleLines,
  drawGraticuleLabels,
} from './gl-graticules.js';

export interface WaveformGLState {
  dataTexture: WebGLTexture | null;
  gratLines: Float32Array | null;
  lastWidth: number;
  lastHeight: number;
}

export function createWaveformGLState(): WaveformGLState {
  return {
    dataTexture: null,
    gratLines: null,
    lastWidth: 0,
    lastHeight: 0,
  };
}

/**
 * Render a waveform scope using the density pipeline.
 *
 * Supports two modes:
 * - 'luma': single-channel white trace from waveform ScopeResult
 * - 'rgb': three overlapping R/G/B traces from rgbParade ScopeResult
 */
export function renderWaveformGL(
  gl: WebGL2RenderingContext,
  pipeline: PipelineResources,
  graticule: GraticuleResources,
  state: WaveformGLState,
  result: ScopeResult,
  appearance: ScopeAppearance,
  viewport: [number, number, number, number],
  overlayCtx: CanvasRenderingContext2D | null,
  mode: 'luma' | 'rgb' = 'luma',
): void {
  const [, , vw, vh] = viewport;
  const [dataCols, bins] = result.shape;
  const data = result.data;

  if (mode === 'rgb') {
    const channelCols = dataCols / 3;
    const stride = channelCols * bins;

    const colors: Array<[number, number, number]> = [
      [1.0, 0.302, 0.302], // #ff4d4d
      [0.0, 0.898, 0.600], // #00e599
      [0.333, 0.600, 1.0], // #5599ff
    ];

    // Pre-clear framebuffer with background; each channel composites additively on top
    const [bgR, bgG, bgB] = parseHexColor(appearance.background);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(...viewport);
    gl.clearColor(bgR / 255, bgG / 255, bgB / 255, 1.0);
    gl.scissor(...viewport);
    gl.enable(gl.SCISSOR_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);

    for (let ch = 0; ch < 3; ch++) {
      const channelData = data.subarray(ch * stride, (ch + 1) * stride);
      const transposed = transposeColumnMajor(channelData, channelCols, bins);

      let maxVal = 0;
      for (let i = 0; i < transposed.length; i++) {
        if (transposed[i] > maxVal) maxVal = transposed[i];
      }

      const r32ui = uploadR32UI(gl, transposed, channelCols, bins, state.dataTexture);
      if (r32ui) {
        state.dataTexture = r32ui;
        runDensityPipeline(gl, pipeline, r32ui, false, maxVal, colors[ch], appearance, viewport, true);
      } else {
        const r32f = uploadR32F(gl, transposed, channelCols, bins, state.dataTexture);
        if (r32f) {
          state.dataTexture = r32f.texture;
          runDensityPipeline(gl, pipeline, r32f.texture, true, r32f.maxVal, colors[ch], appearance, viewport, true);
        }
      }
    }
  } else {
    // Transpose from column-major (data[col * bins + bin]) to row-major for texImage2D
    const transposed = transposeColumnMajor(data, dataCols, bins);

    let maxVal = 0;
    for (let i = 0; i < transposed.length; i++) {
      if (transposed[i] > maxVal) maxVal = transposed[i];
    }

    const whiteColor: [number, number, number] = [0.91, 0.91, 0.922]; // #e8e8eb

    const r32ui = uploadR32UI(gl, transposed, dataCols, bins, state.dataTexture);
    if (r32ui) {
      state.dataTexture = r32ui;
      runDensityPipeline(gl, pipeline, r32ui, false, maxVal, whiteColor, appearance, viewport);
    } else {
      const r32f = uploadR32F(gl, transposed, dataCols, bins, state.dataTexture);
      if (r32f) {
        state.dataTexture = r32f.texture;
        runDensityPipeline(gl, pipeline, r32f.texture, true, r32f.maxVal, whiteColor, appearance, viewport);
      }
    }
  }

  // Graticule lines
  if (state.lastWidth !== vw || state.lastHeight !== vh) {
    state.gratLines = waveformGraticuleLines(vw, vh);
    state.lastWidth = vw;
    state.lastHeight = vh;
  }
  if (state.gratLines) {
    drawGraticuleLines(gl, graticule, state.gratLines, vw, vh, appearance);
  }

  // Text labels on 2D overlay
  if (overlayCtx) {
    drawGraticuleLabels(overlayCtx, 'waveform', vw, vh, appearance);
  }
}
