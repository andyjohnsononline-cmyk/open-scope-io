import { describe, it, expect, beforeAll } from 'vitest';
import { createCpuPipeline, type ScopeResult } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import {
  generateSolidColor,
  SOLID_PRESETS,
  generateHorizontalGradient,
  generateVerticalGradient,
  generateCheckerboard,
  generateSinglePixel,
  generateSeededNoise,
  generateSMPTEBars,
  getBarColumnRanges,
  SMPTE_75_BARS,
  SMPTE_100_BARS,
} from './generators/index.js';
import {
  checkHistogramInvariants,
  checkWaveformInvariants,
  checkParadeInvariants,
  checkVectorscopeInvariants,
  checkCrossScopeInvariants,
} from './invariants/index.js';

const W = 64;
const H = 32;
const BINS = 256;
const TOTAL = W * H;

function createPipeline() {
  const pipeline = createCpuPipeline();
  for (const scope of allScopes) {
    pipeline.register(scope);
  }
  return pipeline;
}

function bt709Luma(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

// ============================================================
// TIER 1: Synthetic Ground Truth — Golden Tests
// ============================================================

describe('Tier 1: Golden Tests — Solid Colors', () => {
  const pipeline = createPipeline();

  describe('pure black (0,0,0)', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateSolidColor(W, H, 0, 0, 0);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: all pixels in bin[0] for R, G, B, Luma', () => {
      const hist = results.get('histogram')!;
      for (let ch = 0; ch < 4; ch++) {
        expect(hist.data[ch * BINS + 0]).toBe(TOTAL);
        for (let b = 1; b < BINS; b++) {
          expect(hist.data[ch * BINS + b]).toBe(0);
        }
      }
    });

    it('waveform: all columns have value 0', () => {
      const wf = results.get('waveform')!;
      for (let x = 0; x < W; x++) {
        expect(wf.data[x * BINS + 0]).toBe(H);
        for (let b = 1; b < BINS; b++) {
          expect(wf.data[x * BINS + b]).toBe(0);
        }
      }
    });

    it('vectorscope: all samples at center', () => {
      const vs = results.get('vectorscope')!;
      const centerX = Math.round(0.5 * 511);
      const centerY = Math.round(0.5 * 511);
      expect(vs.data[centerY * 512 + centerX]).toBe(TOTAL);
    });

    it('false color: all pixels in bin[0]', () => {
      const fc = results.get('falseColor')!;
      expect(fc.data[0]).toBe(TOTAL);
      for (let b = 1; b < BINS; b++) {
        expect(fc.data[b]).toBe(0);
      }
    });
  });

  describe('pure white (255,255,255)', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateSolidColor(W, H, 255, 255, 255);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: all pixels in bin[255] for R, G, B, Luma', () => {
      const hist = results.get('histogram')!;
      for (let ch = 0; ch < 4; ch++) {
        expect(hist.data[ch * BINS + 255]).toBe(TOTAL);
        for (let b = 0; b < 255; b++) {
          expect(hist.data[ch * BINS + b]).toBe(0);
        }
      }
    });

    it('waveform: all columns have value 255', () => {
      const wf = results.get('waveform')!;
      for (let x = 0; x < W; x++) {
        expect(wf.data[x * BINS + 255]).toBe(H);
      }
    });

    it('false color: all pixels in bin[255]', () => {
      const fc = results.get('falseColor')!;
      expect(fc.data[255]).toBe(TOTAL);
    });
  });

  describe('50% gray (128,128,128)', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateSolidColor(W, H, 128, 128, 128);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: all pixels in bin[128] for all channels', () => {
      const hist = results.get('histogram')!;
      for (let ch = 0; ch < 4; ch++) {
        expect(hist.data[ch * BINS + 128]).toBe(TOTAL);
      }
    });

    it('vectorscope: all at center (neutral = zero chroma)', () => {
      const vs = results.get('vectorscope')!;
      const centerX = Math.round(0.5 * 511);
      const centerY = Math.round(0.5 * 511);
      expect(vs.data[centerY * 512 + centerX]).toBe(TOTAL);
    });

    it('waveform: mid-range IRE around 50%', () => {
      const wf = results.get('waveform')!;
      const meanIre = wf.metadata.meanIre as number;
      expect(meanIre).toBeGreaterThan(48);
      expect(meanIre).toBeLessThan(52);
    });
  });

  describe('pure red (255,0,0)', () => {
    let results: Map<string, ScopeResult>;
    const expectedLuma = bt709Luma(255, 0, 0); // ≈ 54

    beforeAll(async () => {
      const pixels = generateSolidColor(W, H, 255, 0, 0);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: R channel at 255, G/B at 0', () => {
      const hist = results.get('histogram')!;
      expect(hist.data[0 * BINS + 255]).toBe(TOTAL); // R
      expect(hist.data[1 * BINS + 0]).toBe(TOTAL);   // G
      expect(hist.data[2 * BINS + 0]).toBe(TOTAL);   // B
    });

    it('histogram: luma at expected BT.709 value', () => {
      const hist = results.get('histogram')!;
      expect(hist.data[3 * BINS + expectedLuma]).toBe(TOTAL);
    });

    it('waveform: all columns at luma value', () => {
      const wf = results.get('waveform')!;
      for (let x = 0; x < W; x++) {
        expect(wf.data[x * BINS + expectedLuma]).toBe(H);
      }
    });

    it('parade: R channel at 255, G/B channels at 0', () => {
      const p = results.get('rgbParade')!;
      const stride = W * BINS;
      for (let x = 0; x < W; x++) {
        expect(p.data[x * BINS + 255]).toBe(H);          // R
        expect(p.data[stride + x * BINS + 0]).toBe(H);   // G
        expect(p.data[stride * 2 + x * BINS + 0]).toBe(H); // B
      }
    });
  });

  describe('pure green (0,255,0)', () => {
    let results: Map<string, ScopeResult>;
    const expectedLuma = bt709Luma(0, 255, 0); // ≈ 182

    beforeAll(async () => {
      const pixels = generateSolidColor(W, H, 0, 255, 0);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: G at 255, R/B at 0, luma at BT.709 value', () => {
      const hist = results.get('histogram')!;
      expect(hist.data[0 * BINS + 0]).toBe(TOTAL);   // R
      expect(hist.data[1 * BINS + 255]).toBe(TOTAL);  // G
      expect(hist.data[2 * BINS + 0]).toBe(TOTAL);    // B
      expect(hist.data[3 * BINS + expectedLuma]).toBe(TOTAL);
    });
  });

  describe('pure blue (0,0,255)', () => {
    let results: Map<string, ScopeResult>;
    const expectedLuma = bt709Luma(0, 0, 255); // ≈ 18

    beforeAll(async () => {
      const pixels = generateSolidColor(W, H, 0, 0, 255);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: B at 255, R/G at 0, luma at BT.709 value', () => {
      const hist = results.get('histogram')!;
      expect(hist.data[0 * BINS + 0]).toBe(TOTAL);   // R
      expect(hist.data[1 * BINS + 0]).toBe(TOTAL);    // G
      expect(hist.data[2 * BINS + 255]).toBe(TOTAL);  // B
      expect(hist.data[3 * BINS + expectedLuma]).toBe(TOTAL);
    });
  });
});

