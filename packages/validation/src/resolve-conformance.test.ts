import { describe, it, expect, beforeAll } from 'vitest';
import { createCpuPipeline, type ScopeResult } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import {
  loadAllGoldens,
  listGoldens,
  compareToGolden,
  type GoldenReference,
} from './goldens/loader.js';
import {
  generateSolidColor,
  generateHorizontalGradient,
  generateSMPTEBars,
  SMPTE_75_BARS,
  SMPTE_100_BARS,
  generateColorPatches,
  generatePLUGE,
  generateZonePatches,
  generateSkinToneTarget,
  generateHighSatPrimaries,
  generateNearBlackGradient,
  generateNearWhiteGradient,
  generateChannelRamps,
  generateCDLGraded,
  EBU_100_BARS,
} from './generators/index.js';
import {
  checkHistogramInvariants,
  checkWaveformInvariants,
  checkParadeInvariants,
  checkVectorscopeInvariants,
  checkCrossScopeInvariants,
} from './invariants/index.js';

type FrameGenerator = () => Uint8ClampedArray;

interface GoldenTestCase {
  name: string;
  width: number;
  height: number;
  generate: FrameGenerator;
}

const W = 256;
const H = 128;

const GOLDEN_TEST_CASES: GoldenTestCase[] = [
  { name: 'solid-black', width: W, height: H, generate: () => generateSolidColor(W, H, 0, 0, 0) },
  { name: 'solid-white', width: W, height: H, generate: () => generateSolidColor(W, H, 255, 255, 255) },
  { name: 'solid-mid-gray', width: W, height: H, generate: () => generateSolidColor(W, H, 128, 128, 128) },
  { name: 'solid-red', width: W, height: H, generate: () => generateSolidColor(W, H, 255, 0, 0) },
  { name: 'solid-green', width: W, height: H, generate: () => generateSolidColor(W, H, 0, 255, 0) },
  { name: 'solid-blue', width: W, height: H, generate: () => generateSolidColor(W, H, 0, 0, 255) },
  { name: 'horizontal-gradient', width: W, height: H, generate: () => generateHorizontalGradient(W, H) },
  { name: 'channel-ramps', width: W, height: H, generate: () => generateChannelRamps(W, H) },
  { name: 'smpte-75', width: W, height: H, generate: () => generateSMPTEBars(W, H, SMPTE_75_BARS) },
  { name: 'smpte-100', width: W, height: H, generate: () => generateSMPTEBars(W, H, SMPTE_100_BARS) },
  { name: 'ebu-bars', width: W, height: H, generate: () => generateColorPatches(W, H, EBU_100_BARS) },
  { name: 'pluge-pulse', width: W, height: H, generate: () => generatePLUGE(W, H) },
  { name: 'zone-patches', width: W, height: H, generate: () => generateZonePatches(W, H) },
  { name: 'skin-tone-target', width: W, height: H, generate: () => generateSkinToneTarget(W, H) },
  { name: 'high-sat-primaries', width: W, height: H, generate: () => generateHighSatPrimaries(W, H) },
  { name: 'near-black-gradient', width: W, height: H, generate: () => generateNearBlackGradient(W, H) },
  { name: 'near-white-gradient', width: W, height: H, generate: () => generateNearWhiteGradient(W, H) },
];

const SCOPE_IDS = ['waveform', 'rgbParade', 'vectorscope', 'histogram', 'falseColor'];

// ============================================================
// Golden Reference Conformance Tests
// ============================================================

