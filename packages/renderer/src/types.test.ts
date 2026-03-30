import { describe, it, expect } from 'vitest';
import { parseHexColor, DEFAULT_APPEARANCE } from './types.js';

describe('parseHexColor', () => {
  it('parses 6-char hex', () => {
    expect(parseHexColor('#ff0000')).toEqual([255, 0, 0]);
    expect(parseHexColor('#00ff00')).toEqual([0, 255, 0]);
    expect(parseHexColor('#0000ff')).toEqual([0, 0, 255]);
  });

  it('parses without hash prefix', () => {
    expect(parseHexColor('ff8800')).toEqual([255, 136, 0]);
  });

  it('parses 3-char shorthand', () => {
    expect(parseHexColor('#fff')).toEqual([255, 255, 255]);
    expect(parseHexColor('#000')).toEqual([0, 0, 0]);
    expect(parseHexColor('#f00')).toEqual([255, 0, 0]);
  });

  it('returns [0,0,0] for invalid input', () => {
    expect(parseHexColor('#xyz')).toEqual([0, 0, 0]);
    expect(parseHexColor('')).toEqual([0, 0, 0]);
  });

  it('handles the demo background color correctly', () => {
    expect(parseHexColor('#111214')).toEqual([17, 18, 20]);
  });

  it('handles graticule line color', () => {
    expect(parseHexColor('#1e2024')).toEqual([30, 32, 36]);
  });
});

describe('DEFAULT_APPEARANCE', () => {
  it('has valid log mapping defaults', () => {
    expect(DEFAULT_APPEARANCE.intensity.mapping).toBe('log');
    expect(DEFAULT_APPEARANCE.intensity.logBias).toBeGreaterThan(0);
    expect(DEFAULT_APPEARANCE.intensity.gain).toBeGreaterThan(0);
  });

  it('background is a valid hex color', () => {
    const [r, g, b] = parseHexColor(DEFAULT_APPEARANCE.background);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
  });

  it('graticule colors are valid hex', () => {
    const line = parseHexColor(DEFAULT_APPEARANCE.graticule.lineColor);
    const label = parseHexColor(DEFAULT_APPEARANCE.graticule.labelColor);
    expect(line.every(c => c >= 0 && c <= 255)).toBe(true);
    expect(label.every(c => c >= 0 && c <= 255)).toBe(true);
  });
});
