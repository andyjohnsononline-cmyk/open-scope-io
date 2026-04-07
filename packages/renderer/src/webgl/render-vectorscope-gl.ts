import type { ScopeResult } from '@openscope/core';
import { type ScopeAppearance, type RenderOptions, parseHexColor } from '../types.js';
import type { PipelineResources } from './gl-pipeline.js';
import type { GraticuleResources } from './gl-graticules.js';
import { uploadR32UI, uploadR32F } from './gl-textures.js';
import { runDensityPipeline } from './gl-pipeline.js';
import {
  drawGraticuleLines,
  vectorscopeGraticuleLines,
  vectorscopeTargetLines,
  vectorscopeSkinToneLine,
  drawGraticuleLabels,
} from './gl-graticules.js';

export interface VectorscopeGLState {
  dataTexture: WebGLTexture | null;
  gratLines: Float32Array | null;
  targetLines: Float32Array | null;
  skinLine: Float32Array | null;
  lastWidth: number;
  lastHeight: number;
  lastStyle: string;
  lastTargets: string;
}

export function createVectorscopeGLState(): VectorscopeGLState {
  return {
    dataTexture: null,
    gratLines: null,
    targetLines: null,
    skinLine: null,
    lastWidth: 0,
    lastHeight: 0,
    lastStyle: '',
    lastTargets: '',
  };
}

/**
 * Render vectorscope using density pipeline with bilinear filtering.
 */
export function renderVectorscopeGL(
  gl: WebGL2RenderingContext,
  pipeline: PipelineResources,
  graticule: GraticuleResources,
  state: VectorscopeGLState,
  result: ScopeResult,
  appearance: ScopeAppearance,
  viewport: [number, number, number, number],
  overlayCtx: CanvasRenderingContext2D | null,
  options?: RenderOptions,
): void {
  const [vx, vy, vw, vh] = viewport;
  const [gridW, gridH] = result.shape;
  const data = result.data;

  const [bgR, bgG, bgB] = parseHexColor(appearance.background);
  gl.viewport(vx, vy, vw, vh);
  gl.scissor(vx, vy, vw, vh);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(bgR / 255, bgG / 255, bgB / 255, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);

  const squareSize = Math.min(vw, vh);
  const sqX = vx + Math.floor((vw - squareSize) / 2);
  const sqY = vy + Math.floor((vh - squareSize) / 2);
  const squareViewport: [number, number, number, number] = [sqX, sqY, squareSize, squareSize];

  let maxVal = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
  }

  const traceColor: [number, number, number] = [0.7, 0.9, 0.7];

  const r32f = uploadR32F(gl, data, gridW, gridH, state.dataTexture);
  if (r32f) {
    state.dataTexture = r32f.texture;
    runDensityPipeline(
      gl, pipeline, r32f.texture, true, r32f.maxVal,
      traceColor, appearance, squareViewport,
    );
  } else {
    const r32ui = uploadR32UI(gl, data, gridW, gridH, state.dataTexture);
    if (r32ui) {
      state.dataTexture = r32ui;
      runDensityPipeline(
        gl, pipeline, r32ui, false, maxVal,
        traceColor, appearance, squareViewport,
      );
    }
  }

  gl.viewport(vx, vy, vw, vh);

  const style = options?.vectorscopeStyle ?? 'standard';
  const targets = options?.vectorscopeTargets ?? '75';
  const needsRebuild = state.lastWidth !== vw || state.lastHeight !== vh
    || state.lastStyle !== style || state.lastTargets !== targets;

  if (needsRebuild) {
    state.gratLines = vectorscopeGraticuleLines(vw, vh, options);
    state.targetLines = vectorscopeTargetLines(vw, vh, options);
    state.skinLine = vectorscopeSkinToneLine(vw, vh, options);
    state.lastWidth = vw;
    state.lastHeight = vh;
    state.lastStyle = style;
    state.lastTargets = targets;
  }

  if (state.gratLines && state.gratLines.length > 0) {
    drawGraticuleLines(gl, graticule, state.gratLines, vw, vh, appearance);
  }

  if (state.skinLine && state.skinLine.length > 0) {
    const skinApp = { ...appearance, graticule: { ...appearance.graticule, lineColor: '#ffc896' } };
    drawGraticuleLines(gl, graticule, state.skinLine, vw, vh, skinApp);
  }

  if (state.targetLines && state.targetLines.length > 0) {
    drawGraticuleLines(gl, graticule, state.targetLines, vw, vh, appearance);
  }

  if (overlayCtx) {
    drawGraticuleLabels(overlayCtx, 'vectorscope', vw, vh, appearance, options);
  }
}