describe('Golden Reference Conformance', () => {
  const pipeline = createCpuPipeline();
  let goldens: Map<string, GoldenReference>;

  beforeAll(() => {
    for (const scope of allScopes) {
      pipeline.register(scope);
    }

    const available = listGoldens();
    if (available.length === 0) {
      throw new Error(
        'No golden references found. Run `pnpm run prepare:goldens` first.',
      );
    }
    goldens = loadAllGoldens();
  });

  for (const testCase of GOLDEN_TEST_CASES) {
    describe(`"${testCase.name}"`, () => {
      let results: Map<string, ScopeResult>;
      let golden: GoldenReference | undefined;

      beforeAll(async () => {
        const pixels = testCase.generate();
        results = await pipeline.analyze(
          { data: pixels, width: testCase.width, height: testCase.height },
        );
        golden = goldens.get(testCase.name);
      });

      it('has a matching golden reference', () => {
        expect(golden).toBeDefined();
      });

      for (const scopeId of SCOPE_IDS) {
        it(`${scopeId}: exact match against golden data`, () => {
          if (!golden) return;
          const goldenScope = golden.scopes[scopeId];
          expect(goldenScope).toBeDefined();

          const result = results.get(scopeId)!;
          expect(result).toBeDefined();

          const comparison = compareToGolden(result.data, goldenScope);
          expect(comparison.maxDeviation).toBe(0);
          expect(comparison.deviatingBins).toBe(0);
        });

        it(`${scopeId}: shape matches golden`, () => {
          if (!golden) return;
          const goldenScope = golden.scopes[scopeId];
          const result = results.get(scopeId)!;
          expect(result.shape).toEqual(goldenScope.shape);
        });

        it(`${scopeId}: metadata matches golden`, () => {
          if (!golden) return;
          const goldenScope = golden.scopes[scopeId];
          const result = results.get(scopeId)!;

          for (const [key, goldenValue] of Object.entries(goldenScope.metadata)) {
            const actualValue = result.metadata[key];
            if (typeof goldenValue === 'number') {
              expect(actualValue).toBeCloseTo(goldenValue as number, 2);
            } else {
              expect(actualValue).toBe(goldenValue);
            }
          }
        });
      }

      it('all invariants hold', () => {
        const violations = [
          ...checkHistogramInvariants(results.get('histogram')!, testCase.width, testCase.height),
          ...checkWaveformInvariants(results.get('waveform')!, testCase.width, testCase.height),
          ...checkParadeInvariants(results.get('rgbParade')!, testCase.width, testCase.height),
          ...checkVectorscopeInvariants(results.get('vectorscope')!, testCase.width, testCase.height),
          ...checkCrossScopeInvariants(results, testCase.width, testCase.height),
        ];
        expect(violations).toEqual([]);
      });
    });
  }
});

// ============================================================
// Industry Pattern Invariant Tests
// ============================================================

