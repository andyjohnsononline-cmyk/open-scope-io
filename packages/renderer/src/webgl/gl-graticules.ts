import type {
  ScopeAppearance,
  RenderOptions,
  WaveformScaleStyle,
  LevelMode,
  VectorscopeStyle,
  VectorscopeTargets,
} from '../types.js';
import { parseHexColor } from '../types.js';
import { createProgram } from './gl-utils.js';
import { GRATICULE_VERT, GRATICULE_FRAG } from './shaders.js';

const TARGETS_75 = [
  { label: 'R', angle: 103, dist: 0.63 },
  { label: 'G', angle: 241, dist: 0.56 },
  { label: 'B', angle: 347, dist: 0.59 },
  { label: 'Yl', angle: 167, dist: 0.44 },
  { label: 'Cy', angle: 283, dist: 0.47 },
  { label: 'Mg', angle: 61, dist: 0.59 },
];

const TARGETS_100 = [
  { label: 'R', angle: 103, dist: 0.84 },
  { label: 'G', angle: 241, dist: 0.75 },
  { label: 'B', angle: 347, dist: 0.79 },
  { label: 'Yl', angle: 167, dist: 0.59 },
  { label: 'Cy', angle: 283, dist: 0.63 },
  { label: 'Mg', angle: 61, dist: 0.79 },
];

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

/** Generate waveform/parade graticule line data with configurable scale. */
export function waveformGraticuleLines(
  w: number,
  h: number,
  options?: RenderOptions,
): Float32Array {
  const positions = getWaveformLinePositions(options);
  const verts: number[] = [];
  for (const pos of positions) {
    const y = h - pos * h;
    verts.push(0, y, w, y);
  }
  return new Float32Array(verts);
}

/** Generate vectorscope graticule line data with configurable style. */
export function vectorscopeGraticuleLines(
  w: number,
  h: number,
  options?: RenderOptions,
): Float32Array {
  const style: VectorscopeStyle = options?.vectorscopeStyle ?? 'standard';
  if (style === 'off') return new Float32Array(0);

  const targets: VectorscopeTargets = options?.vectorscopeTargets ?? '75';
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 10;
  const verts: number[] = [];
  const segments = 64;

  // Crosshairs (all styles except off)
  verts.push(cx - radius, cy, cx + radius, cy);
  verts.push(cx, cy - radius, cx, cy + radius);

  // Outer circle (all visible styles)
  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * Math.PI * 2;
    const a2 = ((i + 1) / segments) * Math.PI * 2;
    verts.push(
      cx + Math.cos(a1) * radius,
      cy + Math.sin(a1) * radius,
      cx + Math.cos(a2) * radius,
      cy + Math.sin(a2) * radius,
    );
  }

  if (style === 'standard' || style === 'hue-vectors') {
    // 75% circle when targets include 75%
    if (targets === '75' || targets === '75+100') {
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        const r = radius * 0.75;
        verts.push(
          cx + Math.cos(a1) * r, cy + Math.sin(a1) * r,
          cx + Math.cos(a2) * r, cy + Math.sin(a2) * r,
        );
      }
    }
  }

  if (style === 'hue-vectors') {
    const allTargets = targets === '75' ? TARGETS_75
      : targets === '100' ? TARGETS_100
      : TARGETS_100;
    for (const t of allTargets) {
      const a = (t.angle * Math.PI) / 180;
      verts.push(cx, cy, cx + Math.cos(a) * radius, cy - Math.sin(a) * radius);
    }
  }

  return new Float32Array(verts);
}

/** Generate vectorscope target box lines (separate so they can use different color). */
export function vectorscopeTargetLines(
  w: number,
  h: number,
  options?: RenderOptions,
): Float32Array {
  const style: VectorscopeStyle = options?.vectorscopeStyle ?? 'standard';
  if (style === 'off' || style === 'simplified') return new Float32Array(0);

  const targetsMode: VectorscopeTargets = options?.vectorscopeTargets ?? '75';
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 10;
  const verts: number[] = [];

  const targetSets: Array<typeof TARGETS_75> = [];
  if (targetsMode === '75' || targetsMode === '75+100') targetSets.push(TARGETS_75);
  if (targetsMode === '100' || targetsMode === '75+100') targetSets.push(TARGETS_100);

  for (const set of targetSets) {
    for (const t of set) {
      const a = (t.angle * Math.PI) / 180;
      const x = cx + Math.cos(a) * radius * t.dist;
      const y = cy - Math.sin(a) * radius * t.dist;
      const s = 4;
      verts.push(x - s, y - s, x + s, y - s);
      verts.push(x + s, y - s, x + s, y + s);
      verts.push(x + s, y + s, x - s, y + s);
      verts.push(x - s, y + s, x - s, y - s);
    }
  }

  return new Float32Array(verts);
}

