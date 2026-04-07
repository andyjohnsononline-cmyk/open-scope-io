import type { ScopeResult } from '@openscope/core';
import type { ScopeAppearance, RenderOptions } from '../types.js';
import type { PipelineResources } from './gl-pipeline.js';
import type { GraticuleResources } from './gl-graticules.js';
import { uploadR32UI, uploadR32F, transposeColumnMajor } from './gl-textures.js';
import { runDensityPipeline } from './gl-pipeline.js';
import {
  drawGraticuleLines,
  waveformGraticuleLines,
  drawGraticuleLabels,
} from './gl-graticules.js';

export interface ParadeGLState {
  dataTextures: [WebGLTexture | null, WebGLTexture | null, WebGLTexture | null];
  gratLines: Float32Array | null;
  lastWidth: number;
  lastHeight: number;
  lastScale: string;
  lastLevel: string;
}

export function createParadeGLState(): ParadeGLState {
  return {
    dataTextures: [null, null, null],
    gratLines: null,
    lastWidth: 0,
    lastHeight: 0,
    lastScale: '',
    lastLevel: '',
  };
}

const CHANNEL_COLORS: Array<[number, number, number]> = [
  [1.0, 0.302, 0.302], // R #ff4d4d
  [0.0, 0.898, 0.600], // G #00e599
  [0.333, 0.600, 1.0], // B #5599ff
];

export function renderParadeGL(
  gl: WebGL2RenderingContext,
  pipeline: PipelineResources,
  graticule: GraticuleResources,
  state: ParadeGLState,
  result: ScopeResult,
  appearance: ScopeAppearance,
  viewport: [number, number, number, number],
  overlayCtx: CanvasRenderingContext2D | null,
  options?: RenderOptions,
): void {
  if (options?.yAxisScale === 'log') {
    console.warn('WebGL parade renderer does not support yAxisScale: "log". Falling back to linear.');
  }

  const [vx, vy, vw, vh] = viewport;
  const [totalCols, bins] = result.shape;
  const channelCols = totalCols / 3;
  const stride = channelCols * bins;
  const data = result.data;
  const channelWidth = Math.floor(vw / 3);

  for (let ch = 0; ch < 3; ch++) {
    const channelData = data.subarray(ch * stride, (ch + 1) * stride);
    const transposed = transposeColumnMajor(channelData, channelCols, bins);

    let maxVal = 0;
    for (let i = 0; i < transposed.length; i++) {
      if (transposed[i] > maxVal) maxVal = transposed[i];
    }

    const chViewport: [number, number, number, number] = [
      vx + ch * channelWidth,
      vy,
      ch < 2 ? channelWidth : vw - 2 * channelWidth,
      vh,
    ];

    const r32ui = uploadR32UI(gl, transposed, channelCols, bins, state.dataTextures[ch]);
    if (r32ui) {
      state.dataTextures[ch] = r32ui;
      runDensityPipeline(
        gl, pipeline, r32ui, false, maxVal,
        CHANNEL_COLORS[ch], appearance, chViewport,
      );
    } else {
      const r32f = uploadR32F(gl, transposed, channelCols, bins, state.dataTextures[ch]);
      if (r32f) {
        state.dataTextures[ch] = r32f.texture;
        runDensityPipeline(
          gl, pipeline, r32f.texture, true, r32f.maxVal,
          CHANNEL_COLORS[ch], appearance, chViewport,
        );
      }
    }
  }

  // Channel separator lines
  const sepLines = new Float32Array([
    channelWidth, 0, channelWidth, vh,
    channelWidth * 2, 0, channelWidth * 2, vh,
  ]);
  drawGraticuleLines(gl, graticule, sepLines, vw, vh, appearance);

  const wfScale = options?.waveformScale ?? 'percentage';
  const lvlMode = options?.levelMode ?? 'data';
  const needsRebuild = state.lastWidth !== vw || state.lastHeight !== vh
    || state.lastScale !== wfScale || state.lastLevel !== lvlMode;

  if (needsRebuild) {
    state.gratLines = waveformGraticuleLines(vw, vh, options);
    state.lastWidth = vw;
    state.lastHeight = vh;
    state.lastScale = wfScale;
    state.lastLevel = lvlMode;
  }
  if (state.gratLines) {
    drawGraticuleLines(gl, graticule, state.gratLines, vw, vh, appearance);
  }

  if (overlayCtx) {
    drawGraticuleLabels(overlayCtx, 'rgbParade', vw, vh, appearance, options);
  }
}