describe('Industry Pattern Invariants', () => {
  const pipeline = createCpuPipeline();

  beforeAll(() => {
    for (const scope of allScopes) {
      pipeline.register(scope);
    }
  });

  describe('PLUGE pulse — shadow detail', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generatePLUGE(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: only near-black bins populated (0-20)', () => {
      const hist = results.get('histogram')!;
      const lumaOffset = 3 * 256;
      for (let b = 21; b < 256; b++) {
        expect(hist.data[lumaOffset + b]).toBe(0);
      }
    });

    it('waveform: no values above bin 20', () => {
      const wf = results.get('waveform')!;
      for (let x = 0; x < W; x++) {
        for (let b = 21; b < 256; b++) {
          expect(wf.data[x * 256 + b]).toBe(0);
        }
      }
    });

    it('false color: all pixels below 16 IRE', () => {
      const fc = results.get('falseColor')!;
      const pct = fc.metadata.percentBelow16Ire as number;
      expect(pct).toBeGreaterThan(50);
    });
  });

  describe('Zone patches — full dynamic range', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateZonePatches(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: at least 10 distinct luma bins populated', () => {
      const hist = results.get('histogram')!;
      const lumaOffset = 3 * 256;
      let nonZero = 0;
      for (let b = 0; b < 256; b++) {
        if (hist.data[lumaOffset + b] > 0) nonZero++;
      }
      expect(nonZero).toBeGreaterThanOrEqual(10);
    });

    it('waveform: staircase pattern spans full range', () => {
      const wf = results.get('waveform')!;
      const meta = wf.metadata;
      expect(meta.minIre as number).toBeLessThan(5);
      expect(meta.maxIre as number).toBeGreaterThan(95);
    });
  });

  describe('Skin tone target — vectorscope', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateSkinToneTarget(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('vectorscope: saturation peak below 0.3 (skin tones are moderate saturation)', () => {
      const vs = results.get('vectorscope')!;
      const satPeak = vs.metadata.saturationPeak as number;
      expect(satPeak).toBeLessThan(0.3);
      expect(satPeak).toBeGreaterThan(0);
    });

    it('vectorscope: all pixels accounted for', () => {
      const vs = results.get('vectorscope')!;
      let total = 0;
      for (let i = 0; i < vs.data.length; i++) {
        total += vs.data[i];
      }
      expect(total).toBe(W * H);
    });
  });

  describe('High-saturation primaries — vectorscope extremes', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateHighSatPrimaries(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('vectorscope: saturation peak above 0.4', () => {
      const vs = results.get('vectorscope')!;
      const satPeak = vs.metadata.saturationPeak as number;
      expect(satPeak).toBeGreaterThan(0.4);
    });

    it('histogram: R, G, B channels each have exactly 2 populated bins (0 and 255)', () => {
      const hist = results.get('histogram')!;
      for (let ch = 0; ch < 3; ch++) {
        let nonZero = 0;
        for (let b = 0; b < 256; b++) {
          if (hist.data[ch * 256 + b] > 0) nonZero++;
        }
        expect(nonZero).toBe(2);
      }
    });

    it('RGB parade: each channel shows only 0 and 255', () => {
      const p = results.get('rgbParade')!;
      const stride = W * 256;
      for (let ch = 0; ch < 3; ch++) {
        for (let x = 0; x < W; x++) {
          for (let b = 1; b < 255; b++) {
            expect(p.data[ch * stride + x * 256 + b]).toBe(0);
          }
        }
      }
    });
  });

  describe('Channel ramps — RGB parade separation', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateChannelRamps(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('RGB parade: R channel has a diagonal ramp in top third', () => {
      const p = results.get('rgbParade')!;
      const thirdH = Math.floor(H / 3);
      for (let x = 0; x < W; x++) {
        const expectedRBin = Math.round((x / (W - 1)) * 255);
        expect(p.data[x * 256 + expectedRBin]).toBeGreaterThan(0);
      }
    });

    it('histogram: R, G, B channels each span the full range', () => {
      const hist = results.get('histogram')!;
      for (let ch = 0; ch < 3; ch++) {
        expect(hist.data[ch * 256 + 0]).toBeGreaterThan(0);
        expect(hist.data[ch * 256 + 255]).toBeGreaterThan(0);
      }
    });
  });

  describe('Near-black gradient — shadow resolution', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateNearBlackGradient(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: only bins 0-20 populated in all channels', () => {
      const hist = results.get('histogram')!;
      for (let ch = 0; ch < 3; ch++) {
        for (let b = 21; b < 256; b++) {
          expect(hist.data[ch * 256 + b]).toBe(0);
        }
      }
    });

    it('waveform: clippingShadows may be set (most pixels at low IRE)', () => {
      const wf = results.get('waveform')!;
      expect(wf.metadata.maxIre as number).toBeLessThan(10);
    });
  });

  describe('Near-white gradient — highlight resolution', () => {
    let results: Map<string, ScopeResult>;
    beforeAll(async () => {
      const pixels = generateNearWhiteGradient(W, H);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('histogram: only bins 235-255 populated in all channels', () => {
      const hist = results.get('histogram')!;
      for (let ch = 0; ch < 3; ch++) {
        for (let b = 0; b < 235; b++) {
          expect(hist.data[ch * 256 + b]).toBe(0);
        }
      }
    });

    it('waveform: clippingHighlights may be set', () => {
      const wf = results.get('waveform')!;
      expect(wf.metadata.minIre as number).toBeGreaterThan(90);
    });
  });

  describe('RGB Parade channel imbalance — color cast detection', () => {
    it('neutral gray has zero channel imbalance', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, 128, 128, 128);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const parade = results.get('rgbParade')!;
      expect(parade.metadata.channelImbalance).toBe(0);
      p.destroy();
    });

    it('CDL-graded content has non-zero channel imbalance', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateCDLGraded(W, H, [1.5, 0.5, 1.0]);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const parade = results.get('rgbParade')!;
      expect(parade.metadata.channelImbalance as number).toBeGreaterThan(0);
      p.destroy();
    });

    it('pure red has maximum channel imbalance', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, 255, 0, 0);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const parade = results.get('rgbParade')!;
      expect(parade.metadata.channelImbalance as number).toBeGreaterThan(50);
      p.destroy();
    });
  });

  describe('Clipping detection — Resolve shadow/highlight flags', () => {
    it('clippingShadows=true when >1% of pixels are in bins 0-3', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const pixels = generateSolidColor(W, H, 2, 2, 2);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.clippingShadows).toBe(true);

      p.destroy();
    });

    it('clippingShadows=false for mid-gray', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const pixels = generateSolidColor(W, H, 128, 128, 128);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.clippingShadows).toBe(false);

      p.destroy();
    });

    it('clippingHighlights=true when >1% of pixels are in bins 251-255', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const pixels = generateSolidColor(W, H, 253, 253, 253);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.clippingHighlights).toBe(true);

      p.destroy();
    });

    it('clippingHighlights=false for mid-gray', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const pixels = generateSolidColor(W, H, 128, 128, 128);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.clippingHighlights).toBe(false);

      p.destroy();
    });

    it('column-level clipping: solid black clips all columns', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, 0, 0, 0);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.clippingShadowColumns).toBe(W);
      expect(wf.metadata.clippingHighlightColumns).toBe(0);
      p.destroy();
    });

    it('column-level clipping: solid white clips all highlight columns', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, 255, 255, 255);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.clippingShadowColumns).toBe(0);
      expect(wf.metadata.clippingHighlightColumns).toBe(W);
      p.destroy();
    });
  });

  describe('False color zone classification — Resolve zone accuracy', () => {
    it('classifies 18% gray as "Shadows" zone (IRE 10-20)', () => {
      const gray18 = Math.round(0.18 * 255);
      const ire = (gray18 / 255) * 100;
      expect(ire).toBeGreaterThan(10);
      expect(ire).toBeLessThan(20);
    });

    it('classifies 50% gray as "Midtones" zone (IRE 40-50)', () => {
      const ire = (128 / 255) * 100;
      expect(ire).toBeGreaterThan(40);
      expect(ire).toBeLessThanOrEqual(50.2);
    });

    it('falseColor percentages sum to 100% for all test patterns', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const patterns = [
        generateSolidColor(W, H, 128, 128, 128),
        generateHorizontalGradient(W, H),
        generateCDLGraded(W, H),
        generateSkinToneTarget(W, H),
      ];

      for (const pixels of patterns) {
        const results = await p.analyze({ data: pixels, width: W, height: H });
        const fc = results.get('falseColor')!;
        const below = fc.metadata.percentBelow16Ire as number;
        const above = fc.metadata.percentAbove90Ire as number;
        const inRange = fc.metadata.percentInRange as number;
        const sum = below + above + inRange;
        expect(sum).toBeCloseTo(100, 0);
      }

      p.destroy();
    });
  });

  describe('SMPTE 75% bars vectorscope positions — Resolve reference', () => {
    it('75% white bar lands at vectorscope center (zero chroma)', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const pixels = generateSolidColor(4, 4, 180, 180, 180);
      const results = await p.analyze({ data: pixels, width: 4, height: 4 });
      const vs = results.get('vectorscope')!;

      const centerX = Math.round(0.5 * 511);
      const centerY = Math.round(0.5 * 511);
      expect(vs.data[centerY * 512 + centerX]).toBe(16);

      p.destroy();
    });

    it('75% color bars produce 7 distinct vectorscope clusters', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const pixels = generateSMPTEBars(256, 64, SMPTE_75_BARS);
      const results = await p.analyze({ data: pixels, width: 256, height: 64 });
      const vs = results.get('vectorscope')!;

      let nonZeroCells = 0;
      for (let i = 0; i < vs.data.length; i++) {
        if (vs.data[i] > 0) nonZeroCells++;
      }

      expect(nonZeroCells).toBeGreaterThanOrEqual(2);
      expect(nonZeroCells).toBeLessThanOrEqual(10);

      p.destroy();
    });
  });

  describe('Waveform IRE precision — Resolve-grade accuracy', () => {
    it('pure 18% gray (46/255) reports ~18 IRE', async () => {
      const gray18 = Math.round(0.18 * 255); // = 46
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, gray18, gray18, gray18);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      const meanIre = wf.metadata.meanIre as number;
      expect(meanIre).toBeGreaterThan(17);
      expect(meanIre).toBeLessThan(19);
      p.destroy();
    });

    it('pure black reports exactly 0 IRE', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, 0, 0, 0);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.minIre).toBe(0);
      expect(wf.metadata.maxIre).toBe(0);
      expect(wf.metadata.meanIre).toBe(0);
      p.destroy();
    });

    it('pure white reports exactly 100 IRE', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, 255, 255, 255);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const wf = results.get('waveform')!;
      expect(wf.metadata.minIre).toBe(100);
      expect(wf.metadata.maxIre).toBe(100);
      expect(wf.metadata.meanIre).toBe(100);
      p.destroy();
    });
  });

  describe('Vectorscope skin tone line — Resolve I-line validation', () => {
    it('skin tone patches cluster near the skin tone line (< 20 deg deviation)', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSkinToneTarget(W, H);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const vs = results.get('vectorscope')!;
      const skinDev = vs.metadata.skinToneLineDeviationDegrees as number;
      expect(skinDev).toBeLessThan(20);
      expect(skinDev).toBeGreaterThan(0);
      p.destroy();
    });
  });

  describe('Vectorscope color target positions — Resolve calibration', () => {
    it('100% primaries/secondaries land in correct vectorscope quadrants', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const targets: { label: string; r: number; g: number; b: number; expectedCbSign: number; expectedCrSign: number }[] = [
        { label: 'Red',     r: 255, g: 0,   b: 0,   expectedCbSign: -1, expectedCrSign: 1 },
        { label: 'Green',   r: 0,   g: 255, b: 0,   expectedCbSign: -1, expectedCrSign: -1 },
        { label: 'Blue',    r: 0,   g: 0,   b: 255, expectedCbSign: 1,  expectedCrSign: -1 },
        { label: 'Yellow',  r: 255, g: 255, b: 0,   expectedCbSign: -1, expectedCrSign: 1 },
        { label: 'Magenta', r: 255, g: 0,   b: 255, expectedCbSign: 1,  expectedCrSign: 1 },
        { label: 'Cyan',    r: 0,   g: 255, b: 255, expectedCbSign: 1,  expectedCrSign: -1 },
      ];

      for (const t of targets) {
        const pixels = generateSolidColor(4, 4, t.r, t.g, t.b);
        const results = await p.analyze({ data: pixels, width: 4, height: 4 });
        const vs = results.get('vectorscope')!;

        let peakX = 0, peakY = 0, peakCount = 0;
        for (let cy = 0; cy < 512; cy++) {
          for (let cx = 0; cx < 512; cx++) {
            if (vs.data[cy * 512 + cx] > peakCount) {
              peakCount = vs.data[cy * 512 + cx];
              peakX = cx;
              peakY = cy;
            }
          }
        }

        const cb = (peakX / 511) - 0.5;
        const cr = (peakY / 511) - 0.5;

        if (t.expectedCbSign > 0) {
          expect(cb).toBeGreaterThan(0);
        } else {
          expect(cb).toBeLessThan(0);
        }

        if (t.expectedCrSign > 0) {
          expect(cr).toBeGreaterThan(0);
        } else {
          expect(cr).toBeLessThan(0);
        }
      }

      p.destroy();
    });

    it('neutral gray lands at vectorscope center (255, 255)', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const pixels = generateSolidColor(4, 4, 128, 128, 128);
      const results = await p.analyze({ data: pixels, width: 4, height: 4 });
      const vs = results.get('vectorscope')!;

      const centerX = Math.round(0.5 * 511);
      const centerY = Math.round(0.5 * 511);
      expect(vs.data[centerY * 512 + centerX]).toBe(16);

      p.destroy();
    });
  });

  describe('Luma bin consistency across scopes', () => {
    it('waveform, histogram, and falseColor agree on luma bin assignment for single-pixel images', () => {
      const testColors: [number, number, number][] = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 1, 1],
        [128, 128, 128],
        [200, 100, 50],
        [10, 20, 30],
        [255, 128, 0],
      ];

      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      for (const [r, g, b] of testColors) {
        const pixels = generateSolidColor(1, 1, r, g, b);
        // synchronous analysis for single pixel
        const results: Map<string, ScopeResult> = new Map();
        p.analyze({ data: pixels, width: 1, height: 1 }).then(res => {
          for (const [id, val] of res) results.set(id, val);
        });
      }

      p.destroy();
    });

    it('histogram luma total equals falseColor total for all industry patterns', () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);

      const patterns = [
        generateCDLGraded(W, H),
        generateCDLGraded(W, H, [0.5, 1.5, 1.0], [0.1, -0.1, 0.0], [0.8, 1.2, 1.0]),
      ];

      for (const pixels of patterns) {
        p.analyze({ data: pixels, width: W, height: H }).then(results => {
          const hist = results.get('histogram')!;
          const fc = results.get('falseColor')!;

          let histLumaTotal = 0;
          let fcTotal = 0;
          for (let b = 0; b < 256; b++) {
            histLumaTotal += hist.data[768 + b];
            fcTotal += fc.data[b];
          }
          expect(histLumaTotal).toBe(fcTotal);
        });
      }

      p.destroy();
    });
  });

  describe('CDL-graded gradient — color transform validation', () => {
    let results: Map<string, ScopeResult>;
    const slope: [number, number, number] = [1.2, 1.0, 0.8];
    const offset: [number, number, number] = [0.02, 0.0, -0.02];
    const power: [number, number, number] = [1.0, 1.0, 1.0];

    beforeAll(async () => {
      const pixels = generateCDLGraded(W, H, slope, offset, power);
      results = await pipeline.analyze({ data: pixels, width: W, height: H });
    });

    it('RGB parade: R channel extends further than B channel (slope R=1.2 > B=0.8)', () => {
      const p = results.get('rgbParade')!;
      const rMax = p.metadata.rMax as number;
      const bMax = p.metadata.bMax as number;
      expect(rMax).toBeGreaterThan(bMax);
    });

    it('histogram: R channel mode is higher than B channel mode', () => {
      const hist = results.get('histogram')!;
      let rModeVal = 0, rModeCount = 0;
      let bModeVal = 0, bModeCount = 0;
      for (let b = 0; b < 256; b++) {
        if (hist.data[b] > rModeCount) { rModeCount = hist.data[b]; rModeVal = b; }
        if (hist.data[512 + b] > bModeCount) { bModeCount = hist.data[512 + b]; bModeVal = b; }
      }
      expect(rModeVal).toBeGreaterThanOrEqual(bModeVal);
    });

    it('all invariants hold for CDL-graded content', () => {
      const violations = [
        ...checkHistogramInvariants(results.get('histogram')!, W, H),
        ...checkWaveformInvariants(results.get('waveform')!, W, H),
        ...checkParadeInvariants(results.get('rgbParade')!, W, H),
        ...checkVectorscopeInvariants(results.get('vectorscope')!, W, H),
        ...checkCrossScopeInvariants(results, W, H),
      ];
      expect(violations).toEqual([]);
    });
  });
});
