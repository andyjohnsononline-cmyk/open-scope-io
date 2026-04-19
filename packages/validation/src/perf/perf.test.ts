import { describe, it, expect } from 'vitest';
import { median, p99, iqr, percentile } from './stats.js';
import { buildMatrix, cellKey, SCOPE_IDS, RESOLUTIONS } from './matrix.js';
import {
  captureHwFingerprint,
  compareFingerprints,
} from './fingerprint.js';
import { warmup, cooldown } from './warmup.js';
import {
  compareReports,
  DEFAULT_REGRESSION_THRESHOLD_PCT,
} from './comparator.js';
import { runBenchCell } from './bench.js';
import type { HwFingerprint, PerfCell, PerfReport } from './types.js';
import { PERF_SCHEMA_VERSION } from './types.js';

// ============================================================
// stats.ts
// ============================================================

describe('stats', () => {
  it('median([1..100]) ≈ 50.5', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(median(arr)).toBeCloseTo(50.5, 5);
  });

  it('p99([1..100]) ≈ 99.01 (R-7 interpolation)', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    // R-7: idx = 0.99 * 99 = 98.01 → 99 * 0.99 + 100 * 0.01 = 99.01
    expect(p99(arr)).toBeCloseTo(99.01, 2);
  });

  it('iqr handles outliers correctly — [1,1,1,1,99] has small IQR', () => {
    const arr = [1, 1, 1, 1, 99];
    // sorted = [1,1,1,1,99]; p25 idx=1 → 1; p75 idx=3 → 1; iqr = 0
    expect(iqr(arr)).toBe(0);
    // median of that array is 1, not pulled up by the outlier
    expect(median(arr)).toBe(1);
  });

  it('percentile throws on out-of-range p', () => {
    expect(() => percentile([1, 2, 3], -0.1)).toThrow();
    expect(() => percentile([1, 2, 3], 1.1)).toThrow();
  });

  it('percentile throws on empty input', () => {
    expect(() => percentile([], 0.5)).toThrow();
  });
});

// ============================================================
// matrix.ts
// ============================================================

describe('matrix', () => {
  it('buildMatrix() returns 60 cells (5 scopes × 3 res × 2 pipelines × 2 modes)', () => {
    const cells = buildMatrix();
    expect(cells).toHaveLength(5 * 3 * 2 * 2);
    expect(cells).toHaveLength(60);
  });

  it('buildMatrix({microbench:true}) returns 80 cells (60 + 5×1×2×2)', () => {
    const cells = buildMatrix({ microbench: true });
    expect(cells).toHaveLength(80);
  });

  it('all cells are unique by (scope, w×h, pipeline, mode)', () => {
    const cells = buildMatrix({ microbench: true });
    const keys = new Set(cells.map(cellKey));
    expect(keys.size).toBe(cells.length);
  });

  it('1920×1080 is explicitly NOT in the matrix (dropped per eng review)', () => {
    const cells = buildMatrix({ microbench: true });
    const has1080p = cells.some((c) => c.width === 1920 && c.height === 1080);
    expect(has1080p).toBe(false);
  });

  it('covers all 5 scopes and all 3 resolutions', () => {
    const cells = buildMatrix();
    const scopes = new Set(cells.map((c) => c.scopeId));
    expect(scopes).toEqual(new Set(SCOPE_IDS));
    for (const res of RESOLUTIONS) {
      expect(
        cells.some((c) => c.width === res.width && c.height === res.height),
      ).toBe(true);
    }
  });
});

// ============================================================
// fingerprint.ts
// ============================================================

describe('fingerprint', () => {
  it('captureHwFingerprint returns non-empty required fields', () => {
    const fp = captureHwFingerprint();
    expect(fp.cpuModel.length).toBeGreaterThan(0);
    expect(fp.nodeVersion.startsWith('v')).toBe(true);
    expect(fp.os.length).toBeGreaterThan(0);
    expect(Number.isInteger(fp.memGb)).toBe(true);
    expect(fp.memGb).toBeGreaterThan(0);
    expect(fp.gpuModel).toBe('unknown'); // Node always 'unknown'
  });

  it('compareFingerprints matches identical fingerprints', () => {
    const a: HwFingerprint = {
      cpuModel: 'Apple M2 Max',
      gpuModel: 'unknown',
      nodeVersion: 'v22.11.0',
      os: 'darwin 24.1.0',
      memGb: 96,
    };
    const res = compareFingerprints(a, { ...a });
    expect(res.match).toBe(true);
    expect(res.diff).toEqual([]);
  });

  it('compareFingerprints reports a diff when cpu differs', () => {
    const a: Partial<HwFingerprint> = { cpuModel: 'A' };
    const b: Partial<HwFingerprint> = { cpuModel: 'B' };
    const res = compareFingerprints(a, b);
    expect(res.match).toBe(false);
    expect(res.diff.length).toBe(1);
    expect(res.diff[0]).toContain('cpuModel');
  });
});

// ============================================================
// warmup.ts
// ============================================================

