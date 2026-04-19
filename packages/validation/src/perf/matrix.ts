/**
 * Build the perf matrix: 5 scopes × 3 resolutions × 2 pipelines × 2 modes = 60 cells.
 * `--microbench` adds 256×256 at pipelines × modes per scope → 20 more = 80 total.
 *
 * 1920×1080 was explicitly dropped in eng review — these are DI-targeted resolutions.
 */
import type {
  BenchMode,
  PerfCell,
  PipelineKind,
  ResolutionPreset,
} from './types.js';

export const SCOPE_IDS = [
  'waveform',
  'rgbParade',
  'vectorscope',
  'histogram',
  'falseColor',
] as const;

export const RESOLUTIONS: readonly ResolutionPreset[] = [
  { label: 'UHD', width: 3840, height: 2160 },
  { label: '4K DCI', width: 4096, height: 2160 },
  { label: '8K UHD', width: 7680, height: 4320 },
] as const;

export const MICROBENCH_RESOLUTION: ResolutionPreset = {
  label: '256²',
  width: 256,
  height: 256,
};

export const PIPELINES: readonly PipelineKind[] = ['cpu', 'webgpu'] as const;
export const MODES: readonly BenchMode[] = ['compute-only', 'end-to-end'] as const;

/** Create an empty cell with zeroed metrics — used as a template. */
function emptyCell(
  scopeId: string,
  width: number,
  height: number,
  pipeline: PipelineKind,
  mode: BenchMode,
): PerfCell {
  return {
    scopeId,
    width,
    height,
    pipeline,
    mode,
    samples: 0,
    medianMs: 0,
    p99Ms: 0,
    iqrMs: 0,
    status: 'ok',
  };
}

/**
 * Enumerate all cells in the perf matrix.
 *
 * @param opts.microbench — when true, append 256² cells per scope × pipeline × mode.
 */
export function buildMatrix(opts: { microbench?: boolean } = {}): PerfCell[] {
  const cells: PerfCell[] = [];
  for (const scopeId of SCOPE_IDS) {
    for (const res of RESOLUTIONS) {
      for (const pipeline of PIPELINES) {
        for (const mode of MODES) {
          cells.push(emptyCell(scopeId, res.width, res.height, pipeline, mode));
        }
      }
    }
  }
  if (opts.microbench) {
    for (const scopeId of SCOPE_IDS) {
      for (const pipeline of PIPELINES) {
        for (const mode of MODES) {
          cells.push(
            emptyCell(
              scopeId,
              MICROBENCH_RESOLUTION.width,
              MICROBENCH_RESOLUTION.height,
              pipeline,
              mode,
            ),
          );
        }
      }
    }
  }
  return cells;
}

/** Deterministic key for a cell — used for matching between baseline + current. */
export function cellKey(cell: {
  scopeId: string;
  width: number;
  height: number;
  pipeline: PipelineKind;
  mode: BenchMode;
}): string {
  return `${cell.scopeId}|${cell.width}x${cell.height}|${cell.pipeline}|${cell.mode}`;
}
