/**
 * Statistical primitives for bench sample processing.
 *
 * All functions accept arrays of numbers (millisecond latencies) and return
 * numbers. Inputs are not mutated.
 */

function sorted(samples: readonly number[]): number[] {
  if (samples.length === 0) {
    throw new Error('stats: sample array must be non-empty');
  }
  return [...samples].sort((a, b) => a - b);
}

/**
 * Linear-interpolated percentile (R-7 / numpy default).
 * p must be in [0, 1].
 */
export function percentile(samples: readonly number[], p: number): number {
  if (p < 0 || p > 1 || Number.isNaN(p)) {
    throw new Error(`stats.percentile: p must be in [0, 1], got ${p}`);
  }
  const s = sorted(samples);
  if (s.length === 1) return s[0];
  const idx = p * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  const frac = idx - lo;
  return s[lo] * (1 - frac) + s[hi] * frac;
}

/** 50th percentile. */
export function median(samples: readonly number[]): number {
  return percentile(samples, 0.5);
}

/** 99th percentile. */
export function p99(samples: readonly number[]): number {
  return percentile(samples, 0.99);
}

/** Interquartile range = p75 - p25. */
export function iqr(samples: readonly number[]): number {
  return percentile(samples, 0.75) - percentile(samples, 0.25);
}
