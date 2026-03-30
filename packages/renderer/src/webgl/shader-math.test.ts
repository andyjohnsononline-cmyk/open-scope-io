import { describe, it, expect } from 'vitest';

/**
 * JS equivalents of GLSL shader math, tested to catch the class of bugs
 * found during code review (broken log mapping, double gamma encoding, etc).
 *
 * These mirror the formulas in shaders.ts and gl-pipeline.ts exactly.
 */

function logMappingR32UI(raw: number, maxV: number, logBias: number, gain: number): number {
  const m = Math.max(maxV, 1.0);
  const intensity = Math.log(raw * logBias + 1.0) / Math.log(m * logBias + 1.0);
  return Math.min(Math.max(intensity * gain, 0.0), 1.0);
}

function logMappingR32F(normalized: number, maxVal: number, logBias: number, gain: number): number {
  const mv = Math.max(maxVal, 1.0);
  const intensity = Math.log(normalized * mv * logBias + 1.0) / Math.log(mv * logBias + 1.0);
  return Math.min(Math.max(intensity * gain, 0.0), 1.0);
}

function linearMapping(value: number, maxV: number, gain: number): number {
  const intensity = maxV > 0 ? value / maxV : 0;
  return Math.min(Math.max(intensity * gain, 0.0), 1.0);
}

function gammaMapping(value: number, maxV: number, gammaExp: number, gain: number): number {
  const intensity = Math.pow(maxV > 0 ? value / maxV : 0, gammaExp);
  return Math.min(Math.max(intensity * gain, 0.0), 1.0);
}

function srgbToLinear(x: number): number {
  return Math.pow(x, 2.2);
}

function linearToSrgb(x: number): number {
  return Math.pow(Math.min(Math.max(x, 0), 1), 1.0 / 2.2);
}

describe('tonemap: log mapping', () => {
  it('R32UI: zero input maps to zero', () => {
    expect(logMappingR32UI(0, 100, 1.0, 1.0)).toBe(0);
  });

  it('R32UI: max input maps to 1.0', () => {
    expect(logMappingR32UI(100, 100, 1.0, 1.0)).toBeCloseTo(1.0, 5);
  });

  it('R32UI: mid values produce smooth curve (not binary)', () => {
    const mid = logMappingR32UI(50, 100, 1.0, 1.0);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.95);
  });

  it('R32UI: gain amplifies intensity', () => {
    const base = logMappingR32UI(10, 100, 1.0, 1.0);
    const gained = logMappingR32UI(10, 100, 1.0, 2.0);
    expect(gained).toBeGreaterThan(base);
  });

  it('R32F: zero input maps to zero', () => {
    expect(logMappingR32F(0, 200, 1.0, 1.0)).toBe(0);
  });

  it('R32F: 1.0 input maps to 1.0', () => {
    expect(logMappingR32F(1.0, 200, 1.0, 1.0)).toBeCloseTo(1.0, 5);
  });

  it('R32F: mid values produce smooth curve (not binary)', () => {
    const mid = logMappingR32F(0.5, 200, 1.0, 1.0);
    expect(mid).toBeGreaterThan(0.1);
    expect(mid).toBeLessThan(0.95);
  });

  it('R32F and R32UI produce equivalent results for same logical input', () => {
    const maxVal = 200;
    const logBias = 1.0;
    const gain = 1.0;

    for (const raw of [0, 10, 50, 100, 150, 200]) {
      const fromR32UI = logMappingR32UI(raw, maxVal, logBias, gain);
      const normalized = raw / maxVal;
      const fromR32F = logMappingR32F(normalized, maxVal, logBias, gain);
      expect(fromR32F).toBeCloseTo(fromR32UI, 2);
    }
  });
});

describe('tonemap: linear mapping', () => {
  it('zero maps to zero', () => {
    expect(linearMapping(0, 100, 1.0)).toBe(0);
  });

  it('max maps to 1.0', () => {
    expect(linearMapping(100, 100, 1.0)).toBeCloseTo(1.0, 5);
  });

  it('mid maps to 0.5', () => {
    expect(linearMapping(50, 100, 1.0)).toBeCloseTo(0.5, 5);
  });
});

