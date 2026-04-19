/**
 * Hardware + runtime fingerprint capture and comparison.
 *
 * We refuse to compare reports with mismatched fingerprints — it's the only
 * way to keep CI regressions meaningful across lanes and forks.
 */
import os from 'node:os';
import type { HwFingerprint } from './types.js';

/**
 * Capture the current Node process's hardware fingerprint.
 * `gpuModel` is always 'unknown' in Node — the browser harness fills it in
 * from WebGPU `adapter.info`.
 */
export function captureHwFingerprint(): HwFingerprint {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
  return {
    cpuModel,
    gpuModel: 'unknown',
    nodeVersion: process.version,
    os: `${os.platform()} ${os.release()}`,
    memGb: Math.round(os.totalmem() / 2 ** 30),
  };
}

export interface FingerprintComparison {
  match: boolean;
  /** Human-readable diff lines, one per mismatching field. Empty when match. */
  diff: string[];
}

/**
 * Compare two fingerprints field-by-field.
 * A fingerprint present in `a` but missing in `b` (or vice versa) is a diff.
 */
export function compareFingerprints(
  a: Partial<HwFingerprint>,
  b: Partial<HwFingerprint>,
): FingerprintComparison {
  const fields: Array<keyof HwFingerprint> = [
    'cpuModel',
    'gpuModel',
    'nodeVersion',
    'os',
    'memGb',
  ];
  const diff: string[] = [];
  for (const f of fields) {
    const av = a[f];
    const bv = b[f];
    if (av === undefined && bv === undefined) continue;
    if (av !== bv) {
      diff.push(`${f}: ${JSON.stringify(av)} !== ${JSON.stringify(bv)}`);
    }
  }
  return { match: diff.length === 0, diff };
}
