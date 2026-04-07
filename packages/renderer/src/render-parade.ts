import type { ScopeResult } from '@openscope/core';
import { parseHexColor, type RenderOptions } from './types.js';

function logPosToBin(pos: number, bins: number): number {
  if (pos <= 0) return 0;
  return Math.floor(Math.pow(bins, pos) - 1);
}

function binToLogPos(bin: number, bins: number): number {
  if (bin <= 0) return 0;
  return Math.log(bin + 1) / Math.log(bins);
}

export function renderParade(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const bg = options?.background ?? '#111';
  const yScale = options?.yAxisScale ?? 'linear';

  const bins = 256;
  const totalCols = result.shape[0];
  const channelCols = totalCols / 3;
  const data = result.data;
  const stride = channelCols * bins;

  const channelWidth = Math.floor(width / 3);
  const colors = [
    [255, 60, 60],
    [60, 255, 60],
    [60, 100, 255],
  ];

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;
  const [bgR, bgG, bgB] = parseHexColor(bg);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bgR;
    pixels[i + 1] = bgG;
    pixels[i + 2] = bgB;
    pixels[i + 3] = 255;
  }

  for (let ch = 0; ch < 3; ch++) {
    const xOffset = ch * channelWidth;
    const dataOffset = ch * stride;
    const [cr, cg, cb] = colors[ch];

    const colMax = new Float64Array(channelCols);
    for (let x = 0; x < channelCols; x++) {
      for (let b = 0; b < bins; b++) {
        const v = data[dataOffset + x * bins + b];
        if (v > colMax[x]) colMax[x] = v;
      }
    }

    for (let px = 0; px < channelWidth; px++) {
      const srcCol = Math.floor((px / channelWidth) * channelCols);
      const maxVal = colMax[srcCol];
      if (maxVal === 0) continue;

      for (let py = 0; py < height; py++) {
        const normY = (height - 1 - py) / Math.max(height - 1, 1);
        const bin = yScale === 'log'
          ? logPosToBin(normY, bins)
          : Math.floor(normY * (bins - 1));
        if (bin < 0 || bin >= bins) continue;

        const count = data[dataOffset + srcCol * bins + bin];
        if (count === 0) continue;

        const intensity = Math.log(count + 1) / Math.log(maxVal + 1);
        const t = Math.min(intensity, 1);

        const i = (py * width + (xOffset + px)) * 4;
        pixels[i] = Math.round(bgR + (cr - bgR) * t);
        pixels[i + 1] = Math.round(bgG + (cg - bgG) * t);
        pixels[i + 2] = Math.round(bgB + (cb - bgB) * t);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Channel separators
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const x = i * channelWidth;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  drawGraticule(ctx, width, height, yScale, bins);
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  yScale: 'linear' | 'log',
  bins: number,
): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

  if (yScale === 'log') {
    const logLevels = [0, 1, 2, 4, 8, 16, 32, 64, 128, 255];
    for (const cv of logLevels) {
      const pos = cv === 0 ? 0 : binToLogPos(cv, bins);
      const y = Math.round(h - pos * h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${cv}`, 4, y - 2);
    }
  } else {
    const levels = [0, 25, 50, 75, 100];
    for (const ire of levels) {
      const y = Math.round(h - (ire / 100) * h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(`${ire}`, 4, y - 2);
    }
  }

  ctx.setLineDash([]);
}