describe('Tier 1: Golden Tests — Edge Cases', () => {
  const pipeline = createPipeline();

  describe('checkerboard (1px black/white)', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateCheckerboard(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: exactly 2 bins populated (0 and 255)', () => {
      const hist = results.get('histogram')!;
      const blackCount = hist.data[3 * BINS + 0];
      const whiteCount = hist.data[3 * BINS + 255];
      expect(blackCount + whiteCount).toBe(TOTAL);
      expect(blackCount).toBe(TOTAL / 2);
      expect(whiteCount).toBe(TOTAL / 2);
    });
  });

  describe('single red pixel on black', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateSinglePixel(W, H, 255, 0, 0);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: R bin[255]=1, R bin[0]=total-1', () => {
      const hist = results.get('histogram')!;
      expect(hist.data[0 * BINS + 255]).toBe(1);       // R channel, 1 red pixel
      expect(hist.data[0 * BINS + 0]).toBe(TOTAL - 1);  // R channel, rest are black
    });

    it('histogram: G and B all at 0', () => {
      const hist = results.get('histogram')!;
      expect(hist.data[1 * BINS + 0]).toBe(TOTAL); // G
      expect(hist.data[2 * BINS + 0]).toBe(TOTAL); // B
    });
  });
});

describe('Tier 1: Golden Tests — Horizontal Gradient', () => {
  const pipeline = createPipeline();
  let results: Map<string, ScopeResult>;

  beforeAll(async () => {
    const pixels = generateHorizontalGradient(W, H);
    results = await pipeline.analyze({ data: pixels, width: W, height: H });
  });

  it('waveform: each column concentrated at expected luma', () => {
    const wf = results.get('waveform')!;
    for (let x = 0; x < W; x++) {
      const expectedVal = Math.round((x / (W - 1)) * 255);
      expect(wf.data[x * BINS + expectedVal]).toBe(H);
    }
  });

  it('histogram: luma bins roughly uniform', () => {
    const hist = results.get('histogram')!;
    const lumaOffset = 3 * BINS;
    let nonZeroBins = 0;
    for (let b = 0; b < BINS; b++) {
      if (hist.data[lumaOffset + b] > 0) nonZeroBins++;
    }
    // With W=64 columns, we expect exactly 64 distinct luma values
    expect(nonZeroBins).toBe(W);
  });
});

