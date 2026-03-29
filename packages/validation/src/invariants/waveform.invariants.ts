import type { ScopeResult } from '@openscope/core';
import type { InvariantViolation } from './types.js';

const BINS = 256;

/**
 * Verify that waveform scope results satisfy all mathematical invariants.
 */
export function checkWaveformInvariants(
  result: ScopeResult,
  width: number,
  height: number,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const totalPixels = width * height;
  const data = result.data;

  if (result.scopeId !== 'waveform') {
    violations.push({
      invariant: 'scopeId',
      expected: 'waveform',
      actual: result.scopeId,
    });
    return violations;
  }

  if (result.shape[0] !== width || result.shape[1] !== BINS) {
    violations.push({
      invariant: 'shape',
      expected: `[${width}, ${BINS}]`,
      actual: `[${result.shape[0]}, ${result.shape[1]}]`,
    });
  }

  // Each column should sum to height (one entry per row in that column)
  for (let x = 0; x < width; x++) {
    let colSum = 0;
    for (let b = 0; b < BINS; b++) {
      const count = data[x * BINS + b];
      if (count < 0) {
        violations.push({
          invariant: `column_${x}_non_negative`,
          expected: `bin[${b}] >= 0`,
          actual: `bin[${b}] = ${count}`,
        });
      }
      colSum += count;
    }
    if (colSum !== height) {
      violations.push({
        invariant: `column_${x}_sum`,
        expected: `sum = ${height}`,
        actual: `sum = ${colSum}`,
      });
      break; // Only report first failing column to avoid noise
    }
  }

  // Total across all columns should equal total pixels
  let grandTotal = 0;
  for (let i = 0; i < data.length; i++) {
    grandTotal += data[i];
  }
  if (grandTotal !== totalPixels) {
    violations.push({
      invariant: 'total_sum',
      expected: `sum = ${totalPixels}`,
      actual: `sum = ${grandTotal}`,
    });
  }

  return violations;
}
