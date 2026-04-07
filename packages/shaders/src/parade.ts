import type { ScopePlugin, ScopeResult } from '@openscope/core';
import { clamp } from './utils.js';

const BINS = 256;

export const paradeShader = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inputTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(inputTexture, vec2u(gid.x, gid.y), 0);

  let rBin = u32(clamp(pixel.r * 255.0, 0.0, 255.0));
  let gBin = u32(clamp(pixel.g * 255.0, 0.0, 255.0));
  let bBin = u32(clamp(pixel.b * 255.0, 0.0, 255.0));

  let stride = dims.x * 256u;
  atomicAdd(&output[gid.x * 256u + rBin], 1u);
  atomicAdd(&output[stride + gid.x * 256u + gBin], 1u);
  atomicAdd(&output[stride * 2u + gid.x * 256u + bBin], 1u);
}
`;

function analyzeCpu(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ScopeResult {
  const data = new Uint32Array(width * BINS * 3);
  const stride = width * BINS;

  let rMin = 255, rMax = 0, rSum = 0;
  let gMin = 255, gMax = 0, gSum = 0;
  let bMin = 255, bMax = 0, bSum = 0;
  const totalPixels = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      data[x * BINS + r]++;
      data[stride + x * BINS + g]++;
      data[stride * 2 + x * BINS + b]++;

      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      rSum += r;
      if (g < gMin) gMin = g;
      if (g > gMax) gMax = g;
      gSum += g;
      if (b < bMin) bMin = b;
      if (b > bMax) bMax = b;
      bSum += b;
    }
  }

  const toIre = (v: number) => Math.round((v / 255) * 10000) / 100;
  const rMean = rSum / totalPixels;
  const gMean = gSum / totalPixels;
  const bMean = bSum / totalPixels;
  const overallMean = (rMean + gMean + bMean) / 3;
  const channelImbalance = overallMean > 0
    ? Math.round(Math.max(
        Math.abs(rMean - overallMean),
        Math.abs(gMean - overallMean),
        Math.abs(bMean - overallMean),
      ) / overallMean * 10000) / 100
    : 0;

  return {
    scopeId: 'rgbParade',
    data,
    shape: [width * 3, BINS],
    metadata: {
      rMin: toIre(rMin),
      rMax: toIre(rMax),
      gMin: toIre(gMin),
      gMax: toIre(gMax),
      bMin: toIre(bMin),
      bMax: toIre(bMax),
      minIre: toIre(Math.min(rMin, gMin, bMin)),
      maxIre: toIre(Math.max(rMax, gMax, bMax)),
      channelImbalance,
    },
  };
}

export const rgbParade: ScopePlugin = {
  id: 'rgbParade',
  name: 'RGB Parade',
  shader: paradeShader,

  getBufferSize(width: number, _height: number): number {
    return width * BINS * 3;
  },

  parseResult(data: Uint32Array, width: number, _height: number): ScopeResult {
    const stride = width * BINS;
    let rMin = 255, rMax = 0, rSum = 0, rCount = 0;
    let gMin = 255, gMax = 0, gSum = 0, gCount = 0;
    let bMin = 255, bMax = 0, bSum = 0, bCount = 0;

    for (let x = 0; x < width; x++) {
      for (let b = 0; b < BINS; b++) {
        const rVal = data[x * BINS + b];
        if (rVal > 0) {
          if (b < rMin) rMin = b;
          if (b > rMax) rMax = b;
          rSum += b * rVal;
          rCount += rVal;
        }
        const gVal = data[stride + x * BINS + b];
        if (gVal > 0) {
          if (b < gMin) gMin = b;
          if (b > gMax) gMax = b;
          gSum += b * gVal;
          gCount += gVal;
        }
        const bVal = data[stride * 2 + x * BINS + b];
        if (bVal > 0) {
          if (b < bMin) bMin = b;
          if (b > bMax) bMax = b;
          bSum += b * bVal;
          bCount += bVal;
        }
      }
    }

    const toIre = (v: number) => Math.round((v / 255) * 10000) / 100;
    const rMean = rCount > 0 ? rSum / rCount : 0;
    const gMean = gCount > 0 ? gSum / gCount : 0;
    const bMean = bCount > 0 ? bSum / bCount : 0;
    const overallMean = (rMean + gMean + bMean) / 3;
    const channelImbalance = overallMean > 0
      ? Math.round(Math.max(
          Math.abs(rMean - overallMean),
          Math.abs(gMean - overallMean),
          Math.abs(bMean - overallMean),
        ) / overallMean * 10000) / 100
      : 0;

    return {
      scopeId: 'rgbParade',
      data,
      shape: [width * 3, BINS],
      metadata: {
        rMin: toIre(rMin),
        rMax: toIre(rMax),
        gMin: toIre(gMin),
        gMax: toIre(gMax),
        bMin: toIre(bMin),
        bMax: toIre(bMax),
        minIre: toIre(Math.min(rMin, gMin, bMin)),
        maxIre: toIre(Math.max(rMax, gMax, bMax)),
        channelImbalance,
      },
    };
  },

  analyzeCpu,
};