describe('Tier 1: Golden Tests — SMPTE 75% Bars', () => {
  const pipeline = createPipeline();
  const SMPTE_W = 256;
  const SMPTE_H = 64;
  let results: Map<string, ScopeResult>;

  beforeAll(async () => {
    const pixels = generateSMPTEBars(SMPTE_W, SMPTE_H, SMPTE_75_BARS);
    results = await pipeline.analyze(
      { data: pixels, width: SMPTE_W, height: SMPTE_H },
    );
  });

  it('histogram: contains peaks at each bar luma value', () => {
    const hist = results.get('histogram')!;
    const lumaOffset = 3 * BINS;

    for (const bar of SMPTE_75_BARS) {
      const expectedLuma = bt709Luma(bar.r, bar.g, bar.b);
      // Allow ±1 for rounding
      const count =
        hist.data[lumaOffset + expectedLuma] +
        (expectedLuma > 0 ? hist.data[lumaOffset + expectedLuma - 1] : 0) +
        (expectedLuma < 255 ? hist.data[lumaOffset + expectedLuma + 1] : 0);
      expect(count).toBeGreaterThan(0);
    }
  });

  it('histogram: R channel has peaks at bar R values', () => {
    const hist = results.get('histogram')!;
    const uniqueR = new Set(SMPTE_75_BARS.map((b) => b.r));
    for (const rVal of uniqueR) {
      expect(hist.data[0 * BINS + rVal]).toBeGreaterThan(0);
    }
  });

  it('waveform: descending staircase pattern (left to right)', () => {
    const wf = results.get('waveform')!;
    const ranges = getBarColumnRanges(SMPTE_W, SMPTE_75_BARS.length);

    const barLumas = SMPTE_75_BARS.map((b) => bt709Luma(b.r, b.g, b.b));

    for (let i = 0; i < ranges.length; i++) {
      const [start, end] = ranges[i];
      const midCol = Math.floor((start + end) / 2);
      const expectedBin = barLumas[i];
      // All pixels in this column should be at the bar's luma (±1)
      let found = wf.data[midCol * BINS + expectedBin];
      if (expectedBin > 0) found += wf.data[midCol * BINS + expectedBin - 1];
      if (expectedBin < 255) found += wf.data[midCol * BINS + expectedBin + 1];
      expect(found).toBe(SMPTE_H);
    }

    // Verify descending order
    for (let i = 1; i < barLumas.length; i++) {
      expect(barLumas[i]).toBeLessThan(barLumas[i - 1]);
    }
  });
});

// ============================================================
// TIER 2: Property-Based Invariants
// ============================================================

