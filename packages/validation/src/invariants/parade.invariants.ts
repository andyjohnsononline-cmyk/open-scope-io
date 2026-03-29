import type { ScopeResult } from '@openscope/core';
import type { InvariantViolation } from './types.js';

const BINS = 256;

/**
 * Verify that RGB parade scope results satisfy all mathematical invariants.
 */
export function checkParadeInvariants(
  result: ScopeResult,
  width: number,
  height: number,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const totalPixels = width * height;
  const data = result.data;
  const stride = width * BINS;

  if (result.scopeId !== 'rgbParade') {
    violations.push({
      invariant: 'scopeId',
      expected: 'rgbParade',
      actual: result.scopeId,
    });
    return violations;
  }

  if (data.length !== width * BINS * 3) {
    violations.push({
      invariant: 'data_length',
      expected: `${width * BINS * 3}`,
      actual: `${data.length}`,
    });
  }

  const channelNames = ['R', 'G', 'B'];
  for (let ch = 0; ch < 3; ch++) {
    const channelOffset = ch * stride;

    // Each column in each channel should sum to height
    for (let x = 0; x < width; x++) {
      let colSum = 0;
      for (let b = 0; b < BINS; b++) {
        colSum += data[channelOffset + x * BINS + b];
      }
      if (colSum !== height) {
        violations.push({
          invariant: `${channelNames[ch]}_column_${x}_sum`,
          expected: `sum = ${height}`,
          actual: `sum = ${colSum}`,
        });
        break;
      }
    }

    // Channel total should equal total pixels
    let channelTotal = 0;
    for (let i = channelOffset; i < channelOffset + stride; i++) {
      channelTotal += data[i];
    }
    if (channelTotal !== totalPixels) {
      violations.push({
        invariant: `${channelNames[ch]}_total`,
        expected: `sum = ${totalPixels}`,
        actual: `sum = ${channelTotal}`,
      });
    }
  }

  return violations;
}
