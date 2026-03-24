import type { ScopePlugin, ScopeResult } from '@openscope/core';
import { luma, clamp } from './utils.js';

const GRID = 512;

export const vectorscopeShader = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inputTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(inputTexture, vec2u(gid.x, gid.y), 0);

  // BT.709 YCbCr
  let y  = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
  let cb = (pixel.b - y) / 1.8556;
  let cr = (pixel.r - y) / 1.5748;

  // Map [-0.5, 0.5] → [0, 511]
  let xPos = u32(clamp((cb + 0.5) * 511.0, 0.0, 511.0));
  let yPos = u32(clamp((cr + 0.5) * 511.0, 0.0, 511.0));

  atomicAdd(&output[yPos * 512u + xPos], 1u);
}
`;

function analyzeCpu(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ScopeResult {
  const data = new Uint32Array(GRID * GRID);
  let satPeak = 0;
  let satTotal = 0;
  const totalPixels = width * height;

  // Skin tone line: approximately 123° in vectorscope (Cb ≈ -0.1, Cr ≈ 0.15)
  let skinLineDeviationTotal = 0;
  let skinPixelCount = 0;
  const skinAngle = (123 * Math.PI) / 180;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = pixels[i] / 255;
      const g = pixels[i + 1] / 255;
      const b = pixels[i + 2] / 255;

      const yLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const cb = (b - yLuma) / 1.8556;
      const cr = (r - yLuma) / 1.5748;

      const xPos = clamp(Math.round((cb + 0.5) * 511), 0, 511);
      const yPos = clamp(Math.round((cr + 0.5) * 511), 0, 511);
      data[yPos * GRID + xPos]++;

      const sat = Math.sqrt(cb * cb + cr * cr);
      if (sat > satPeak) satPeak = sat;
      satTotal += sat;

      // Skin tone detection: check if pixel is near skin tone line
      if (sat > 0.02) {
        const angle = Math.atan2(cr, cb);
        const deviation = Math.abs(angle - skinAngle);
        const devDeg = (Math.min(deviation, 2 * Math.PI - deviation) * 180) / Math.PI;
        if (devDeg < 30) {
          skinLineDeviationTotal += devDeg;
          skinPixelCount++;
        }
      }
    }
  }

  return {
    scopeId: 'vectorscope',
    data,
    shape: [GRID, GRID],
    metadata: {
      saturationPeak: Math.round(satPeak * 10000) / 10000,
      saturationMean: Math.round((satTotal / totalPixels) * 10000) / 10000,
      skinToneLineDeviationDegrees:
        skinPixelCount > 0
          ? Math.round((skinLineDeviationTotal / skinPixelCount) * 100) / 100
          : 0,
    },
  };
}

export const vectorscope: ScopePlugin = {
  id: 'vectorscope',
  name: 'Vectorscope',
  shader: vectorscopeShader,

  getBufferSize(_width: number, _height: number): number {
    return GRID * GRID;
  },

  parseResult(data: Uint32Array, width: number, height: number): ScopeResult {
    const totalPixels = width * height;
    let satPeak = 0;
    let satTotal = 0;
    let totalPlotted = 0;

    for (let cy = 0; cy < GRID; cy++) {
      for (let cx = 0; cx < GRID; cx++) {
        const count = data[cy * GRID + cx];
        if (count === 0) continue;

        const cb = (cx / 511) - 0.5;
        const cr = (cy / 511) - 0.5;
        const sat = Math.sqrt(cb * cb + cr * cr);

        if (sat > satPeak) satPeak = sat;
        satTotal += sat * count;
        totalPlotted += count;
      }
    }

    return {
      scopeId: 'vectorscope',
      data,
      shape: [GRID, GRID],
      metadata: {
        saturationPeak: Math.round(satPeak * 10000) / 10000,
        saturationMean:
          totalPlotted > 0
            ? Math.round((satTotal / totalPlotted) * 10000) / 10000
            : 0,
        skinToneLineDeviationDegrees: 0,
      },
    };
  },

  analyzeCpu,
};
