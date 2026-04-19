/**
 * Perf bench type definitions — shared between Node CPU harness and
 * browser WebGPU harness so that results can be compared apples-to-apples.
 *
 * The schema is versioned. Bump `schemaVersion` on any breaking field change.
 */

export const PERF_SCHEMA_VERSION = '1.0' as const;

export type PipelineKind = 'cpu' | 'webgpu';
export type BenchMode = 'compute-only' | 'end-to-end';
export type CellStatus = 'ok' | 'skipped' | 'error';

/**
 * Hardware + runtime fingerprint. The comparator refuses to compare reports
 * whose fingerprints do not match on all listed fields — if the hardware
 * differs we are not measuring the same thing.
 */
export interface HwFingerprint {
  /** e.g. 'Apple M2 Max' (os.cpus()[0].model) */
  cpuModel: string;
  /** WebGPU adapter.info: `${vendor} ${architecture} ${device}` — 'unknown' on Node */
  gpuModel: string;
  /** process.version (e.g. 'v22.11.0') */
  nodeVersion: string;
  /** os.platform() + ' ' + os.release() (e.g. 'darwin 24.1.0') */
  os: string;
  /** Total RAM rounded to GiB (Math.round(os.totalmem() / 2**30)) */
  memGb: number;
}

/**
 * One matrix cell — a specific scope × resolution × pipeline × mode combination.
 * Produced by `buildMatrix()`. The bench runner fills in `samples/medianMs/
 * p99Ms/iqrMs/status` after executing.
 *
 * Definition of `end-to-end`:
 * - browser + webgpu:  analyze (WebGPU compute) + render (WebGL2)
 * - node    + cpu:     analyze (CPU) + render (Canvas 2D via @napi-rs/canvas)
 * These are NOT equivalent paths; consumers comparing end-to-end cells must
 * agree on pipeline kind first.
 */
export interface PerfCell {
  scopeId: string;
  width: number;
  height: number;
  pipeline: PipelineKind;
  mode: BenchMode;
  /** Number of timed samples collected (matches `iterations` option) */
  samples: number;
  /** Median latency in milliseconds */
  medianMs: number;
  /** 99th percentile latency in milliseconds */
  p99Ms: number;
  /** Interquartile range (p75 - p25) in milliseconds */
  iqrMs: number;
  status: CellStatus;
  /** Populated when status === 'error' or 'skipped' */
  error?: string;
}

/**
 * A full perf run. Produced by `runBench()` (Node CPU path) or emitted by
 * the browser WebGPU harness using the same schema.
 */
export interface PerfReport {
  schemaVersion: typeof PERF_SCHEMA_VERSION;
  /** ISO-8601 timestamp of run start */
  timestamp: string;
  hw: HwFingerprint;
  results: PerfCell[];
  /** Free-form notes (e.g. 'manual browser run, Chrome 131') */
  notes?: string;
}

/** Options accepted by runBench / runBenchCell. */
export interface BenchOptions {
  /** Timed samples per cell. Default 50. */
  iterations?: number;
  /** Untimed warm-up samples per cell. Default 20. */
  warmup?: number;
  /** Cooldown between cells in ms. Default 500. */
  cooldownMs?: number;
  /** Include 256x256 microbench cells. Default false. */
  microbench?: boolean;
  /** Only run a single minimal cell (for smoke/dev). Default false. */
  smoke?: boolean;
  /** Optional filter — only run cells matching this predicate. */
  filter?: (cell: PerfCell) => boolean;
  /** Free-form notes recorded on the report. */
  notes?: string;
}

/** Result of a comparison between baseline and current reports. */
export interface ComparisonDelta {
  scopeId: string;
  width: number;
  height: number;
  pipeline: PipelineKind;
  mode: BenchMode;
  baselineMedianMs: number;
  currentMedianMs: number;
  /** Signed percent change: positive = slower, negative = faster. */
  deltaPct: number;
}

export interface ComparisonResult {
  regressions: ComparisonDelta[];
  improvements: ComparisonDelta[];
  deltas: ComparisonDelta[];
  regressionThresholdPct: number;
}

/** Matrix resolution preset. */
export interface ResolutionPreset {
  label: string;
  width: number;
  height: number;
}
