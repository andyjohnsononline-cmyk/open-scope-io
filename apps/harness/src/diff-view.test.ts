import { describe, it, expect, beforeAll } from 'vitest';
import { diffImages } from './diff-view.js';

// ssim.js and pixelmatch both accept anything shaped like
// { data: Uint8ClampedArray, width, height }. Node does not expose the DOM
// `ImageData` constructor, so we polyfill a minimal global that matches the
// browser API for the purposes of these tests.
beforeAll(() => {
  if (typeof (globalThis as { ImageData?: unknown }).ImageData === 'undefined') {
    (globalThis as { ImageData: typeof ImageData }).ImageData = class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      colorSpace: 'srgb' = 'srgb';
      constructor(
        dataOrWidth: Uint8ClampedArray | number,
        widthOrHeight: number,
        maybeHeight?: number,
      ) {
        if (typeof dataOrWidth === 'number') {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = dataOrWidth;
          this.width = widthOrHeight;
          this.height = maybeHeight ?? this.data.length / 4 / widthOrHeight;
        }
      }
    } as unknown as typeof ImageData;
  }
});

function imageData(width: number, height: number, fill: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return new ImageData(data, width, height);
}

function noise(width: number, height: number, seed = 1): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed;
  for (let i = 0; i < data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    data[i] = s & 0xff;
    data[i + 1] = (s >> 8) & 0xff;
    data[i + 2] = (s >> 16) & 0xff;
    data[i + 3] = 255;
  }
  return new ImageData(data, width, height);
}

describe('diffImages', () => {
  it('returns 0 different pixels and SSIM ~1 for identical images', () => {
    // ssim.js's Bezkrovny method requires images >= 16x16.
    const a = imageData(32, 32, [128, 64, 32, 255]);
    const b = imageData(32, 32, [128, 64, 32, 255]);
    const result = diffImages(a, b);
    expect(result.diffPixels).toBe(0);
    // ssim.js can return values infinitesimally above 1 due to float rounding;
    // what matters is that it's perceptually ~1.
    expect(result.ssim).toBeGreaterThan(0.999);
    expect(result.ssim).toBeLessThanOrEqual(1 + 1e-9);
    expect(result.diffFraction).toBe(0);
    expect(result.diffImageData.width).toBe(32);
    expect(result.diffImageData.height).toBe(32);
  });

  it('returns >0 different pixels for clearly different images', () => {
    const a = imageData(32, 32, [0, 0, 0, 255]);
    const b = imageData(32, 32, [255, 255, 255, 255]);
    const result = diffImages(a, b);
    expect(result.diffPixels).toBeGreaterThan(0);
    expect(result.diffPixels).toBeLessThanOrEqual(32 * 32);
    expect(result.ssim).toBeLessThan(1);
    expect(result.diffFraction).toBeGreaterThan(0);
  });

  it('returns SSIM < 1 for random noise vs a solid color', () => {
    const a = imageData(32, 32, [128, 128, 128, 255]);
    const b = noise(32, 32, 42);
    const result = diffImages(a, b);
    expect(result.ssim).toBeLessThan(0.95);
    expect(result.diffPixels).toBeGreaterThan(0);
  });

  it('throws when dimensions mismatch', () => {
    const a = imageData(32, 32, [0, 0, 0, 255]);
    const b = imageData(32, 16, [0, 0, 0, 255]);
    expect(() => diffImages(a, b)).toThrow(/dimension mismatch/);
  });

  it('throws on zero-dimension input', () => {
    // We construct via the shim directly to sidestep the constructor's check.
    const a = new ImageData(new Uint8ClampedArray(0), 0, 0);
    const b = new ImageData(new Uint8ClampedArray(0), 0, 0);
    expect(() => diffImages(a, b)).toThrow(/non-positive dimensions/);
  });
});
