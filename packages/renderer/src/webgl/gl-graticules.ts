import type { ScopeAppearance } from '../types.js';
import { parseHexColor } from '../types.js';
import { createProgram } from './gl-utils.js';
import { GRATICULE_VERT, GRATICULE_FRAG } from './shaders.js';

export interface GraticuleResources {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
}

export function createGraticuleResources(
  gl: WebGL2RenderingContext,
): GraticuleResources | null {
  const program = createProgram(gl, GRATICULE_VERT, GRATICULE_FRAG);
  if (!program) return null;

  const buffer = gl.createBuffer();
  const vao = gl.createVertexArray();
  if (!buffer || !vao) return null;

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const posLoc = gl.getAttribLocation(program, 'aPosition');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  return { program, buffer, vao };
}

export function drawGraticuleLines(
  gl: WebGL2RenderingContext,
  res: GraticuleResources,
  lines: Float32Array,
  w: number,
  h: number,
  appearance: ScopeAppearance,
): void {
  if (lines.length === 0) return;

  gl.useProgram(res.program);
  gl.bindVertexArray(res.vao);

  gl.bindBuffer(gl.ARRAY_BUFFER, res.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, lines, gl.DYNAMIC_DRAW);

  gl.uniform2f(gl.getUniformLocation(res.program, 'uResolution'), w, h);

  const [r, g, b] = parseHexColor(appearance.graticule.lineColor);
  gl.uniform4f(
    gl.getUniformLocation(res.program, 'uColor'),
    r / 255,
    g / 255,
    b / 255,
    0.6,
  );

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.drawArrays(gl.LINES, 0, lines.length / 2);

  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

/** Generate waveform/parade IRE graticule line data. */
export function waveformGraticuleLines(w: number, h: number): Float32Array {
  const levels = [0, 25, 50, 75, 100];
  const verts: number[] = [];
  for (const ire of levels) {
    const y = h - (ire / 100) * h;
    verts.push(0, y, w, y);
  }
  return new Float32Array(verts);
}

/** Generate vectorscope graticule line data (circle, 75%, crosshairs). */
export function vectorscopeGraticuleLines(w: number, h: number): Float32Array {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 10;
  const verts: number[] = [];

  // Crosshairs
  verts.push(cx - radius, cy, cx + radius, cy);
  verts.push(cx, cy - radius, cx, cy + radius);

  // Circles approximated as line segments
  const segments = 64;
  for (const r of [radius, radius * 0.75]) {
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      verts.push(
        cx + Math.cos(a1) * r,
        cy + Math.sin(a1) * r,
        cx + Math.cos(a2) * r,
        cy + Math.sin(a2) * r,
      );
    }
  }

  return new Float32Array(verts);
}

/** Generate histogram axis graticule line data. */
export function histogramGraticuleLines(w: number, h: number): Float32Array {
  const padding = 4;
  const drawW = w - padding * 2;
  const verts: number[] = [];

  // Bottom axis
  verts.push(padding, h - padding, padding + drawW, h - padding);

  // Tick marks at 0, 64, 128, 192, 255
  for (const val of [0, 64, 128, 192, 255]) {
    const x = padding + (val / 255) * drawW;
    verts.push(x, h - padding, x, h - padding + 4);
  }

  return new Float32Array(verts);
}

/**
 * Render graticule text labels on a Canvas 2D overlay.
 * Called after WebGL rendering is complete.
 */
export function drawGraticuleLabels(
  ctx: CanvasRenderingContext2D,
  scopeId: string,
  w: number,
  h: number,
  appearance: ScopeAppearance,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.font = appearance.graticule.labelFont;
  ctx.fillStyle = appearance.graticule.labelColor;
  ctx.textBaseline = 'bottom';

  if (scopeId === 'waveform' || scopeId === 'rgbParade') {
    const levels = [0, 25, 50, 75, 100];
    for (const ire of levels) {
      const y = h - (ire / 100) * h;
      ctx.fillText(`${ire}`, 4, y - 2);
    }
  } else if (scopeId === 'vectorscope') {
    ctx.textBaseline = 'middle';
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 10;

    const targets = [
      { label: 'R', angle: 103, dist: 0.63 },
      { label: 'G', angle: 241, dist: 0.56 },
      { label: 'B', angle: 347, dist: 0.59 },
      { label: 'Yl', angle: 167, dist: 0.44 },
      { label: 'Cy', angle: 283, dist: 0.47 },
      { label: 'Mg', angle: 61, dist: 0.59 },
    ];
    for (const t of targets) {
      const a = (t.angle * Math.PI) / 180;
      const x = cx + Math.cos(a) * radius * t.dist;
      const y = cy - Math.sin(a) * radius * t.dist;
      ctx.fillText(t.label, x + 6, y);
    }
  } else if (scopeId === 'histogram') {
    const padding = 4;
    const drawW = w - padding * 2;
    ctx.textBaseline = 'top';
    ctx.fillText('0', padding, h - padding + 4);
    ctx.fillText('128', padding + drawW / 2 - 10, h - padding + 4);
    ctx.fillText('255', padding + drawW - 18, h - padding + 4);
  }
}

export function destroyGraticuleResources(
  gl: WebGL2RenderingContext,
  res: GraticuleResources,
): void {
  gl.deleteProgram(res.program);
  gl.deleteBuffer(res.buffer);
  gl.deleteVertexArray(res.vao);
}
