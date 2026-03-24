import { describe, it, expect } from 'vitest';
import { waveform } from './waveform.js';

function createGradient(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = Math.round((x / (width - 1)) * 255);
      data[i] = v;     // R
      data[i + 1] = v; // G
      data[i + 2] = v; // B
      data[i + 3] = 255;
    }
  }
  return data;
}

function createSolidColor(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

describe('waveform scope', () => {
  it('has correct id and name', () => {
    expect(waveform.id).toBe('waveform');
    expect(waveform.name).toBe('Luma Waveform');
  });

  it('analyzes a horizontal gradient correctly', () => {
    const width = 64;
    const height = 32;
    const pixels = createGradient(width, height);
    const result = waveform.analyzeCpu!(pixels, width, height);

    expect(result.scopeId).toBe('waveform');
    expect(result.shape).toEqual([width, 256]);
    expect(result.data.length).toBe(width * 256);

    // First column: all pixels are black (luma ≈ 0)
    expect(result.data[0 * 256 + 0]).toBe(height);

    // Last column: all pixels are white (luma ≈ 255)
    expect(result.data[(width - 1) * 256 + 255]).toBe(height);

    // Middle column should have all pixels in one bin
    const midCol = Math.floor(width / 2);
    let midTotal = 0;
    for (let b = 0; b < 256; b++) {
      midTotal += result.data[midCol * 256 + b];
    }
    expect(midTotal).toBe(height);
  });

  it('reports correct metadata for mid-gray', () => {
    const width = 16;
    const height = 16;
    const pixels = createSolidColor(width, height, 128, 128, 128);
    const result = waveform.analyzeCpu!(pixels, width, height);

    expect(result.metadata.clippingShadows).toBe(false);
    expect(result.metadata.clippingHighlights).toBe(false);
    expect(typeof result.metadata.minIre).toBe('number');
    expect(typeof result.metadata.maxIre).toBe('number');
    expect(typeof result.metadata.meanIre).toBe('number');

    const meanIre = result.metadata.meanIre as number;
    expect(meanIre).toBeGreaterThan(45);
    expect(meanIre).toBeLessThan(55);
  });

  it('detects shadow clipping', () => {
    const width = 16;
    const height = 16;
    const pixels = createSolidColor(width, height, 0, 0, 0);
    const result = waveform.analyzeCpu!(pixels, width, height);

    expect(result.metadata.clippingShadows).toBe(true);
    expect(result.metadata.clippingHighlights).toBe(false);
  });

  it('detects highlight clipping', () => {
    const width = 16;
    const height = 16;
    const pixels = createSolidColor(width, height, 255, 255, 255);
    const result = waveform.analyzeCpu!(pixels, width, height);

    expect(result.metadata.clippingShadows).toBe(false);
    expect(result.metadata.clippingHighlights).toBe(true);
  });

  it('getBufferSize returns width * 256', () => {
    expect(waveform.getBufferSize!(1920, 1080)).toBe(1920 * 256);
  });

  it('parseResult produces valid ScopeResult from raw buffer', () => {
    const width = 4;
    const height = 2;
    const buffer = new Uint32Array(width * 256);
    buffer[0 * 256 + 128] = 2;
    buffer[1 * 256 + 64] = 2;
    buffer[2 * 256 + 192] = 2;
    buffer[3 * 256 + 255] = 2;

    const result = waveform.parseResult!(buffer, width, height);
    expect(result.scopeId).toBe('waveform');
    expect(result.shape).toEqual([4, 256]);
    expect(result.metadata.minIre).toBeCloseTo(25.1, 0);
    expect(result.metadata.maxIre).toBe(100);
  });
});
