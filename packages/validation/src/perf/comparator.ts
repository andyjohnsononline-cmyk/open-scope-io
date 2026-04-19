/**
 * Baseline vs current perf-report comparator.
 *
 * CI threshold is LOCKED at 30% per eng review (raised from 15% after outside
 * voice flagged ubuntu-runner variance). Do not bump without another review.
 *
 * Mismatched fingerprints throw — comparing across different hardware is
 * meaningless for regression detection.
 */
import { cellKey } from './matrix.js';
import { compareFingerprints } from './fingerprint.js';
import type {
  ComparisonDelta,
  ComparisonResult,
  PerfCell,
  PerfReport,
} from './types.js';

/** Locked per eng review. Do not change without another plan-eng-review pass. */
export const DEFAULT_REGRESSION_THRESHOLD_PCT = 30;

export interface CompareOpts {
  /** Percent-slower threshold above which a cell is flagged as regressed. */
  regressionThresholdPct?: number;
}

/**
 * Compare current against baseline. Only cells present and status='ok' in
 * both reports are compared; mismatched or skipped cells are silently
 * ignored (regression detection should not mask a genuinely absent measurement).
 *
 * Throws if the hardware fingerprints don't match — comparing across different
 * hardware is meaningless.
 */
export function compareReports(
  baseline: PerfReport,
  current: PerfReport,
  opts: CompareOpts = {},
): ComparisonResult {
  const cmp = compareFingerprints(baseline.hw, current.hw);
  if (!cmp.match) {
    throw new Error(
      `compareReports: hardware fingerprints differ — cannot compare.\n` +
        cmp.diff.map((l) => `  ${l}`).join('\n'),
    );
  }

  const threshold = opts.regressionThresholdPct ?? DEFAULT_REGRESSION_THRESHOLD_PCT;

  const baseMap = new Map<string, PerfCell>();
  for (const c of baseline.results) baseMap.set(cellKey(c), c);

  const deltas: ComparisonDelta[] = [];
  for (const curr of current.results) {
    const base = baseMap.get(cellKey(curr));
    if (!base) continue;
    if (base.status !== 'ok' || curr.status !== 'ok') continue;
    if (base.medianMs <= 0) continue; // avoid div-by-zero
    const deltaPct = ((curr.medianMs - base.medianMs) / base.medianMs) * 100;
    deltas.push({
      scopeId: curr.scopeId,
      width: curr.width,
      height: curr.height,
      pipeline: curr.pipeline,
      mode: curr.mode,
      baselineMedianMs: base.medianMs,
      currentMedianMs: curr.medianMs,
      deltaPct,
    });
  }

  const regressions = deltas.filter((d) => d.deltaPct >= threshold);
  // Improvements: faster by at least the same threshold magnitude.
  const improvements = deltas.filter((d) => d.deltaPct <= -threshold);

  return { regressions, improvements, deltas, regressionThresholdPct: threshold };
}
