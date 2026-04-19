#!/usr/bin/env tsx
/**
 * Perf bench CLI — Node CPU path.
 *
 * Usage:
 *   pnpm tsx scripts/perf-bench.ts [--microbench] [--smoke] [--output path.json]
 *                                  [--iterations N] [--warmup N] [--cooldown-ms N]
 *                                  [--notes "free-form"]
 *
 * Writes a PerfReport JSON. WebGPU cells are included with status='skipped'
 * — fill them in by running the browser harness and merging (or by committing
 * the browser JSON separately).
 */
import { resolve } from 'node:path';
import { runBench, writeReport } from '../packages/validation/src/perf/index.js';
import type { BenchOptions } from '../packages/validation/src/perf/types.js';

interface ParsedArgs {
  output: string;
  opts: BenchOptions;
}

function parseArgs(argv: string[]): ParsedArgs {
  const opts: BenchOptions = {};
  let output = './perf-report.json';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--microbench':
        opts.microbench = true;
        break;
      case '--smoke':
        opts.smoke = true;
        break;
      case '--output':
      case '-o':
        output = next();
        break;
      case '--iterations':
        opts.iterations = Number.parseInt(next(), 10);
        break;
      case '--warmup':
        opts.warmup = Number.parseInt(next(), 10);
        break;
      case '--cooldown-ms':
        opts.cooldownMs = Number.parseInt(next(), 10);
        break;
      case '--notes':
        opts.notes = next();
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }

  return { output, opts };
}

function printHelp(): void {
  const help = [
    'perf-bench — Node CPU perf harness',
    '',
    'Options:',
    '  --microbench            Add 256² microbench cells',
    '  --smoke                 Run a single small cell (dev smoke test)',
    '  --output, -o <path>     Write report to path (default ./perf-report.json)',
    '  --iterations <n>        Timed samples per cell (default 50)',
    '  --warmup <n>            Warm-up iterations per cell (default 20)',
    '  --cooldown-ms <n>       Cooldown between cells in ms (default 500)',
    '  --notes <str>           Free-form notes recorded on the report',
    '  --help, -h              Print this help',
  ].join('\n');
  process.stdout.write(help + '\n');
}

async function main(): Promise<void> {
  const { output, opts } = parseArgs(process.argv.slice(2));
  const outputAbs = resolve(output);

  process.stderr.write(
    `perf-bench: running${opts.smoke ? ' (smoke)' : ''}${
      opts.microbench ? ' (+ microbench)' : ''
    }\n`,
  );
  const t0 = Date.now();
  const report = await runBench(opts);
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(2);

  writeReport(report, outputAbs);

  const okCount = report.results.filter((c) => c.status === 'ok').length;
  const skipCount = report.results.filter((c) => c.status === 'skipped').length;
  const errCount = report.results.filter((c) => c.status === 'error').length;

  process.stderr.write(
    `perf-bench: wrote ${report.results.length} cells ` +
      `(${okCount} ok, ${skipCount} skipped, ${errCount} error) ` +
      `in ${elapsedSec}s → ${outputAbs}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `perf-bench: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