/** Generate vectorscope skin tone line (separate for distinct color). */
export function vectorscopeSkinToneLine(
  w: number,
  h: number,
  options?: RenderOptions,
): Float32Array {
  const style: VectorscopeStyle = options?.vectorscopeStyle ?? 'standard';
  if (style === 'off' || style === 'simplified') return new Float32Array(0);

  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 10;
  const skinAngle = (123 * Math.PI) / 180;
  return new Float32Array([
    cx, cy,
    cx + Math.cos(skinAngle) * radius,
    cy - Math.sin(skinAngle) * radius,
  ]);
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
  options?: RenderOptions,
): void {
  ctx.clearRect(0, 0, w, h);
  const showLabels = options?.showLabels ?? true;
  if (!showLabels) return;

  ctx.font = appearance.graticule.labelFont;
  ctx.fillStyle = appearance.graticule.labelColor;
  ctx.textBaseline = 'bottom';

  if (scopeId === 'waveform' || scopeId === 'rgbParade') {
    const entries = getWaveformLabelEntries(options);
    for (const { pos, text } of entries) {
      const y = h - pos * h;
      ctx.fillText(text, 4, y - 2);
    }
  } else if (scopeId === 'vectorscope') {
    const style: VectorscopeStyle = options?.vectorscopeStyle ?? 'standard';
    if (style === 'off') return;

    ctx.textBaseline = 'middle';
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 10;
    const targetsMode: VectorscopeTargets = options?.vectorscopeTargets ?? '75';

    const outerTargets = targetsMode === '100' ? TARGETS_100
      : targetsMode === '75+100' ? TARGETS_100
      : TARGETS_75;

    if (style !== 'simplified') {
      for (const t of outerTargets) {
        const a = (t.angle * Math.PI) / 180;
        const x = cx + Math.cos(a) * radius * t.dist;
        const y = cy - Math.sin(a) * radius * t.dist;
        ctx.fillText(t.label, x + 6, y);
      }
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

// ---------------------------------------------------------------------------
// Waveform scale helpers
// ---------------------------------------------------------------------------

interface WaveformLabelEntry {
  pos: number;
  text: string;
}

function getWaveformLinePositions(options?: RenderOptions): number[] {
  const scale: WaveformScaleStyle = options?.waveformScale ?? 'percentage';
  const level: LevelMode = options?.levelMode ?? 'data';

  if (scale === 'hdr') {
    return [0, 0.25, 0.5, 0.75, 1.0];
  }

  if (level === 'video') {
    return [16 / 255, 0.25, 0.5, 0.75, 235 / 255];
  }
  return [0, 0.25, 0.5, 0.75, 1.0];
}

function getWaveformLabelEntries(options?: RenderOptions): WaveformLabelEntry[] {
  const scale: WaveformScaleStyle = options?.waveformScale ?? 'percentage';
  const level: LevelMode = options?.levelMode ?? 'data';

  if (scale === 'hdr') {
    return [
      { pos: 0, text: '0' },
      { pos: 0.1, text: '1' },
      { pos: 0.25, text: '10' },
      { pos: 0.5, text: '100' },
      { pos: 0.75, text: '1000' },
      { pos: 1.0, text: '10000' },
    ];
  }

  const dataPositions = [0, 0.25, 0.5, 0.75, 1.0];
  const videoPositions = [16 / 255, 0.25, 0.5, 0.75, 235 / 255];
  const positions = level === 'video' ? videoPositions : dataPositions;

  switch (scale) {
    case 'percentage': {
      const fmt = (p: number) => {
        const pct = level === 'video'
          ? ((p * 255 - 16) / (235 - 16)) * 100
          : p * 100;
        return `${Math.round(pct)}%`;
      };
      return positions.map(p => ({ pos: p, text: fmt(p) }));
    }
    case '10-bit': {
      const fmt = (p: number) => `${Math.round(p * 1023)}`;
      return positions.map(p => ({ pos: p, text: fmt(p) }));
    }
    case '12-bit': {
      const fmt = (p: number) => `${Math.round(p * 4095)}`;
      return positions.map(p => ({ pos: p, text: fmt(p) }));
    }
    case 'mv': {
      const fmt = (p: number) => `${Math.round(p * 700)}`;
      return positions.map(p => ({ pos: p, text: fmt(p) }));
    }
    default:
      return positions.map(p => ({ pos: p, text: `${Math.round(p * 100)}` }));
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
