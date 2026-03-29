import type { ScopeResult } from '@openscope/core';
import type { InvariantViolation } from './types.js';

const GRID = 512;

/**
 * Verify that vectorscope scope results satisfy all mathematical invariants.
 */
export function checkVectorscopeInvariants(
  result: ScopeResult,
  width: number,
  height: number,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const totalPixels = width * height;
  const data = result.data;

  if (result.scopeId !== 'vectorscope') {
    violations.push({
      invariant: 'scopeId',
      expected: 'vectorscope',
      actual: result.scopeId,
    });
    return violations;
  }

  if (result.shape[0] !== GRID || result.shape[1] !== GRID) {
    violations.push({
      invariant: 'shape',
      expected: `[${GRID}, ${GRID}]`,
      actual: `[${result.shape[0]}, ${result.shape[1]}]`,
    });
  }

  // Total of all grid cells should equal total pixels
  let gridTotal = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < 0) {
      violations.push({
        invariant: 'non_negative',
        expected: `cell[${i}] >= 0`,
        actual: `cell[${i}] = ${data[i]}`,
      });
    }
    gridTotal += data[i];
  }
  if (gridTotal !== totalPixels) {
    violations.push({
      invariant: 'total_sum',
      expected: `sum = ${totalPixels}`,
      actual: `sum = ${gridTotal}`,
    });
  }

  return violations;
}
