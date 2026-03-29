import type { ScopeResult } from '@openscope/core';
import type { InvariantViolation } from './types.js';

const BINS = 256;

/**
 * Cross-scope consistency checks between histogram, waveform, and parade results.
 */
export function checkCrossScopeInvariants(
  results: Map<string, ScopeResult>,
  width: number,
  height: number,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const totalPixels = width * height;

  const histogram = results.get('histogram');
  const waveformResult = results.get('waveform');
  const parade = results.get('rgbParade');

  // Histogram luma bins present → waveform must contain those luma values
  if (histogram && waveformResult) {
    const lumaOffset = 3 * BINS;
    const histogramLumaBins = new Set<number>();
    for (let b = 0; b < BINS; b++) {
      if (histogram.data[lumaOffset + b] > 0) {
        histogramLumaBins.add(b);
      }
    }

    const waveformLumaBins = new Set<number>();
    for (let x = 0; x < width; x++) {
      for (let b = 0; b < BINS; b++) {
        if (waveformResult.data[x * BINS + b] > 0) {
          waveformLumaBins.add(b);
        }
      }
    }

    for (const bin of histogramLumaBins) {
      // Allow ±1 tolerance for rounding
      const found =
        waveformLumaBins.has(bin) ||
        waveformLumaBins.has(bin - 1) ||
        waveformLumaBins.has(bin + 1);
      if (!found) {
        violations.push({
          invariant: 'histogram_waveform_luma_superset',
          expected: `waveform contains luma bin ${bin} (±1)`,
          actual: `luma bin ${bin} present in histogram but absent in waveform`,
        });
      }
    }
  }

  // Histogram R channel total must equal parade R channel total
  if (histogram && parade) {
    const stride = width * BINS;
    const channelNames = ['R', 'G', 'B'];

    for (let ch = 0; ch < 3; ch++) {
      let histogramSum = 0;
      for (let b = 0; b < BINS; b++) {
        histogramSum += histogram.data[ch * BINS + b];
      }

      let paradeSum = 0;
      for (let i = ch * stride; i < (ch + 1) * stride; i++) {
        paradeSum += parade.data[i];
      }

      if (histogramSum !== totalPixels || paradeSum !== totalPixels) {
        violations.push({
          invariant: `${channelNames[ch]}_histogram_parade_total`,
          expected: `both = ${totalPixels}`,
          actual: `histogram = ${histogramSum}, parade = ${paradeSum}`,
        });
      }
    }
  }

  return violations;
}