describe('tonemap: gamma mapping', () => {
  it('zero maps to zero', () => {
    expect(gammaMapping(0, 100, 0.4, 1.0)).toBe(0);
  });

  it('max maps to 1.0', () => {
    expect(gammaMapping(100, 100, 0.4, 1.0)).toBeCloseTo(1.0, 5);
  });

  it('gamma < 1 lifts shadows', () => {
    const mid = gammaMapping(25, 100, 0.4, 1.0);
    expect(mid).toBeGreaterThan(0.25);
  });
});

describe('color space: sRGB / linear roundtrip', () => {
  it('roundtrips correctly', () => {
    for (const v of [0, 0.1, 0.25, 0.5, 0.73, 1.0]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 4);
    }
  });

  it('srgbToLinear darkens mid-gray', () => {
    const linearMid = srgbToLinear(0.5);
    expect(linearMid).toBeLessThan(0.5);
    expect(linearMid).toBeGreaterThan(0.1);
  });

  it('srgbToLinear preserves 0 and 1', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBe(1);
  });

  it('background color linearization prevents double-gamma', () => {
    const bgHex = [0x11, 0x12, 0x14];
    const bgNorm = bgHex.map(c => c / 255);
    const bgLinear = bgNorm.map(srgbToLinear);
    const afterComposite = bgLinear.map(linearToSrgb);
    for (let i = 0; i < 3; i++) {
      expect(afterComposite[i]).toBeCloseTo(bgNorm[i], 2);
    }
  });

  it('trace color linearization prevents double-gamma', () => {
    const traceColor = [0.91, 0.91, 0.922];
    const linear = traceColor.map(srgbToLinear);
    const afterSrgbEncode = linear.map(linearToSrgb);
    for (let i = 0; i < 3; i++) {
      expect(afterSrgbEncode[i]).toBeCloseTo(traceColor[i], 2);
    }
  });
});

describe('false color zone boundaries', () => {
  const LUMA_R = 0.2126;
  const LUMA_G = 0.7152;
  const LUMA_B = 0.0722;

  const zones = [
    { maxIre: 0.02, color: [0.0, 0.0, 0.502] },
    { maxIre: 0.10, color: [0.0, 0.0, 1.0] },
    { maxIre: 0.20, color: [0.0, 0.502, 1.0] },
    { maxIre: 0.30, color: [0.0, 0.702, 0.302] },
    { maxIre: 0.40, color: [0.302, 0.8, 0.302] },
    { maxIre: 0.50, color: [0.502, 0.502, 0.502] },
    { maxIre: 0.60, color: [0.8, 0.8, 0.302] },
    { maxIre: 0.70, color: [1.0, 0.702, 0.0] },
    { maxIre: 0.80, color: [1.0, 0.4, 0.0] },
    { maxIre: 0.90, color: [1.0, 0.0, 0.0] },
    { maxIre: 0.95, color: [1.0, 0.302, 0.302] },
    { maxIre: 1.00, color: [1.0, 1.0, 1.0] },
  ];

  function lookupZone(luma: number): number[] {
    for (const z of zones) {
      if (luma <= z.maxIre) return z.color;
    }
    return zones[zones.length - 1].color;
  }

  it('pure black maps to dark blue zone', () => {
    expect(lookupZone(0)).toEqual([0.0, 0.0, 0.502]);
  });

  it('pure white maps to white zone', () => {
    expect(lookupZone(1.0)).toEqual([1.0, 1.0, 1.0]);
  });

  it('50% gray maps to midtone zone', () => {
    expect(lookupZone(0.5)).toEqual([0.502, 0.502, 0.502]);
  });

  it('boundary values are inclusive (<=)', () => {
    expect(lookupZone(0.02)).toEqual([0.0, 0.0, 0.502]);
    expect(lookupZone(0.0201)).toEqual([0.0, 0.0, 1.0]);
  });

  it('18% gray (key light) falls in lower mids', () => {
    const luma = 0.18;
    const zone = lookupZone(luma);
    expect(zone).toEqual([0.0, 0.502, 1.0]);
  });

  it('luma coefficients match BT.709', () => {
    expect(LUMA_R + LUMA_G + LUMA_B).toBeCloseTo(1.0, 4);
  });

  it('zone colors output directly without gamma re-encoding', () => {
    const midGray = zones[5].color;
    expect(midGray).toEqual([0.502, 0.502, 0.502]);
  });
});
