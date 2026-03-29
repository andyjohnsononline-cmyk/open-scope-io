import type { ScopeResult } from '@openscope/core';
import type { InvariantViolation } from './types.js';

const BINS = 256;
const CHANNELS = 4; // R, G, B, Luma

/**
 * Verify that histogram scope results satisfy all mathematical invariants.
 * Returns an empty array if all invariants hold.
 */
export function checkHistogramInvariants(
  result: ScopeResult,
  width: number,
  height: number,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const totalPixels = width * height;
  const data = result.data;

  if (result.scopeId !== 'histogram') {
    violations.push({
      invariant: 'scopeId',
      expected: 'histogram',
      actual: result.scopeId,
    });
    return violations;
  }

  if (result.shape[0] !== CHANNELS || result.shape[1] !== BINS) {
    violations.push({
      invariant: 'shape',
      expected: `[${CHANNELS}, ${BINS}]`,
      actual: `[${result.shape[0]}, ${result.shape[1]}]`,
    });
  }

  const channelNames = ['R', 'G', 'B', 'Luma'];
  for (let ch = 0; ch < CHANNELS; ch++) {
    const offset = ch * BINS;
    let sum = 0;
    for (let b = 0; b < BINS; b++) {
      const count = data[offset + b];
      if (count < 0) {
        violations.push({
          invariant: `${channelNames[ch]}_non_negative`,
          expected: `bin[${b}] >= 0`,
          actual: `bin[${b}] = ${count}`,
        });
      }
      sum += count;
    }

    if (sum !== totalPixels) {
      violations.push({
        invariant: `${channelNames[ch]}_sum`,
        expected: `sum = ${totalPixels}`,
        actual: `sum = ${sum}`,
      });
    }
  }

  return violations;
}
