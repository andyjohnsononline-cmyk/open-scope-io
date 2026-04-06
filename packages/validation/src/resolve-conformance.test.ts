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
});
