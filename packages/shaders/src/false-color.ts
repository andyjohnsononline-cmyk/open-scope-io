import type { ScopePlugin, ScopeResult } from '@openscope/core';
import { luma } from './utils.js';

const BINS = 256;

/**
 * Default false color zone boundaries (IRE / 100).
 * The GPU shader uses the same thresholds.
 */
export const DEFAULT_ZONES = [
  { maxIre: 2,  color: [0, 0, 128] as const,    label: 'Black' },
  { maxIre: 10, color: [0, 0, 255] as const,    label: 'Near black' },
  { maxIre: 20, color: [0, 128, 255] as const,  label: 'Shadows' },
  { maxIre: 30, color: [0, 179, 77] as const,   label: 'Low mids' },
  { maxIre: 40, color: [77, 204, 77] as const,  label: 'Lower mids' },
  { maxIre: 50, color: [128, 128, 128] as const, label: 'Midtones' },
  { maxIre: 60, color: [204, 204, 77] as const, label: 'Upper mids' },
  { maxIre: 70, color: [255, 179, 0] as const,  label: 'Highlights' },
  { maxIre: 80, color: [255, 102, 0] as const,  label: 'Bright highlights' },
  { maxIre: 90, color: [255, 0, 0] as const,    label: 'Near clip' },
  { maxIre: 95, color: [255, 77, 77] as const,  label: 'Clip warning' },
  { maxIre: 100, color: [255, 255, 255] as const, label: 'Clipping' },
] as const;

export const falseColorShader = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inputTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(inputTexture, vec2u(gid.x, gid.y), 0);
  let luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
  let bin = u32(clamp(luma * 255.0, 0.0, 255.0));

  atomicAdd(&output[bin], 1u);
}
`;

function analyzeCpu(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ScopeResult {
  const data = new Uint32Array(BINS);
  const totalPixels = width * height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const l = Math.round(luma(pixels[i], pixels[i + 1], pixels[i + 2]));
      data[Math.min(l, 255)]++;
    }
  }

  return buildResult(data, totalPixels);
}

function buildResult(data: Uint32Array, totalPixels: number): ScopeResult {
  let below16 = 0;
  let above90 = 0;
  let minBin = 255;
  let maxBin = 0;

  const ire16Bin = Math.round(0.16 * 255);
  const ire90Bin = Math.round(0.90 * 255);

  for (let b = 0; b < BINS; b++) {
    if (data[b] > 0) {
      if (b < minBin) minBin = b;
      if (b > maxBin) maxBin = b;
    }
    if (b <= ire16Bin) below16 += data[b];
    if (b >= ire90Bin) above90 += data[b];
  }

  const inRange = totalPixels - below16 - above90;
  const toIre = (bin: number) => Math.round((bin / 255) * 10000) / 100;

  return {
    scopeId: 'falseColor',
    data,
    shape: [1, BINS],
    metadata: {
      percentBelow16Ire: Math.round((below16 / totalPixels) * 10000) / 100,
      percentAbove90Ire: Math.round((above90 / totalPixels) * 10000) / 100,
      percentInRange: Math.round((inRange / totalPixels) * 10000) / 100,
      dynamicRangeIre: toIre(maxBin) - toIre(minBin),
    },
  };
}

export const falseColor: ScopePlugin = {
  id: 'falseColor',
  name: 'False Color',
  shader: falseColorShader,

  getBufferSize(_width: number, _height: number): number {
    return BINS;
  },

  parseResult(data: Uint32Array, width: number, height: number): ScopeResult {
    return buildResult(data, width * height);
  },

  analyzeCpu,
};
