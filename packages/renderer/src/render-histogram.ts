import type { ScopeResult } from '@openscope/core';
import type { RenderOptions } from './types.js';

export function renderHistogram(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const layout = options?.layout ?? 'overlaid';
  if (layout === 'stacked') {
    renderStacked(ctx, result, options);
  } else {
    renderOverlaid(ctx, result, options);
  }
}

function renderStacked(
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
    { offset: 0, fill: 'rgba(255, 60, 60, 0.4)', stroke: 'rgba(255, 80, 80, 0.8)' },
    { offset: bins, fill: 'rgba(60, 255, 60, 0.4)', stroke: 'rgba(80, 255, 80, 0.8)' },
    { offset: bins * 2, fill: 'rgba(60, 100, 255, 0.4)', stroke: 'rgba(80, 120, 255, 0.8)' },
  ];

  const rowHeight = height / 3;
  const padding = 4;

  for (let ci = 0; ci < channels.length; ci++) {
    const ch = channels[ci];
    const rowTop = ci * rowHeight;
    const drawH = rowHeight - padding * 2;
    const drawW = width - padding * 2;

    let maxCount = 0;
    for (let b = 0; b < bins; b++) {
      const v = data[ch.offset + b];
      if (v > maxCount) maxCount = v;
    }
    if (maxCount === 0) continue;

    // Filled area
    ctx.fillStyle = ch.fill;
    ctx.beginPath();
    ctx.moveTo(padding, rowTop + rowHeight - padding);

    for (let b = 0; b < bins; b++) {
      const x = padding + (b / (bins - 1)) * drawW;
      const count = data[ch.offset + b];
      const h = (count / maxCount) * drawH;
      ctx.lineTo(x, rowTop + rowHeight - padding - h);
    }

    ctx.lineTo(padding + drawW, rowTop + rowHeight - padding);
    ctx.closePath();
    ctx.fill();

    // Outline stroke
    ctx.strokeStyle = ch.stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let b = 0; b < bins; b++) {
      const x = padding + (b / (bins - 1)) * drawW;
      const count = data[ch.offset + b];
      const h = (count / maxCount) * drawH;
      const y = rowTop + rowHeight - padding - h;
      if (b === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Row separator
    if (ci < 2) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rowTop + rowHeight);
      ctx.lineTo(width, rowTop + rowHeight);
      ctx.stroke();
    }
  }

  // X axis labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '10px monospace';
  ctx.fillText('0', padding, height - padding - 2);
  ctx.fillText('128', padding + (width - padding * 2) / 2 - 10, height - padding - 2);
  ctx.fillText('255', width - padding - 18, height - padding - 2);
}

function renderOverlaid(
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
    { offset: 0, color: 'rgba(255, 60, 60, 0.5)' },
    { offset: bins, color: 'rgba(60, 255, 60, 0.5)' },
    { offset: bins * 2, color: 'rgba(60, 100, 255, 0.5)' },
  ];

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

  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '10px monospace';
  ctx.fillText('0', padding, height - padding - 2);
  ctx.fillText('128', padding + drawW / 2 - 10, height - padding - 2);
  ctx.fillText('255', padding + drawW - 18, height - padding - 2);
}
