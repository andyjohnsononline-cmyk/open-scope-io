import type { ScopePlugin, ScopeResult } from '@openscope/core';
import { luma, clamp } from './utils.js';

const BINS = 256;

export const waveformShader = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inputTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(inputTexture, vec2u(gid.x, gid.y), 0);
  let luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
  let bin = u32(clamp(luma * 255.0, 0.0, 255.0));

  let idx = gid.x * 256u + bin;
  atomicAdd(&output[idx], 1u);
}
`;

function analyzeCpu(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ScopeResult {
  const data = new Uint32Array(width * BINS);

  let minIre = 1;
  let maxIre = 0;
  let totalLuma = 0;
  const totalPixels = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = luma(pixels[i], pixels[i + 1], pixels[i + 2]) / 255;
      const bin = clamp(Math.round(l * 255), 0, 255);
      data[x * BINS + bin]++;

      if (l < minIre) minIre = l;
      if (l > maxIre) maxIre = l;
      totalLuma += l;
    }
  }

  const meanIre = totalLuma / totalPixels;
  const clippingShadows = countBinsBelow(data, width, 4) > totalPixels * 0.01;
  const clippingHighlights = countBinsAbove(data, width, 251) > totalPixels * 0.01;

  return {
    scopeId: 'waveform',
    data,
    shape: [width, BINS],
    metadata: {
      minIre: round4(minIre * 100),
      maxIre: round4(maxIre * 100),
      meanIre: round4(meanIre * 100),
      clippingShadows,
      clippingHighlights,
    },
  };
}

function countBinsBelow(data: Uint32Array, width: number, threshold: number): number {
  let count = 0;
  for (let x = 0; x < width; x++) {
    for (let b = 0; b < threshold; b++) {
      count += data[x * BINS + b];
    }
  }
  return count;
}

function countBinsAbove(data: Uint32Array, width: number, threshold: number): number {
  let count = 0;
  for (let x = 0; x < width; x++) {
    for (let b = threshold; b < BINS; b++) {
      count += data[x * BINS + b];
    }
  }
  return count;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

export const waveform: ScopePlugin = {
  id: 'waveform',
  name: 'Luma Waveform',
  shader: waveformShader,
  getBufferSize(width: number, _height: number): number {
    return width * BINS;
  },
  parseResult(data: Uint32Array, width: number, height: number): ScopeResult {
    const totalPixels = width * height;
    let minIre = 100;
    let maxIre = 0;
    let totalLuma = 0;
    let totalCount = 0;

    for (let x = 0; x < width; x++) {
      for (let b = 0; b < BINS; b++) {
        const count = data[x * BINS + b];
        if (count > 0) {
          const ire = (b / 255) * 100;
          if (ire < minIre) minIre = ire;
          if (ire > maxIre) maxIre = ire;
          totalLuma += ire * count;
          totalCount += count;
        }
      }
    }

    const meanIre = totalCount > 0 ? totalLuma / totalCount : 0;
    const shadowPixels = countBinsBelow(data, width, 4);
    const highlightPixels = countBinsAbove(data, width, 251);

    return {
      scopeId: 'waveform',
      data,
      shape: [width, BINS],
      metadata: {
        minIre: round4(minIre),
        maxIre: round4(maxIre),
        meanIre: round4(meanIre),
        clippingShadows: shadowPixels > totalPixels * 0.01,
        clippingHighlights: highlightPixels > totalPixels * 0.01,
      },
    };
  },
  analyzeCpu,
};
