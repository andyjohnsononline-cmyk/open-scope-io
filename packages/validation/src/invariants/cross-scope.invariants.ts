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

  // Histogram luma total per bin must match waveform total per bin
  if (histogram && waveformResult) {
    const lumaOffset = 3 * BINS;

    for (let b = 0; b < BINS; b++) {
      const histCount = histogram.data[lumaOffset + b];
      let wfCount = 0;
      for (let x = 0; x < width; x++) {
        wfCount += waveformResult.data[x * BINS + b];
      }
      if (histCount !== wfCount) {
        violations.push({
          invariant: `histogram_waveform_luma_bin_${b}_total`,
          expected: `histogram luma bin[${b}] total = waveform bin[${b}] total`,
          actual: `histogram = ${histCount}, waveform = ${wfCount}`,
        });
        break;
      }
    }
  }

  // Histogram luma bins must exactly match false color bins
  const falseColor = results.get('falseColor');
  if (histogram && falseColor) {
    const lumaOffset = 3 * BINS;
    for (let b = 0; b < BINS; b++) {
      const histCount = histogram.data[lumaOffset + b];
      const fcCount = falseColor.data[b];
      if (histCount !== fcCount) {
        violations.push({
          invariant: `histogram_falseColor_luma_bin_${b}`,
          expected: `histogram luma bin[${b}] = falseColor bin[${b}]`,
          actual: `histogram = ${histCount}, falseColor = ${fcCount}`,
        });
        break;
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
