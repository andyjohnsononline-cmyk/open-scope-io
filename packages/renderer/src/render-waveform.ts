import type { ScopeResult } from '@openscope/core';
import {
  parseHexColor,
  type RenderOptions,
  type WaveformScaleStyle,
  type LevelMode,
} from './types.js';

/**
 * Maps a normalized position [0,1] to a bin index using log scale.
 * pos=0 → bin 0, pos=1 → bin (bins-1).
 */
function logPosToBin(pos: number, bins: number): number {
  if (pos <= 0) return 0;
  return Math.floor(Math.pow(bins, pos) - 1);
}

/**
 * Maps a bin index to a normalized position [0,1] using log scale.
 */
function binToLogPos(bin: number, bins: number): number {
  if (bin <= 0) return 0;
  return Math.log(bin + 1) / Math.log(bins);
}

export function renderWaveform(
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
): void {
  const { width, height } = ctx.canvas;
  const bg = options?.background ?? '#111';
  const color = options?.color ?? '#00ff00';
  const yScale = options?.yAxisScale ?? 'linear';
  const mode = options?.mode ?? 'luma';

  const [dataCols, bins] = result.shape;
  const data = result.data;

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;
  const [bgR, bgG, bgB] = parseHexColor(bg);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bgR;
    pixels[i + 1] = bgG;
    pixels[i + 2] = bgB;
    pixels[i + 3] = 255;
  }

  if (mode === 'rgb') {
    renderRgbOverlay(pixels, data, dataCols, bins, width, height, bgR, bgG, bgB, yScale);
  } else {
    renderLumaTrace(pixels, data, dataCols, bins, width, height, bgR, bgG, bgB, color, yScale);
  }

  ctx.putImageData(imageData, 0, 0);
  drawGraticule(ctx, width, height, yScale, bins, options);
}

function renderLumaTrace(
  pixels: Uint8ClampedArray,
  data: Uint32Array,
  dataCols: number,
  bins: number,
  width: number,
  height: number,
  bgR: number,
  bgG: number,
  bgB: number,
  color: string,
  yScale: 'linear' | 'log',
): void {
  const colMax = new Float64Array(dataCols);
  for (let x = 0; x < dataCols; x++) {
    for (let b = 0; b < bins; b++) {
      const v = data[x * bins + b];
      if (v > colMax[x]) colMax[x] = v;
    }
  }

  const [r, g, b] = parseHexColor(color);

  for (let px = 0; px < width; px++) {
    const srcCol = Math.floor((px / width) * dataCols);
    const maxVal = colMax[srcCol];
    if (maxVal === 0) continue;

    for (let py = 0; py < height; py++) {
      const normY = (height - 1 - py) / Math.max(height - 1, 1);
      const bin = yScale === 'log'
        ? logPosToBin(normY, bins)
        : Math.floor(normY * (bins - 1));
      if (bin < 0 || bin >= bins) continue;

      const count = data[srcCol * bins + bin];
      if (count === 0) continue;

      const intensity = Math.log(count + 1) / Math.log(maxVal + 1);
      const t = Math.min(intensity, 1);

      const i = (py * width + px) * 4;
      pixels[i] = Math.round(bgR + (r - bgR) * t);
      pixels[i + 1] = Math.round(bgG + (g - bgG) * t);
      pixels[i + 2] = Math.round(bgB + (b - bgB) * t);
    }
  }
}

function renderRgbOverlay(
  pixels: Uint8ClampedArray,
  data: Uint32Array,
  dataCols: number,
  bins: number,
  width: number,
  height: number,
  bgR: number,
  bgG: number,
  bgB: number,
  yScale: 'linear' | 'log',
): void {
  const channelCols = dataCols / 3;
  const stride = channelCols * bins;
  const channelColors: Array<[number, number, number]> = [
    [255, 60, 60],
    [60, 255, 60],
    [60, 100, 255],
  ];

  for (let ch = 0; ch < 3; ch++) {
    const dataOffset = ch * stride;
    const [cr, cg, cb] = channelColors[ch];

    const colMax = new Float64Array(channelCols);
    for (let x = 0; x < channelCols; x++) {
      for (let b = 0; b < bins; b++) {
        const v = data[dataOffset + x * bins + b];
        if (v > colMax[x]) colMax[x] = v;
      }
    }

    for (let px = 0; px < width; px++) {
      const srcCol = Math.floor((px / width) * channelCols);
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

        const i = (py * width + px) * 4;
        // Additive blending: add channel contribution on top of existing pixel
        pixels[i] = Math.min(255, pixels[i] + Math.round((cr - bgR) * t));
        pixels[i + 1] = Math.min(255, pixels[i + 1] + Math.round((cg - bgG) * t));
        pixels[i + 2] = Math.min(255, pixels[i + 2] + Math.round((cb - bgB) * t));
      }
    }
  }
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  yScale: 'linear' | 'log',
  bins: number,
  options?: RenderOptions,
): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';

  const showLabels = options?.showLabels ?? true;

  if (yScale === 'log') {
    const logLevels = [0, 1, 2, 4, 8, 16, 32, 64, 128, 255];
    for (const cv of logLevels) {
      const pos = cv === 0 ? 0 : binToLogPos(cv, bins);
      const y = Math.round(h - pos * h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      if (showLabels) ctx.fillText(`${cv}`, 4, y - 2);
    }
  } else {
    const entries = getWaveformGratEntries(options);
    for (const { pos, text } of entries) {
      const y = Math.round(h - pos * h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      if (showLabels) ctx.fillText(text, 4, y - 2);
    }
  }

  ctx.setLineDash([]);
}

function getWaveformGratEntries(
  options?: RenderOptions,
): Array<{ pos: number; text: string }> {
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

  const dataPos = [0, 0.25, 0.5, 0.75, 1.0];
  const videoPos = [16 / 255, 0.25, 0.5, 0.75, 235 / 255];
  const positions = level === 'video' ? videoPos : dataPos;

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
    case '10-bit':
      return positions.map(p => ({ pos: p, text: `${Math.round(p * 1023)}` }));
    case '12-bit':
      return positions.map(p => ({ pos: p, text: `${Math.round(p * 4095)}` }));
    case 'mv':
      return positions.map(p => ({ pos: p, text: `${Math.round(p * 700)}` }));
    default:
      return positions.map(p => ({ pos: p, text: `${Math.round(p * 100)}` }));
  }
}
