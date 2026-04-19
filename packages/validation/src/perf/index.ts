/**
 * Perf bench barrel. Public entry point for `@openscope/validation` perf API.
 *
 * - Node CPU runner:      runBench, runBenchCell
 * - Matrix definition:    buildMatrix, SCOPE_IDS, RESOLUTIONS
 * - Fingerprint:          captureHwFingerprint, compareFingerprints
 * - Statistics:           median, p99, iqr, percentile
 * - Report IO:            writeReport, readReport
 * - Regression detection: compareReports, DEFAULT_REGRESSION_THRESHOLD_PCT
 */
export * from './types.js';
export {
  buildMatrix,
  cellKey,
  SCOPE_IDS,
  RESOLUTIONS,
  MICROBENCH_RESOLUTION,
  PIPELINES,
  MODES,
} from './matrix.js';
export { captureHwFingerprint, compareFingerprints } from './fingerprint.js';
export type { FingerprintComparison } from './fingerprint.js';
export { median, p99, iqr, percentile } from './stats.js';
export { warmup, cooldown } from './warmup.js';
export { runBench, runBenchCell } from './bench.js';
export { writeReport, readReport } from './report.js';
export {
  compareReports,
  DEFAULT_REGRESSION_THRESHOLD_PCT,
} from './comparator.js';
export type { CompareOpts } from './comparator.js';
