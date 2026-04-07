import type { ScopeResult } from '@openscope/core';
import {
  parseHexColor,
  type RenderOptions,
  type VectorscopeStyle,
  type VectorscopeTargets,
} from './types.js';

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

export function renderVectorscope(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const bg = options?.background ?? '#111';
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = size / 2 - 10;

  const [gridW, gridH] = result.shape;
  const data = result.data;

  // Find max for normalization
  let maxCount = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > maxCount) maxCount = data[i];
  }

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;
  const [bgR, bgG, bgB] = parseHexColor(bg);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bgR;
    pixels[i + 1] = bgG;
    pixels[i + 2] = bgB;
    pixels[i + 3] = 255;
  }

  if (maxCount === 0) {
    ctx.putImageData(imageData, 0, 0);
    drawOverlay(ctx, cx, cy, radius, options);
    return;
  }

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const count = data[gy * gridW + gx];
      if (count === 0) continue;

      // Map grid position to Cb/Cr
      const cb = (gx / (gridW - 1)) - 0.5;
      const cr = (gy / (gridH - 1)) - 0.5;

      // Map to canvas position (circular)
      const px = Math.round(cx + cb * 2 * radius);
      const py = Math.round(cy - cr * 2 * radius);

      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const intensity = Math.log(count + 1) / Math.log(maxCount + 1);
      const t = Math.min(intensity, 1);

      const hue = Math.atan2(cr, cb);
      const sat = Math.sqrt(cb * cb + cr * cr) * 2;
      const [r, g, b] = hslToRgb((hue / (2 * Math.PI) + 1) % 1, Math.min(sat, 1), 0.6);

      const newR = Math.round(bgR + (r - bgR) * t);
      const newG = Math.round(bgG + (g - bgG) * t);
      const newB = Math.round(bgB + (b - bgB) * t);

      const i = (py * width + px) * 4;
      const existDist = Math.abs(pixels[i] - bgR) + Math.abs(pixels[i + 1] - bgG) + Math.abs(pixels[i + 2] - bgB);
      const newDist = Math.abs(newR - bgR) + Math.abs(newG - bgG) + Math.abs(newB - bgB);
      if (newDist > existDist) {
        pixels[i] = newR;
        pixels[i + 1] = newG;
        pixels[i + 2] = newB;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  drawOverlay(ctx, cx, cy, radius, options);
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  options?: RenderOptions,
): void {
  const style: VectorscopeStyle = options?.vectorscopeStyle ?? 'standard';
  if (style === 'off') return;

  const targetsMode: VectorscopeTargets = options?.vectorscopeTargets ?? '75';
  const showLabels = options?.showLabels ?? true;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;

  // Outer circle (all visible styles)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshairs
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();
  ctx.setLineDash([]);

  if (style === 'standard' || style === 'hue-vectors') {
    // 75% circle when targets include 75%
    if (targetsMode === '75' || targetsMode === '75+100') {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (style === 'standard' || style === 'hue-vectors') {
    // Skin tone line
    const skinAngle = (123 * Math.PI) / 180;
    ctx.strokeStyle = 'rgba(255, 200, 150, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(skinAngle) * radius,
      cy - Math.sin(skinAngle) * radius,
    );
    ctx.stroke();
  }

  if (style === 'hue-vectors') {
    const allTargets = targetsMode === '75' ? TARGETS_75
      : targetsMode === '100' ? TARGETS_100
      : TARGETS_100;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    for (const t of allTargets) {
      const a = (t.angle * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * radius, cy - Math.sin(a) * radius);
      ctx.stroke();
    }
  }

  // Target boxes (standard and hue-vectors only)
  if (style !== 'simplified') {
    const targetSets: Array<typeof TARGETS_75> = [];
    if (targetsMode === '75' || targetsMode === '75+100') targetSets.push(TARGETS_75);
    if (targetsMode === '100' || targetsMode === '75+100') targetSets.push(TARGETS_100);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;

    for (const set of targetSets) {
      for (const t of set) {
        const a = (t.angle * Math.PI) / 180;
        const x = cx + Math.cos(a) * radius * t.dist;
        const y = cy - Math.sin(a) * radius * t.dist;
        ctx.strokeRect(x - 4, y - 4, 8, 8);
      }
    }

    // Labels on outermost target set
    if (showLabels) {
      const outerTargets = targetsMode === '100' ? TARGETS_100
        : targetsMode === '75+100' ? TARGETS_100
        : TARGETS_75;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '9px monospace';
      for (const t of outerTargets) {
        const a = (t.angle * Math.PI) / 180;
        const x = cx + Math.cos(a) * radius * t.dist;
        const y = cy - Math.sin(a) * radius * t.dist;
        ctx.fillText(t.label, x + 6, y + 3);
      }
    }
  }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}
