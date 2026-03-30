import { describe, it, expect } from 'vitest';
import {
  waveformGraticuleLines,
  vectorscopeGraticuleLines,
  histogramGraticuleLines,
} from './gl-graticules.js';

describe('waveformGraticuleLines', () => {
  it('produces 5 horizontal lines (0, 25, 50, 75, 100 IRE)', () => {
    const lines = waveformGraticuleLines(400, 300);
    expect(lines.length).toBe(5 * 4); // 5 lines, 4 floats each (x1,y1,x2,y2)
  });

  it('lines span full width', () => {
    const w = 400;
    const lines = waveformGraticuleLines(w, 300);
    for (let i = 0; i < 5; i++) {
      expect(lines[i * 4]).toBe(0);     // x1 = 0
      expect(lines[i * 4 + 2]).toBe(w); // x2 = width
    }
  });

  it('0 IRE line is at bottom, 100 IRE at top', () => {
    const h = 300;
    const lines = waveformGraticuleLines(400, h);
    const y0 = lines[1];   // 0 IRE y
    const y100 = lines[17]; // 100 IRE y (5th line, index 4*4+1)
    expect(y0).toBe(h);     // 0 IRE = bottom
    expect(y100).toBe(0);   // 100 IRE = top
  });

  it('50 IRE line is at vertical center', () => {
    const h = 300;
    const lines = waveformGraticuleLines(400, h);
    const y50 = lines[9]; // 3rd line (index 2*4+1)
    expect(y50).toBe(h / 2);
  });
});

describe('vectorscopeGraticuleLines', () => {
  it('produces crosshairs and two circles', () => {
    const lines = vectorscopeGraticuleLines(400, 400);
    // 2 crosshair lines + 64 segments * 2 circles = 130 lines
    // Each line is 4 floats (x1,y1,x2,y2)
    expect(lines.length).toBe(130 * 4);
  });

  it('crosshairs pass through center', () => {
    const w = 400, h = 400;
    const lines = vectorscopeGraticuleLines(w, h);
    const cx = w / 2, cy = h / 2;

    // Horizontal crosshair: y1 = cy, y2 = cy
    expect(lines[1]).toBe(cy);
    expect(lines[3]).toBe(cy);

    // Vertical crosshair: x1 = cx, x2 = cx
    expect(lines[4]).toBe(cx);
    expect(lines[6]).toBe(cx);
  });

  it('circle points are within canvas bounds', () => {
    const w = 400, h = 400;
    const lines = vectorscopeGraticuleLines(w, h);
    for (let i = 0; i < lines.length; i += 2) {
      const x = lines[i];
      const y = lines[i + 1];
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(w + 1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(h + 1);
    }
  });
});

describe('histogramGraticuleLines', () => {
  it('produces bottom axis + 5 tick marks', () => {
    const lines = histogramGraticuleLines(400, 300);
    // 1 axis line + 5 tick lines = 6 lines, 4 floats each
    expect(lines.length).toBe(6 * 4);
  });

  it('ticks at expected positions (0, 64, 128, 192, 255)', () => {
    const w = 400, h = 300;
    const padding = 4;
    const drawW = w - padding * 2;
    const lines = histogramGraticuleLines(w, h);

    const expectedVals = [0, 64, 128, 192, 255];
    for (let i = 0; i < expectedVals.length; i++) {
      const tickX = lines[(i + 1) * 4]; // skip axis line
      const expected = padding + (expectedVals[i] / 255) * drawW;
      expect(tickX).toBeCloseTo(expected, 2);
    }
  });
});
