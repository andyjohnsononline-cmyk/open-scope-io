import type { ScopeResult } from '@openscope/core';
import type { ScopeAppearance, RenderOptions } from '../types.js';
import { parseHexColor } from '../types.js';
import { createProgram, drawFullscreenTriangle } from './gl-utils.js';
import { uploadRGBA8 } from './gl-textures.js';
import { PASSTHROUGH_VERT, FALSE_COLOR_FRAG } from './shaders.js';

export interface FalseColorGLState {
  program: WebGLProgram | null;
  vao: WebGLVertexArrayObject | null;
  frameTexture: WebGLTexture | null;
}

export function createFalseColorGLState(): FalseColorGLState {
  return { program: null, vao: null, frameTexture: null };
}

export function initFalseColorGL(
  gl: WebGL2RenderingContext,
  state: FalseColorGLState,
): boolean {
  const program = createProgram(gl, PASSTHROUGH_VERT, FALSE_COLOR_FRAG);
  if (!program) return false;

  const vao = gl.createVertexArray();
  if (!vao) return false;

  state.program = program;
  state.vao = vao;
  return true;
}

const ZONE_LABELS = [
  { maxIre: 2, label: 'Black', color: '#000080' },
  { maxIre: 10, label: 'Near black', color: '#0000ff' },
  { maxIre: 20, label: 'Shadows', color: '#0080ff' },
  { maxIre: 30, label: 'Low mids', color: '#00b34d' },
  { maxIre: 40, label: 'Lower mids', color: '#4dcc4d' },
  { maxIre: 50, label: 'Midtones', color: '#808080' },
  { maxIre: 60, label: 'Upper mids', color: '#cccc4d' },
  { maxIre: 70, label: 'Highlights', color: '#ffb300' },
  { maxIre: 80, label: 'Bright highlights', color: '#ff6600' },
  { maxIre: 90, label: 'Near clip', color: '#ff0000' },
  { maxIre: 95, label: 'Clip warning', color: '#ff4d4d' },
  { maxIre: 100, label: 'Clipping', color: '#ffffff' },
];

export function renderFalseColorGL(
  gl: WebGL2RenderingContext,
  state: FalseColorGLState,
  result: ScopeResult,
  appearance: ScopeAppearance,
  options: RenderOptions | undefined,
  viewport: [number, number, number, number],
  overlayCtx: CanvasRenderingContext2D | null,
): void {
  const [vx, vy, vw, vh] = viewport;

  if (!state.program || !state.vao) {
    if (!initFalseColorGL(gl, state)) return;
  }

  if (!options?.sourcePixels || !options.sourceWidth || !options.sourceHeight) {
    // No source: draw zone legend via Canvas 2D overlay
    if (overlayCtx) {
      drawZoneLegend(overlayCtx, result, vw, vh, appearance);
    }
    return;
  }

  // Upload source frame
  state.frameTexture = uploadRGBA8(
    gl,
    options.sourcePixels,
    options.sourceWidth,
    options.sourceHeight,
    state.frameTexture,
  );
  if (!state.frameTexture) return;

  gl.useProgram(state.program!);
  gl.bindVertexArray(state.vao!);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.frameTexture);
  gl.uniform1i(gl.getUniformLocation(state.program!, 'uFrame'), 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(vx, vy, vw, vh);
  gl.disable(gl.BLEND);

  drawFullscreenTriangle(gl);
  gl.bindVertexArray(null);

  // Draw zone legend and stats on overlay
  if (overlayCtx) {
    drawFalseColorOverlay(overlayCtx, result, vw, vh, appearance);
  }
}

function drawZoneLegend(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  w: number,
  h: number,
  appearance: ScopeAppearance,
): void {
  const [bgR, bgG, bgB] = parseHexColor(appearance.background);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
  ctx.fillRect(0, 0, w, h);

  const zoneHeight = h / ZONE_LABELS.length;

  for (let i = 0; i < ZONE_LABELS.length; i++) {
    const zone = ZONE_LABELS[i];
    const y = i * zoneHeight;
    ctx.fillStyle = zone.color;
    ctx.fillRect(0, y, w * 0.6, zoneHeight - 1);

    ctx.fillStyle = appearance.graticule.labelColor;
    ctx.font = appearance.graticule.labelFont;
    ctx.fillText(`${zone.maxIre}% — ${zone.label}`, w * 0.65, y + zoneHeight / 2 + 4);
  }
}

function drawFalseColorOverlay(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  w: number,
  h: number,
  appearance: ScopeAppearance,
): void {
  ctx.clearRect(0, 0, w, h);

  // Zone legend in bottom-right corner
  const legendW = 120;
  const legendH = ZONE_LABELS.length * 12 + 8;
  const lx = w - legendW - 8;
  const ly = h - legendH - 8;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(lx, ly, legendW, legendH);

  ctx.font = appearance.graticule.labelFont;
  for (let i = 0; i < ZONE_LABELS.length; i++) {
    const zone = ZONE_LABELS[i];
    const y = ly + 10 + i * 12;

    ctx.fillStyle = zone.color;
    ctx.fillRect(lx + 4, y - 6, 8, 8);

    ctx.fillStyle = appearance.graticule.labelColor;
    ctx.fillText(`${zone.maxIre}%`, lx + 16, y);
  }

  // Stats from analysis metadata
  const meta = result.metadata;
  if (meta.percentBelow16Ire !== undefined || meta.percentAbove90Ire !== undefined) {
    ctx.fillStyle = '#e8e8eb';
    ctx.font = '11px "Geist Mono", monospace';
    const statsY = h - legendH - 30;
    if (meta.percentBelow16Ire !== undefined) {
      ctx.fillText(`<16 IRE: ${meta.percentBelow16Ire}%`, 8, statsY);
    }
    if (meta.percentAbove90Ire !== undefined) {
      ctx.fillText(`>90 IRE: ${meta.percentAbove90Ire}%`, 8, statsY + 14);
    }
  }
}