describe('Tier 2: Invariants — All test images', () => {
  const pipeline = createPipeline();

  const testImages = [
    { name: 'black', gen: () => generateSolidColor(W, H, 0, 0, 0) },
    { name: 'white', gen: () => generateSolidColor(W, H, 255, 255, 255) },
    { name: 'mid-gray', gen: () => generateSolidColor(W, H, 128, 128, 128) },
    { name: 'pure red', gen: () => generateSolidColor(W, H, 255, 0, 0) },
    { name: 'pure green', gen: () => generateSolidColor(W, H, 0, 255, 0) },
    { name: 'pure blue', gen: () => generateSolidColor(W, H, 0, 0, 255) },
    { name: 'horizontal gradient', gen: () => generateHorizontalGradient(W, H) },
    { name: 'vertical gradient', gen: () => generateVerticalGradient(W, H) },
    { name: 'checkerboard', gen: () => generateCheckerboard(W, H) },
    { name: 'single red pixel', gen: () => generateSinglePixel(W, H, 255, 0, 0) },
    { name: 'seeded noise', gen: () => generateSeededNoise(W, H, 42) },
    { name: 'SMPTE 75% bars', gen: () => generateSMPTEBars(W, H, SMPTE_75_BARS) },
    { name: 'SMPTE 100% bars', gen: () => generateSMPTEBars(W, H, SMPTE_100_BARS) },
  ];

  for (const { name, gen } of testImages) {
    describe(`"${name}"`, () => {
      let results: Map<string, ScopeResult>;

      beforeAll(async () => {
        const pixels = gen();
        results = await pipeline.analyze({ data: pixels, width: W, height: H });
      });

      it('histogram invariants hold', () => {
        const violations = checkHistogramInvariants(
          results.get('histogram')!,
          W,
          H,
        );
        expect(violations).toEqual([]);
      });

      it('waveform invariants hold', () => {
        const violations = checkWaveformInvariants(
          results.get('waveform')!,
          W,
          H,
        );
        expect(violations).toEqual([]);
      });

      it('RGB parade invariants hold', () => {
        const violations = checkParadeInvariants(
          results.get('rgbParade')!,
          W,
          H,
        );
        expect(violations).toEqual([]);
      });

      it('vectorscope invariants hold', () => {
        const violations = checkVectorscopeInvariants(
          results.get('vectorscope')!,
          W,
          H,
        );
        expect(violations).toEqual([]);
      });

      it('cross-scope consistency holds', () => {
        const violations = checkCrossScopeInvariants(results, W, H);
        expect(violations).toEqual([]);
      });
    });
  }
});

// ============================================================
// TIER 2: Statistical Tests
// ============================================================

describe('Tier 2: Statistical — Seeded Noise', () => {
  const pipeline = createPipeline();
  const NOISE_W = 256;
  const NOISE_H = 256;
  const NOISE_TOTAL = NOISE_W * NOISE_H;
  let results: Map<string, ScopeResult>;

  beforeAll(async () => {
    const pixels = generateSeededNoise(NOISE_W, NOISE_H, 42);
    results = await pipeline.analyze(
      { data: pixels, width: NOISE_W, height: NOISE_H },
    );
  });

  it('histogram: each R channel bin within 3σ of uniform', () => {
    const hist = results.get('histogram')!;
    const expectedMean = NOISE_TOTAL / BINS;
    const sigma = Math.sqrt(expectedMean * (1 - 1 / BINS));
    const tolerance = 3 * sigma;

    let outliers = 0;
    for (let b = 0; b < BINS; b++) {
      const count = hist.data[0 * BINS + b];
      if (Math.abs(count - expectedMean) > tolerance) {
        outliers++;
      }
    }
    // With 3σ bounds, expect < 1% outliers (0.3% expected)
    expect(outliers).toBeLessThan(BINS * 0.03);
  });

  it('vectorscope: saturation peak below 0.5 (typical for noise)', () => {
    const vs = results.get('vectorscope')!;
    const satPeak = vs.metadata.saturationPeak as number;
    expect(satPeak).toBeLessThan(0.6);
    expect(satPeak).toBeGreaterThan(0);
  });
});
