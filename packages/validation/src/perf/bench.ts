/**
 * Bench cell runner (Node CPU path).
 *
 * Produces a PerfCell with median/p99/iqr/samples populated for a single
 * cell from the matrix. `runBench()` iterates the full matrix and returns a
 * complete PerfReport.
 *
 * WebGPU cells are skipped with status='skipped' and a clear message — they
 * are filled in by the browser harness.
 *
 * Node end-to-end includes Canvas 2D render (NOT WebGL2). The schema carries
 * `pipeline` + `mode` so that consumers don't mis-compare Node CPU/Canvas
 * end-to-end against browser WebGPU/WebGL2 end-to-end.
 */
import { performance } from 'node:perf_hooks';
import { createCpuPipeline, type ScopeResult } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import {
  renderWaveform,
  renderParade,
  renderVectorscope,
  renderHistogram,
  renderFalseColor,
  type RenderOptions,
} from '@openscope/renderer';
import { generateSMPTEBars, SMPTE_75_BARS } from '../generators/smpte-bars.js';
import type {
  BenchOptions,
  PerfCell,
  PerfReport,
} from './types.js';
import { PERF_SCHEMA_VERSION } from './types.js';
import { buildMatrix, SCOPE_IDS, cellKey } from './matrix.js';
import { captureHwFingerprint } from './fingerprint.js';
import { median, p99, iqr } from './stats.js';
import { warmup, cooldown } from './warmup.js';

const DEFAULT_ITERATIONS = 50;
const DEFAULT_WARMUP = 20;
const DEFAULT_COOLDOWN_MS = 500;

/** Small canvas size used for Node Canvas 2D render target (display-size). */
const RENDER_W = 480;
const RENDER_H = 270;

/** Produce a synthetic SMPTE 75% bars frame at the requested resolution. */
function makeFrame(width: number, height: number) {
  return {
    data: generateSMPTEBars(width, height, SMPTE_75_BARS),
    width,
    height,
  };
}

type RenderFn = (
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
) => void;

/** Map scope id → renderer + options. Matches render-scopes.ts. */
function pickRenderer(scopeId: string): {
  render: RenderFn;
  needsSource?: boolean;
} {
  switch (scopeId) {
    case 'waveform':
      return { render: renderWaveform };
    case 'rgbParade':
      return { render: renderParade };
    case 'vectorscope':
      return { render: renderVectorscope };
    case 'histogram':
      return { render: renderHistogram };
    case 'falseColor':
      return { render: renderFalseColor, needsSource: true };
    default:
      throw new Error(`unknown scope id: ${scopeId}`);
  }
}

interface NodeCanvasModule {
  createCanvas: (w: number, h: number) => {
    getContext(type: '2d'): unknown;
  };
}

let cachedCanvasMod: NodeCanvasModule | null = null;
async function getNodeCanvas(): Promise<NodeCanvasModule> {
  if (cachedCanvasMod) return cachedCanvasMod;
  cachedCanvasMod = (await import('@napi-rs/canvas')) as unknown as NodeCanvasModule;
  return cachedCanvasMod;
}

/**
 * Construct the per-sample work function for a given cell.
 * Keeps the inner timed function as small as possible — all setup happens
 * outside the timed loop.
 */
async function buildWorkFn(cell: PerfCell): Promise<() => Promise<void>> {
  const frame = makeFrame(cell.width, cell.height);

  const pipeline = createCpuPipeline();
  for (const scope of allScopes) pipeline.register(scope);

  if (cell.mode === 'compute-only') {
    return async () => {
      await pipeline.analyze(frame, [cell.scopeId]);
    };
  }

  // end-to-end: analyze + Canvas 2D render
  const { createCanvas } = await getNodeCanvas();
  const canvas = createCanvas(RENDER_W, RENDER_H);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const { render, needsSource } = pickRenderer(cell.scopeId);

  const renderOpts: RenderOptions = { background: '#111214' };
  if (needsSource) {
    renderOpts.sourcePixels = frame.data;
    renderOpts.sourceWidth = frame.width;
    renderOpts.sourceHeight = frame.height;
  }

  return async () => {
    const results = await pipeline.analyze(frame, [cell.scopeId]);
    const res = results.get(cell.scopeId);
    if (!res) return;
    render(ctx, res, renderOpts);
  };
}

/**
 * Execute a single cell. Returns a filled-in PerfCell with metrics.
 * WebGPU cells (on Node) short-circuit to status='skipped'.
 */
export async function runBenchCell(
  cell: PerfCell,
  opts: BenchOptions = {},
): Promise<PerfCell> {
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
  const warmupIters = opts.warmup ?? DEFAULT_WARMUP;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  if (cell.pipeline === 'webgpu') {
    return {
      ...cell,
      samples: 0,
      medianMs: 0,
      p99Ms: 0,
      iqrMs: 0,
      status: 'skipped',
      error: 'WebGPU not available in Node — run browser harness to fill this cell',
    };
  }

  try {
    const work = await buildWorkFn(cell);

    await warmup(work, warmupIters);

    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      await work();
      const t1 = performance.now();
      samples.push(t1 - t0);
    }

    await cooldown(cooldownMs);

    return {
      ...cell,
      samples: iterations,
      medianMs: median(samples),
      p99Ms: p99(samples),
      iqrMs: iqr(samples),
      status: 'ok',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...cell,
      samples: 0,
      medianMs: 0,
      p99Ms: 0,
      iqrMs: 0,
      status: 'error',
      error: msg,
    };
  }
}

/**
 * Run the full matrix (Node CPU path). WebGPU cells are included in the
 * report with status='skipped' so the browser harness can fill them in.
 */
export async function runBench(opts: BenchOptions = {}): Promise<PerfReport> {
  let cells = buildMatrix({ microbench: opts.microbench });
  if (opts.filter) cells = cells.filter(opts.filter);
  if (opts.smoke) {
    // Smoke: keep one CPU compute-only cell at microbench resolution.
    const smokeCell = cells.find(
      (c) =>
        c.pipeline === 'cpu' &&
        c.mode === 'compute-only' &&
        c.scopeId === 'waveform',
    );
    cells = smokeCell
      ? [
          {
            ...smokeCell,
            width: 256,
            height: 256,
          },
        ]
      : [];
  }

  const timestamp = new Date().toISOString();
  const hw = captureHwFingerprint();
  const results: PerfCell[] = [];

  const seen = new Set<string>();
  for (const cell of cells) {
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    const r = await runBenchCell(cell, opts);
    results.push(r);
  }

  return {
    schemaVersion: PERF_SCHEMA_VERSION,
    timestamp,
    hw,
    results,
    notes: opts.notes,
  };
}

// Re-export for convenience at bench entry point.
export { SCOPE_IDS };
