import type { ScopeResult } from '@openscope/core';
import type { ScopeAppearance } from '../types.js';
import type { GraticuleResources } from './gl-graticules.js';
import { parseHexColor } from '../types.js';
import { createProgram } from './gl-utils.js';
import {
  drawGraticuleLines,
  histogramGraticuleLines,
  drawGraticuleLabels,
} from './gl-graticules.js';
import { HISTOGRAM_VERT, GRATICULE_FRAG } from './shaders.js';

export interface HistogramGLState {
  program: WebGLProgram | null;
  buffer: WebGLBuffer | null;
  vao: WebGLVertexArrayObject | null;
  gratLines: Float32Array | null;
  lastWidth: number;
  lastHeight: number;
}

export function createHistogramGLState(): HistogramGLState {
  return {
    program: null,
    buffer: null,
    vao: null,
    gratLines: null,
    lastWidth: 0,
    lastHeight: 0,
  };
}

export function initHistogramGL(
  gl: WebGL2RenderingContext,
  state: HistogramGLState,
): boolean {
  const program = createProgram(gl, HISTOGRAM_VERT, GRATICULE_FRAG);
  if (!program) return false;

  const buffer = gl.createBuffer();
  const vao = gl.createVertexArray();
  if (!buffer || !vao) return false;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const posLoc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  state.program = program;
  state.buffer = buffer;
  state.vao = vao;
  return true;
}

/**
 * Histogram uses geometry-based rendering (filled triangle strips for channels,
 * line strip for luma). No density pipeline needed.
 */
export function renderHistogramGL(
  gl: WebGL2RenderingContext,
  graticule: GraticuleResources,
  state: HistogramGLState,
  result: ScopeResult,
  appearance: ScopeAppearance,
  viewport: [number, number, number, number],
  overlayCtx: CanvasRenderingContext2D | null,
): void {
  const [vx, vy, vw, vh] = viewport;

  if (!state.program || !state.buffer || !state.vao) {
    if (!initHistogramGL(gl, state)) return;
  }

  // Clear viewport with background
  gl.viewport(vx, vy, vw, vh);
  const [bgR, bgG, bgB] = parseHexColor(appearance.background);
  gl.clearColor(bgR / 255, bgG / 255, bgB / 255, 1.0);
  gl.scissor(vx, vy, vw, vh);
  gl.enable(gl.SCISSOR_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);

  const bins = 256;
  const data = result.data;

  // Find per-channel max for normalization
  const channelMax = [0, 0, 0, 0];
  for (let ch = 0; ch < 4; ch++) {
    for (let b = 0; b < bins; b++) {
      const v = data[ch * bins + b];
      if (v > channelMax[ch]) channelMax[ch] = v;
    }
  }

  const padding = 4;
  const drawW = vw - padding * 2;
  const drawH = vh - padding * 2;

  // Draw channel fills: B (back) → G → R (front), per plan
  const channelOrder = [2, 1, 0]; // B, G, R
  const channelColors: Array<[number, number, number, number]> = [
    [1.0, 0.302, 0.302, 0.5], // R
    [0.0, 0.898, 0.600, 0.5], // G
    [0.333, 0.600, 1.0, 0.5], // B
  ];

  gl.useProgram(state.program!);
  gl.bindVertexArray(state.vao!);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  for (const ch of channelOrder) {
    const maxVal = channelMax[ch];
    if (maxVal === 0) continue;

    // Build triangle strip for filled area
    const verts: number[] = [];
    for (let b = 0; b < bins; b++) {
      const xNorm = padding / vw + (b / (bins - 1)) * (drawW / vw);
      const x = xNorm * 2.0 - 1.0;

      const count = data[ch * bins + b];
      const h = Math.log(count + 1) / Math.log(maxVal + 1);

      const yBottom = -1.0 + (padding / vh) * 2.0;
      const yTop = yBottom + h * (drawH / vh) * 2.0;

      verts.push(x, yBottom);
      verts.push(x, yTop);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer!);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);

    const [r, g, b, a] = channelColors[ch];
    gl.uniform4f(gl.getUniformLocation(state.program!, 'uColor'), r, g, b, a);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 2);
  }

  // Draw luma as a line strip on top
  const lumaMax = channelMax[3];
  if (lumaMax > 0) {
    const lumaVerts: number[] = [];
    for (let b = 0; b < bins; b++) {
      const xNorm = padding / vw + (b / (bins - 1)) * (drawW / vw);
      const x = xNorm * 2.0 - 1.0;

      const count = data[3 * bins + b];
      const h = Math.log(count + 1) / Math.log(lumaMax + 1);

      const yBottom = -1.0 + (padding / vh) * 2.0;
      const y = yBottom + h * (drawH / vh) * 2.0;

      lumaVerts.push(x, y);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer!);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lumaVerts), gl.DYNAMIC_DRAW);

    gl.uniform4f(gl.getUniformLocation(state.program!, 'uColor'), 0.91, 0.91, 0.922, 0.8);
    gl.drawArrays(gl.LINE_STRIP, 0, lumaVerts.length / 2);
  }

  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);

  // Graticule
  if (state.lastWidth !== vw || state.lastHeight !== vh) {
    state.gratLines = histogramGraticuleLines(vw, vh);
    state.lastWidth = vw;
    state.lastHeight = vh;
  }
  if (state.gratLines) {
    drawGraticuleLines(gl, graticule, state.gratLines, vw, vh, appearance);
  }

  if (overlayCtx) {
    drawGraticuleLabels(overlayCtx, 'histogram', vw, vh, appearance);
  }
}
