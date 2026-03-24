import type { ScopeResult } from '@openscope/core';
import { parseHexColor, type RenderOptions } from './types.js';

export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const bg = options?.background ?? '#111';
  const color = options?.color ?? '#00ff00';

  const [dataCols, bins] = result.shape;
  const data = result.data;

  // Find max count per column for normalization
  const colMax = new Float64Array(dataCols);
  for (let x = 0; x < dataCols; x++) {
    for (let b = 0; b < bins; b++) {
      const v = data[x * bins + b];
      if (v > colMax[x]) colMax[x] = v;
    }
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

  const [r, g, b] = parseHexColor(color);

  for (let px = 0; px < width; px++) {
    const srcCol = Math.floor((px / width) * dataCols);
    const maxVal = colMax[srcCol];
    if (maxVal === 0) continue;

    for (let py = 0; py < height; py++) {
      // Y axis is inverted: top = high IRE, bottom = low IRE
      const bin = Math.floor(((height - 1 - py) / Math.max(height - 1, 1)) * (bins - 1));
      const count = data[srcCol * bins + bin];
      if (count === 0) continue;

      const intensity = Math.log(count + 1) / Math.log(maxVal + 1);
      const t = Math.min(intensity, 1);

      const i = (py * width + px) * 4;
      pixels[i] = Math.round(bgR + (r - bgR) * t);
      pixels[i + 1] = Math.round(bgG + (g - bgG) * t);
      pixels[i + 2] = Math.round(bgB + (b - bgB) * t);
      pixels[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  drawGraticule(ctx, width, height);
}

function drawGraticule(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  const levels = [0, 25, 50, 75, 100];
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

  for (const ire of levels) {
    const y = Math.round(h - (ire / 100) * h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.fillText(`${ire}`, 4, y - 2);
  }

  ctx.setLineDash([]);
}
