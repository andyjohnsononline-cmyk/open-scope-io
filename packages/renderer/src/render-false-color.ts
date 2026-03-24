import type { ScopeResult } from '@openscope/core';
import { parseHexColor, type RenderOptions } from './types.js';

const DEFAULT_ZONES: Array<{ maxIre: number; color: [number, number, number]; label: string }> = [
  { maxIre: 2,   color: [0, 0, 128],       label: 'Black' },
  { maxIre: 10,  color: [0, 0, 255],       label: 'Near black' },
  { maxIre: 20,  color: [0, 128, 255],     label: 'Shadows' },
  { maxIre: 30,  color: [0, 179, 77],      label: 'Low mids' },
  { maxIre: 40,  color: [77, 204, 77],     label: 'Lower mids' },
  { maxIre: 50,  color: [128, 128, 128],   label: 'Midtones' },
  { maxIre: 60,  color: [204, 204, 77],    label: 'Upper mids' },
  { maxIre: 70,  color: [255, 179, 0],     label: 'Highlights' },
  { maxIre: 80,  color: [255, 102, 0],     label: 'Bright highlights' },
  { maxIre: 90,  color: [255, 0, 0],       label: 'Near clip' },
  { maxIre: 95,  color: [255, 77, 77],     label: 'Clip warning' },
  { maxIre: 100, color: [255, 255, 255],   label: 'Clipping' },
];

function getZoneColor(ire: number): [number, number, number] {
  for (const zone of DEFAULT_ZONES) {
    if (ire <= zone.maxIre) return zone.color;
  }
  return [255, 255, 255];
}

/**
 * Renders false color overlay on the source frame.
 * Requires sourcePixels in options.
 */
export function renderFalseColor(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const bg = options?.background ?? '#111';

  if (!options?.sourcePixels || !options.sourceWidth || !options.sourceHeight) {
    // No source frame — render the zone legend instead
    renderZoneLegend(ctx, result, width, height, bg);
    return;
  }

  const srcW = options.sourceWidth;
  const srcH = options.sourceHeight;
  const src = options.sourcePixels;
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;

  const [bgR, bgG, bgB] = parseHexColor(bg);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = bgR;
    out[i + 1] = bgG;
    out[i + 2] = bgB;
    out[i + 3] = 255;
  }

  const scale = Math.min(width / srcW, height / srcH);
  const dstW = Math.round(srcW * scale);
  const dstH = Math.round(srcH * scale);
  const offsetX = Math.floor((width - dstW) / 2);
  const offsetY = Math.floor((height - dstH) / 2);

  for (let py = 0; py < dstH; py++) {
    for (let px = 0; px < dstW; px++) {
      const srcX = Math.floor((px / dstW) * srcW);
      const srcY = Math.floor((py / dstH) * srcH);
      const si = (srcY * srcW + srcX) * 4;

      const r = src[si] / 255;
      const g = src[si + 1] / 255;
      const b = src[si + 2] / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const ire = luma * 100;

      const [cr, cg, cb] = getZoneColor(ire);
      const oi = ((offsetY + py) * width + (offsetX + px)) * 4;
      out[oi] = cr;
      out[oi + 1] = cg;
      out[oi + 2] = cb;
      out[oi + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function renderZoneLegend(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  width: number,
  height: number,
  bg: string,
): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const zoneHeight = height / DEFAULT_ZONES.length;

  for (let i = 0; i < DEFAULT_ZONES.length; i++) {
    const zone = DEFAULT_ZONES[i];
    const y = i * zoneHeight;
    const [r, g, b] = zone.color;

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, y, width * 0.6, zoneHeight - 1);

    ctx.fillStyle = '#ccc';
    ctx.font = '11px monospace';
    ctx.fillText(
      `${zone.maxIre}% — ${zone.label}`,
      width * 0.65,
      y + zoneHeight / 2 + 4,
    );
  }

  // Show stats from metadata
  const meta = result.metadata;
  ctx.fillStyle = '#fff';
  ctx.font = '12px monospace';
  const statsY = height - 40;
  ctx.fillText(`Below 16%: ${meta.percentBelow16Ire}%`, 8, statsY);
  ctx.fillText(`Above 90%: ${meta.percentAbove90Ire}%`, 8, statsY + 16);
}
