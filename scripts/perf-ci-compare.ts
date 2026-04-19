#!/usr/bin/env tsx
/**
 * perf-ci-compare — baseline vs current comparison, emits markdown for PR comment.
 *
 * CI threshold LOCKED at 30% per eng review. Lane 3 will plug this into the
 * GitHub Actions workflow; Lane 2 ships the script so the output format is
 * stable before the workflow lands.
 *
 * Exit codes:
 *   0  no regressions (may have improvements or neutral deltas)
 *   2  regressions detected (CI should warn — NOT fail — per 30% threshold
 *      being a warn-only gate; Lane 3 wires the workflow to treat this accordingly)
 *   1  usage or input error
 *
 * Usage:
 *   pnpm tsx scripts/perf-ci-compare.ts --baseline baseline.json --current current.json
 *                                      [--output summary.md] [--threshold 30]
 */
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  readReport,
  compareReports,
  DEFAULT_REGRESSION_THRESHOLD_PCT,
  cellKey,
} from '../packages/validation/src/perf/index.js';
import type {
  ComparisonDelta,
  PerfReport,
} from '../packages/validation/src/perf/types.js';

interface ParsedArgs {
  baselinePath: string;
  currentPath: string;
  outputPath?: string;
  thresholdPct: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  let baselinePath: string | undefined;
  let currentPath: string | undefined;
  let outputPath: string | undefined;
  let thresholdPct = DEFAULT_REGRESSION_THRESHOLD_PCT;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--baseline':
        baselinePath = next();
        break;
      case '--current':
        currentPath = next();
        break;
      case '--output':
      case '-o':
        outputPath = next();
        break;
      case '--threshold':
        thresholdPct = Number.parseFloat(next());
        break;
      case '--help':
      case '-h':
        process.stdout.write(
          'perf-ci-compare --baseline <path> --current <path> [--output md] [--threshold N]\n',
        );
        process.exit(0);
        break;
      default:
        throw new Error(`unknown flag: ${a}`);
    }
  }

  if (!baselinePath || !currentPath) {
    throw new Error('both --baseline and --current are required');
  }

  return { baselinePath, currentPath, outputPath, thresholdPct };
}

function fmtMs(ms: number): string {
  if (ms < 1) return `${ms.toFixed(3)}ms`;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(1)}ms`;
}

function fmtPct(p: number): string {
  const sign = p >= 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

function fmtCell(d: ComparisonDelta): string {
  return `\`${d.scopeId}\` ${d.width}×${d.height} ${d.pipeline}/${d.mode}`;
}

function buildMarkdown(
  baseline: PerfReport,
  current: PerfReport,
  cmp: {
    regressions: ComparisonDelta[];
    improvements: ComparisonDelta[];
    deltas: ComparisonDelta[];
    regressionThresholdPct: number;
  },
): string {
  const lines: string[] = [];
  lines.push(`## Perf comparison`);
  lines.push('');
  lines.push(
    `- **Threshold:** ±${cmp.regressionThresholdPct}% (warn-only)`,
  );
  lines.push(`- **Hardware:** ${baseline.hw.cpuModel} · ${baseline.hw.os} · Node ${baseline.hw.nodeVersion}`);
  lines.push(`- **Baseline:** ${baseline.timestamp} (${baseline.results.length} cells)`);
  lines.push(`- **Current:** ${current.timestamp} (${current.results.length} cells)`);
  lines.push(`- **Compared:** ${cmp.deltas.length} cell(s)`);
  lines.push('');

  if (cmp.regressions.length > 0) {
    lines.push(`### Regressions (${cmp.regressions.length})`);
    lines.push('');
    lines.push('| Cell | Baseline | Current | Δ |');
    lines.push('|------|---------:|--------:|--:|');
    for (const d of cmp.regressions.sort((a, b) => b.deltaPct - a.deltaPct)) {
      lines.push(
        `| ${fmtCell(d)} | ${fmtMs(d.baselineMedianMs)} | ${fmtMs(d.currentMedianMs)} | ${fmtPct(d.deltaPct)} |`,
      );
    }
    lines.push('');
  } else {
    lines.push(`### Regressions`);
    lines.push('');
    lines.push(`_None above ${cmp.regressionThresholdPct}% threshold._`);
    lines.push('');
  }

  if (cmp.improvements.length > 0) {
    lines.push(`### Improvements (${cmp.improvements.length})`);
    lines.push('');
    lines.push('| Cell | Baseline | Current | Δ |');
    lines.push('|------|---------:|--------:|--:|');
    for (const d of cmp.improvements.sort((a, b) => a.deltaPct - b.deltaPct)) {
      lines.push(
        `| ${fmtCell(d)} | ${fmtMs(d.baselineMedianMs)} | ${fmtMs(d.currentMedianMs)} | ${fmtPct(d.deltaPct)} |`,
      );
    }
    lines.push('');
  }

  // Cells in baseline but missing from current — useful signal.
  const currKeys = new Set(current.results.map(cellKey));
  const missing = baseline.results.filter((c) => !currKeys.has(cellKey(c)));
  if (missing.length > 0) {
    lines.push(`### Missing in current (${missing.length})`);
    lines.push('');
    for (const c of missing) {
      lines.push(`- \`${c.scopeId}\` ${c.width}×${c.height} ${c.pipeline}/${c.mode}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Generated by `scripts/perf-ci-compare.ts` — threshold locked at 30% (eng review)._');
  return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseline = readReport(resolve(args.baselinePath));
  const current = readReport(resolve(args.currentPath));

  const cmp = compareReports(baseline, current, {
    regressionThresholdPct: args.thresholdPct,
  });

  const md = buildMarkdown(baseline, current, cmp);
  if (args.outputPath) {
    writeFileSync(resolve(args.outputPath), md, 'utf8');
    process.stderr.write(`perf-ci-compare: wrote ${args.outputPath}\n`);
  } else {
    process.stdout.write(md);
  }

  if (cmp.regressions.length > 0) {
    process.stderr.write(
      `perf-ci-compare: ${cmp.regressions.length} regression(s) above ${cmp.regressionThresholdPct}% threshold\n`,
    );
    process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(
    `perf-ci-compare: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