describe('warmup/cooldown', () => {
  it('warmup runs fn exactly N times', async () => {
    let n = 0;
    await warmup(() => {
      n++;
    }, 7);
    expect(n).toBe(7);
  });

  it('warmup(0) does not call fn', async () => {
    let called = false;
    await warmup(() => {
      called = true;
    }, 0);
    expect(called).toBe(false);
  });

  it('cooldown waits at least the requested ms', async () => {
    const t0 = Date.now();
    await cooldown(50);
    const elapsed = Date.now() - t0;
    // allow ±a few ms scheduler jitter, but must be >= requested
    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it('cooldown(0) resolves immediately', async () => {
    const t0 = Date.now();
    await cooldown(0);
    expect(Date.now() - t0).toBeLessThan(20);
  });
});

// ============================================================
// comparator.ts
// ============================================================

const FP_A: HwFingerprint = {
  cpuModel: 'Apple M2 Max',
  gpuModel: 'unknown',
  nodeVersion: 'v22.11.0',
  os: 'darwin 24.1.0',
  memGb: 96,
};

function mkCell(overrides: Partial<PerfCell> = {}): PerfCell {
  return {
    scopeId: 'waveform',
    width: 3840,
    height: 2160,
    pipeline: 'cpu',
    mode: 'compute-only',
    samples: 50,
    medianMs: 10,
    p99Ms: 12,
    iqrMs: 1,
    status: 'ok',
    ...overrides,
  };
}

function mkReport(results: PerfCell[], hw: HwFingerprint = FP_A): PerfReport {
  return {
    schemaVersion: PERF_SCHEMA_VERSION,
    timestamp: '2026-04-19T00:00:00.000Z',
    hw,
    results,
  };
}

describe('comparator', () => {
  it('flags 30%+ regressions', () => {
    const base = mkReport([mkCell({ medianMs: 10 })]);
    const curr = mkReport([mkCell({ medianMs: 13.5 })]); // +35%
    const { regressions } = compareReports(base, curr);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].deltaPct).toBeGreaterThan(30);
  });

  it('does not flag within-threshold changes (e.g. +10%)', () => {
    const base = mkReport([mkCell({ medianMs: 10 })]);
    const curr = mkReport([mkCell({ medianMs: 11 })]); // +10%
    const { regressions } = compareReports(base, curr);
    expect(regressions).toHaveLength(0);
  });

  it('flags 30%+ improvements', () => {
    const base = mkReport([mkCell({ medianMs: 10 })]);
    const curr = mkReport([mkCell({ medianMs: 6 })]); // -40%
    const { improvements } = compareReports(base, curr);
    expect(improvements).toHaveLength(1);
    expect(improvements[0].deltaPct).toBeLessThan(-30);
  });

  it('throws on mismatched fingerprints', () => {
    const base = mkReport([mkCell()]);
    const curr = mkReport([mkCell()], { ...FP_A, cpuModel: 'Different CPU' });
    expect(() => compareReports(base, curr)).toThrow(
      /hardware fingerprints differ/,
    );
  });

  it('honors custom regressionThresholdPct (does not unlock CI, just per-call)', () => {
    const base = mkReport([mkCell({ medianMs: 10 })]);
    const curr = mkReport([mkCell({ medianMs: 11.5 })]); // +15%
    // default (30%) — no regression
    expect(compareReports(base, curr).regressions).toHaveLength(0);
    // custom 10% — regressed
    expect(
      compareReports(base, curr, { regressionThresholdPct: 10 }).regressions,
    ).toHaveLength(1);
  });

  it('ignores non-ok status cells', () => {
    const base = mkReport([mkCell({ status: 'skipped', medianMs: 0 })]);
    const curr = mkReport([mkCell({ status: 'ok', medianMs: 100 })]);
    const { regressions, deltas } = compareReports(base, curr);
    expect(deltas).toHaveLength(0);
    expect(regressions).toHaveLength(0);
  });

  it('DEFAULT_REGRESSION_THRESHOLD_PCT is locked at 30', () => {
    // Eng review locked this at 30. Guard against accidental bumps.
    expect(DEFAULT_REGRESSION_THRESHOLD_PCT).toBe(30);
  });
});

// ============================================================
// bench.ts (smoke — small resolution so the test is fast)
// ============================================================

describe('bench smoke', () => {
  it('runs one cell and returns the expected shape', async () => {
    const cell = {
      scopeId: 'waveform',
      width: 256,
      height: 256,
      pipeline: 'cpu' as const,
      mode: 'compute-only' as const,
      samples: 0,
      medianMs: 0,
      p99Ms: 0,
      iqrMs: 0,
      status: 'ok' as const,
    };
    // Keep this under 2s: tiny iteration + warmup budget, zero cooldown.
    const result = await runBenchCell(cell, {
      iterations: 5,
      warmup: 2,
      cooldownMs: 0,
    });
    expect(result.status).toBe('ok');
    expect(result.samples).toBe(5);
    expect(result.medianMs).toBeGreaterThan(0);
    expect(result.p99Ms).toBeGreaterThanOrEqual(result.medianMs);
    expect(result.iqrMs).toBeGreaterThanOrEqual(0);
  }, 10_000);

  it('WebGPU cells are skipped in Node with a clear message', async () => {
    const cell = {
      scopeId: 'waveform',
      width: 256,
      height: 256,
      pipeline: 'webgpu' as const,
      mode: 'compute-only' as const,
      samples: 0,
      medianMs: 0,
      p99Ms: 0,
      iqrMs: 0,
      status: 'ok' as const,
    };
    const result = await runBenchCell(cell);
    expect(result.status).toBe('skipped');
    expect(result.error).toMatch(/WebGPU/);
  });
});
