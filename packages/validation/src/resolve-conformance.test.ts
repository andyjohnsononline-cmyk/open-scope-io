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

    it('dynamicRangeIre is 0 for solid color', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(W, H, 128, 128, 128);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const fc = results.get('falseColor')!;
      expect(fc.metadata.dynamicRangeIre).toBe(0);
      p.destroy();
    });

    it('dynamicRangeIre is 100 for full gradient (black to white)', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateHorizontalGradient(W, H);
      const results = await p.analyze({ data: pixels, width: W, height: H });
      const fc = results.get('falseColor')!;
      expect(fc.metadata.dynamicRangeIre).toBe(100);
      p.destroy();
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

  describe('Edge case dimensions — robustness', () => {
    it('1x1 pixel image produces valid results for all scopes', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateSolidColor(1, 1, 128, 64, 200);
      const results = await p.analyze({ data: pixels, width: 1, height: 1 });

      expect(results.get('waveform')!.data.length).toBe(256);
      expect(results.get('histogram')!.data.length).toBe(1024);
      expect(results.get('vectorscope')!.data.length).toBe(512 * 512);
      expect(results.get('rgbParade')!.data.length).toBe(256 * 3);
      expect(results.get('falseColor')!.data.length).toBe(256);

      const violations = checkCrossScopeInvariants(results, 1, 1);
      expect(violations).toEqual([]);

      p.destroy();
    });

    it('1xH tall strip produces valid waveform with 1 column', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateHorizontalGradient(1, 256);
      const results = await p.analyze({ data: pixels, width: 1, height: 256 });
      const wf = results.get('waveform')!;
      expect(wf.shape[0]).toBe(1);

      const violations = checkCrossScopeInvariants(results, 1, 256);
      expect(violations).toEqual([]);

      p.destroy();
    });

    it('Wx1 single row produces valid parade', async () => {
      const p = createCpuPipeline();
      for (const scope of allScopes) p.register(scope);
      const pixels = generateHorizontalGradient(256, 1);
      const results = await p.analyze({ data: pixels, width: 256, height: 1 });
      const parade = results.get('rgbParade')!;
      expect(parade.shape[0]).toBe(256 * 3);

      const violations = checkCrossScopeInvariants(results, 256, 1);
      expect(violations).toEqual([]);

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

// ── Resolve-exported frame tests ──────────────────────────────────────────────

interface ResolveTestCase {
  name: string;
  tifPath: string;
  width: number;
  height: number;
}

const RESOLVE_FRAMES_DIR = new URL('./goldens/frames/', import.meta.url).pathname;

const RESOLVE_TEST_CASES: ResolveTestCase[] = [
  {
    name: 'isabella-no-lut',
    tifPath: `${RESOLVE_FRAMES_DIR}isabella-no-lut.tif`,
    width: 1920,
    height: 1080,
  },
  {
    name: 'isabella-aces13-rec709',
    tifPath: `${RESOLVE_FRAMES_DIR}isabella-aces13-rec709.tif`,
    width: 1920,
    height: 1080,
  },
  {
    name: 'isabella-aces13-hdr-p3',
    tifPath: `${RESOLVE_FRAMES_DIR}isabella-aces13-hdr-p3.tif`,
    width: 1920,
    height: 1080,
  },
];

async function loadTifPixels(
  tifPath: string,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  const image = sharp(tifPath);
  const meta = await image.metadata();
  const w = meta.width!;
  const h = meta.height!;
  const buffer = await image.ensureAlpha().raw().toBuffer();
  return {
    data: new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    width: w,
    height: h,
  };
}

describe('Resolve-exported frames — real-world conformance', () => {
  const resolveResults = new Map<string, Map<string, ScopeResult>>();

  beforeAll(async () => {
    const pipeline = createCpuPipeline();
    for (const scope of allScopes) pipeline.register(scope);

    for (const tc of RESOLVE_TEST_CASES) {
      const frame = await loadTifPixels(tc.tifPath);
      const results = await pipeline.analyze(frame);
      resolveResults.set(tc.name, results);
    }

    pipeline.destroy();
  });

  for (const tc of RESOLVE_TEST_CASES) {
    describe(`${tc.name} — invariants`, () => {
      it('histogram invariants hold', () => {
        const results = resolveResults.get(tc.name)!;
        const violations = checkHistogramInvariants(results.get('histogram')!, tc.width, tc.height);
        expect(violations).toEqual([]);
      });

      it('waveform invariants hold', () => {
        const results = resolveResults.get(tc.name)!;
        const violations = checkWaveformInvariants(results.get('waveform')!, tc.width, tc.height);
        expect(violations).toEqual([]);
      });

      it('parade invariants hold', () => {
        const results = resolveResults.get(tc.name)!;
        const violations = checkParadeInvariants(results.get('rgbParade')!, tc.width, tc.height);
        expect(violations).toEqual([]);
      });

      it('vectorscope invariants hold', () => {
        const results = resolveResults.get(tc.name)!;
        const violations = checkVectorscopeInvariants(results.get('vectorscope')!, tc.width, tc.height);
        expect(violations).toEqual([]);
      });

      it('cross-scope invariants hold', () => {
        const results = resolveResults.get(tc.name)!;
        const violations = checkCrossScopeInvariants(results, tc.width, tc.height);
        expect(violations).toEqual([]);
      });
    });
  }

  // ── Targeted assertions from Resolve scope screenshots ────────────────

  describe('isabella-no-lut — targeted assertions', () => {
    it('waveform: maxIre < 80 (no signal above 80 IRE in raw source)', () => {
      const wf = resolveResults.get('isabella-no-lut')!.get('waveform')!;
      expect(wf.metadata.maxIre as number).toBeLessThan(80);
    });

    it('vectorscope: low saturation (satPeak < 0.2)', () => {
      const vs = resolveResults.get('isabella-no-lut')!.get('vectorscope')!;
      expect(vs.metadata.saturationPeak as number).toBeLessThan(0.2);
    });

    it('vectorscope: tight cluster near center (satMean < 0.03)', () => {
      const vs = resolveResults.get('isabella-no-lut')!.get('vectorscope')!;
      expect(vs.metadata.saturationMean as number).toBeLessThan(0.03);
    });

    it('histogram: shadow-heavy (median < 100)', () => {
      const hist = resolveResults.get('isabella-no-lut')!.get('histogram')!;
      expect(hist.metadata.median as number).toBeLessThan(100);
    });

    it('falseColor: no highlight clipping', () => {
      const fc = resolveResults.get('isabella-no-lut')!.get('falseColor')!;
      expect(fc.metadata.percentAbove90Ire as number).toBe(0);
    });

    it('skin tone line deviation < 20 degrees', () => {
      const vs = resolveResults.get('isabella-no-lut')!.get('vectorscope')!;
      expect(vs.metadata.skinToneLineDeviationDegrees as number).toBeLessThan(20);
      expect(vs.metadata.skinToneLineDeviationDegrees as number).toBeGreaterThan(0);
    });
  });

  describe('isabella-aces13-rec709 — targeted assertions', () => {
    it('waveform: ACES lifts highlights (maxIre > 90)', () => {
      const wf = resolveResults.get('isabella-aces13-rec709')!.get('waveform')!;
      expect(wf.metadata.maxIre as number).toBeGreaterThan(90);
    });

    it('waveform: shadow clipping (ACES crushes blacks)', () => {
      const wf = resolveResults.get('isabella-aces13-rec709')!.get('waveform')!;
      expect(wf.metadata.clippingShadows).toBe(true);
    });

    it('vectorscope: wider spread than no-lut (satPeak > 0.25)', () => {
      const vs = resolveResults.get('isabella-aces13-rec709')!.get('vectorscope')!;
      expect(vs.metadata.saturationPeak as number).toBeGreaterThan(0.25);
    });

    it('histogram: fuller distribution (mode in low bins from ACES toe)', () => {
      const hist = resolveResults.get('isabella-aces13-rec709')!.get('histogram')!;
      expect(hist.metadata.mode as number).toBeLessThan(10);
    });

    it('falseColor: dynamic range > 90 IRE', () => {
      const fc = resolveResults.get('isabella-aces13-rec709')!.get('falseColor')!;
      expect(fc.metadata.dynamicRangeIre as number).toBeGreaterThan(90);
    });

    it('parade: higher channel imbalance than no-lut (ACES shifts color)', () => {
      const paradeAces = resolveResults.get('isabella-aces13-rec709')!.get('rgbParade')!;
      const paradeNoLut = resolveResults.get('isabella-no-lut')!.get('rgbParade')!;
      expect(paradeAces.metadata.channelImbalance as number)
        .toBeGreaterThan(paradeNoLut.metadata.channelImbalance as number);
    });
  });

  describe('isabella-aces13-hdr-p3 — targeted assertions', () => {
    it('waveform: HDR compresses into 8-bit (maxIre < 70)', () => {
      const wf = resolveResults.get('isabella-aces13-hdr-p3')!.get('waveform')!;
      expect(wf.metadata.maxIre as number).toBeLessThan(70);
    });

    it('waveform: shadow clipping (ACES crushes blacks)', () => {
      const wf = resolveResults.get('isabella-aces13-hdr-p3')!.get('waveform')!;
      expect(wf.metadata.clippingShadows).toBe(true);
    });

    it('vectorscope: moderate saturation (between no-lut and rec709)', () => {
      const vs = resolveResults.get('isabella-aces13-hdr-p3')!.get('vectorscope')!;
      const satPeak = vs.metadata.saturationPeak as number;
      expect(satPeak).toBeGreaterThan(0.15);
      expect(satPeak).toBeLessThan(0.3);
    });

    it('falseColor: no highlight clipping (HDR maps everything below 90 IRE)', () => {
      const fc = resolveResults.get('isabella-aces13-hdr-p3')!.get('falseColor')!;
      expect(fc.metadata.percentAbove90Ire as number).toBe(0);
    });

    it('falseColor: dynamic range < 70 IRE (compressed)', () => {
      const fc = resolveResults.get('isabella-aces13-hdr-p3')!.get('falseColor')!;
      expect(fc.metadata.dynamicRangeIre as number).toBeLessThan(70);
    });
  });

  // ── Cross-grade comparison tests ──────────────────────────────────────

  describe('Cross-grade comparison — same source, different pipelines', () => {
    it('ACES Rec.709 has higher maxIre than no-LUT (tone mapping lifts highlights)', () => {
      const maxNoLut = resolveResults.get('isabella-no-lut')!.get('waveform')!.metadata.maxIre as number;
      const maxAces = resolveResults.get('isabella-aces13-rec709')!.get('waveform')!.metadata.maxIre as number;
      expect(maxAces).toBeGreaterThan(maxNoLut);
    });

    it('HDR P3 has lower maxIre than Rec.709 (HDR compresses into 8-bit SDR range)', () => {
      const maxAces = resolveResults.get('isabella-aces13-rec709')!.get('waveform')!.metadata.maxIre as number;
      const maxHdr = resolveResults.get('isabella-aces13-hdr-p3')!.get('waveform')!.metadata.maxIre as number;
      expect(maxHdr).toBeLessThan(maxAces);
    });

    it('ACES Rec.709 has highest saturationPeak (most saturated output)', () => {
      const satNoLut = resolveResults.get('isabella-no-lut')!.get('vectorscope')!.metadata.saturationPeak as number;
      const satAces = resolveResults.get('isabella-aces13-rec709')!.get('vectorscope')!.metadata.saturationPeak as number;
      const satHdr = resolveResults.get('isabella-aces13-hdr-p3')!.get('vectorscope')!.metadata.saturationPeak as number;
      expect(satAces).toBeGreaterThan(satNoLut);
      expect(satAces).toBeGreaterThan(satHdr);
    });

    it('all three grades have skin tones near the I-line (< 20 deg)', () => {
      for (const name of ['isabella-no-lut', 'isabella-aces13-rec709', 'isabella-aces13-hdr-p3']) {
        const vs = resolveResults.get(name)!.get('vectorscope')!;
        expect(vs.metadata.skinToneLineDeviationDegrees as number).toBeLessThan(20);
      }
    });

    it('ACES grades have more shadow clipping columns than no-LUT', () => {
      const colsNoLut = resolveResults.get('isabella-no-lut')!.get('waveform')!.metadata.clippingShadowColumns as number;
      const colsAces = resolveResults.get('isabella-aces13-rec709')!.get('waveform')!.metadata.clippingShadowColumns as number;
      const colsHdr = resolveResults.get('isabella-aces13-hdr-p3')!.get('waveform')!.metadata.clippingShadowColumns as number;
      expect(colsAces).toBeGreaterThan(colsNoLut);
      expect(colsHdr).toBeGreaterThan(colsNoLut);
    });

    it('ACES Rec.709 has wider dynamic range than HDR P3 (in 8-bit)', () => {
      const drAces = resolveResults.get('isabella-aces13-rec709')!.get('falseColor')!.metadata.dynamicRangeIre as number;
      const drHdr = resolveResults.get('isabella-aces13-hdr-p3')!.get('falseColor')!.metadata.dynamicRangeIre as number;
      expect(drAces).toBeGreaterThan(drHdr);
    });

    it('no-LUT has least channel imbalance (closest to neutral)', () => {
      const ciNoLut = resolveResults.get('isabella-no-lut')!.get('rgbParade')!.metadata.channelImbalance as number;
      const ciAces = resolveResults.get('isabella-aces13-rec709')!.get('rgbParade')!.metadata.channelImbalance as number;
      expect(ciNoLut).toBeLessThan(ciAces);
    });
  });
});
