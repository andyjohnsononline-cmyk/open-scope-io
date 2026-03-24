import type { ScopeResult } from '@openscope/core';
import type { RenderOptions } from './types.js';

export function renderHistogram(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const bg = options?.background ?? '#111';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const bins = 256;
  const data = result.data;

  const channels = [
    { offset: 0, color: 'rgba(255, 60, 60, 0.5)' },        // R
    { offset: bins, color: 'rgba(60, 255, 60, 0.5)' },      // G
    { offset: bins * 2, color: 'rgba(60, 100, 255, 0.5)' },  // B
  ];

  // Find global max for normalization
  let maxCount = 0;
  for (let ch = 0; ch < 4; ch++) {
    for (let b = 0; b < bins; b++) {
      const v = data[ch * bins + b];
      if (v > maxCount) maxCount = v;
    }
  }

  if (maxCount === 0) return;

  const padding = 4;
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;

  // Draw RGB channels as filled areas
  for (const ch of channels) {
    ctx.fillStyle = ch.color;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);

    for (let b = 0; b < bins; b++) {
      const x = padding + (b / (bins - 1)) * drawW;
      const count = data[ch.offset + b];
      const h = (count / maxCount) * drawH;
      ctx.lineTo(x, height - padding - h);
    }

    ctx.lineTo(padding + drawW, height - padding);
    ctx.closePath();
    ctx.fill();
  }

  // Draw luma as a white line on top
  const lumaOffset = bins * 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let b = 0; b < bins; b++) {
    const x = padding + (b / (bins - 1)) * drawW;
    const count = data[lumaOffset + b];
    const h = (count / maxCount) * drawH;
    const y = height - padding - h;
    if (b === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '10px monospace';
  ctx.fillText('0', padding, height - padding - 2);
  ctx.fillText('128', padding + drawW / 2 - 10, height - padding - 2);
  ctx.fillText('255', padding + drawW - 18, height - padding - 2);
}
