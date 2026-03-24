import type { ScopeResult } from '@openscope/core';
import { parseHexColor, type RenderOptions } from './types.js';

export function renderParade(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const bg = options?.background ?? '#111';

  const bins = 256;
  const totalCols = result.shape[0];
  const channelCols = totalCols / 3;
  const data = result.data;
  const stride = channelCols * bins;

  const channelWidth = Math.floor(width / 3);
  const colors = [
    [255, 60, 60],   // Red
    [60, 255, 60],   // Green
    [60, 100, 255],  // Blue
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

    // Find max per column for this channel
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
        const bin = Math.floor(((height - 1 - py) / Math.max(height - 1, 1)) * (bins - 1));
        const count = data[dataOffset + srcCol * bins + bin];
        if (count === 0) continue;

        const intensity = Math.log(count + 1) / Math.log(maxVal + 1);
        const t = Math.min(intensity, 1);

        const i = (py * width + (xOffset + px)) * 4;
        pixels[i] = Math.round(bgR + (cr - bgR) * t);
        pixels[i + 1] = Math.round(bgG + (cg - bgG) * t);
        pixels[i + 2] = Math.round(bgB + (cb - bgB) * t);
        pixels[i + 3] = 255;
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
}
