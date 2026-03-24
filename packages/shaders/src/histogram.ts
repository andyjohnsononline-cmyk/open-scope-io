import type { ScopePlugin, ScopeResult } from '@openscope/core';
import { luma } from './utils.js';

const BINS = 256;
const CHANNELS = 4; // R, G, B, Luma

export const histogramShader = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inputTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(inputTexture, vec2u(gid.x, gid.y), 0);

  let r = u32(clamp(pixel.r * 255.0, 0.0, 255.0));
  let g = u32(clamp(pixel.g * 255.0, 0.0, 255.0));
  let b = u32(clamp(pixel.b * 255.0, 0.0, 255.0));
  let l = u32(clamp((0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b) * 255.0, 0.0, 255.0));

  atomicAdd(&output[r], 1u);
  atomicAdd(&output[256u + g], 1u);
  atomicAdd(&output[512u + b], 1u);
  atomicAdd(&output[768u + l], 1u);
}
`;

function findMode(bins: Uint32Array | number[], offset: number): number {
  let maxCount = 0;
  let modeValue = 0;
  for (let i = 0; i < BINS; i++) {
    const count = typeof bins[offset + i] === 'number' ? bins[offset + i] : 0;
    if (count > maxCount) {
      maxCount = count;
      modeValue = i;
    }
  }
  return modeValue;
}

function findMedian(bins: Uint32Array | number[], offset: number, total: number): number {
  let running = 0;
  const half = total / 2;
  for (let i = 0; i < BINS; i++) {
    running += bins[offset + i];
    if (running >= half) return i;
  }
  return 255;
}

function buildResult(data: Uint32Array, totalPixels: number): ScopeResult {
  const lumaOffset = 768;
  return {
    scopeId: 'histogram',
    data,
    shape: [CHANNELS, BINS],
    metadata: {
      mode: findMode(data, lumaOffset),
      median: findMedian(data, lumaOffset, totalPixels),
    },
  };
}

function analyzeCpu(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ScopeResult {
  const data = new Uint32Array(CHANNELS * BINS);
  const totalPixels = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const l = Math.round(luma(r, g, b));

      data[r]++;
      data[BINS + g]++;
      data[BINS * 2 + b]++;
      data[BINS * 3 + Math.min(l, 255)]++;
    }
  }

  return buildResult(data, totalPixels);
}

export const histogram: ScopePlugin = {
  id: 'histogram',
  name: 'Histogram',
  shader: histogramShader,

  getBufferSize(_width: number, _height: number): number {
    return CHANNELS * BINS;
  },

  parseResult(data: Uint32Array, width: number, height: number): ScopeResult {
    return buildResult(data, width * height);
  },

  analyzeCpu,
};
