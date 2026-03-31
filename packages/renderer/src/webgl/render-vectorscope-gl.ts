import type { ScopeResult } from '@openscope/core';
import { type ScopeAppearance, parseHexColor } from '../types.js';
import type { PipelineResources } from './gl-pipeline.js';
import type { GraticuleResources } from './gl-graticules.js';
import { uploadR32UI, uploadR32F } from './gl-textures.js';
import { runDensityPipeline } from './gl-pipeline.js';
import {
  drawGraticuleLines,
  vectorscopeGraticuleLines,
  drawGraticuleLabels,
} from './gl-graticules.js';

export interface VectorscopeGLState {
  dataTexture: WebGLTexture | null;
  gratLines: Float32Array | null;
  lastWidth: number;
  lastHeight: number;
}

export function createVectorscopeGLState(): VectorscopeGLState {
  return {
    dataTexture: null,
    gratLines: null,
    lastWidth: 0,
    lastHeight: 0,
  };
}

/**
 * Render vectorscope using density pipeline with bilinear filtering.
 *
 * The vectorscope data is a 512x512 (or similar) grid of counts.
 * Uploading as a texture with LINEAR filtering provides free anti-aliasing.
 * The trace color is white; the actual hue-mapping could be done via a
 * colorize shader pass, but for v1 we use a uniform color and rely on
 * additive blending for density visualization.
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
): void {
  const [vx, vy, vw, vh] = viewport;
  const [gridW, gridH] = result.shape;
  const data = result.data;

  // Clear the full canvas with background so areas outside the square are clean
  const [bgR, bgG, bgB] = parseHexColor(appearance.background);
  gl.viewport(vx, vy, vw, vh);
  gl.scissor(vx, vy, vw, vh);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(bgR / 255, bgG / 255, bgB / 255, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);

  // Inscribe the square density plot within the canvas, matching the
  // Canvas 2D renderer's circle-inscribed approach
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

  // Reset viewport to full canvas for graticule overlay
  gl.viewport(vx, vy, vw, vh);

  if (state.lastWidth !== vw || state.lastHeight !== vh) {
    state.gratLines = vectorscopeGraticuleLines(vw, vh);
    state.lastWidth = vw;
    state.lastHeight = vh;
  }
  if (state.gratLines) {
    drawGraticuleLines(gl, graticule, state.gratLines, vw, vh, appearance);
  }

  // Skin tone line
  const cx = vw / 2;
  const cy = vh / 2;
  const radius = Math.min(vw, vh) / 2 - 10;
  const skinAngle = (123 * Math.PI) / 180;
  const skinLine = new Float32Array([
    cx, cy,
    cx + Math.cos(skinAngle) * radius,
    cy - Math.sin(skinAngle) * radius,
  ]);

  // Custom skin-tone line color
  const skinApp = { ...appearance, graticule: { ...appearance.graticule, lineColor: '#ffc896' } };
  drawGraticuleLines(gl, graticule, skinLine, vw, vh, skinApp);

  // Primary target boxes (drawn as small crosses via lines)
  const targets = [
    { angle: 103, dist: 0.63 },
    { angle: 241, dist: 0.56 },
    { angle: 347, dist: 0.59 },
    { angle: 167, dist: 0.44 },
    { angle: 283, dist: 0.47 },
    { angle: 61, dist: 0.59 },
  ];
  const boxVerts: number[] = [];
  for (const t of targets) {
    const a = (t.angle * Math.PI) / 180;
    const x = cx + Math.cos(a) * radius * t.dist;
    const y = cy - Math.sin(a) * radius * t.dist;
    const s = 4;
    boxVerts.push(x - s, y - s, x + s, y - s);
    boxVerts.push(x + s, y - s, x + s, y + s);
    boxVerts.push(x + s, y + s, x - s, y + s);
    boxVerts.push(x - s, y + s, x - s, y - s);
  }
  drawGraticuleLines(gl, graticule, new Float32Array(boxVerts), vw, vh, appearance);

  if (overlayCtx) {
    drawGraticuleLabels(overlayCtx, 'vectorscope', vw, vh, appearance);
  }
}
