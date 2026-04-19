/**
 * Report reader + writer. Keeps JSON stable and validates schemaVersion on read.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PerfReport } from './types.js';
import { PERF_SCHEMA_VERSION } from './types.js';

/** Write a PerfReport as pretty-printed JSON. Creates parent dirs if missing. */
export function writeReport(report: PerfReport, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

/**
 * Read a PerfReport from disk. Throws on missing required fields or
 * mismatched schemaVersion (breaking-change signal).
 */
export function readReport(path: string): PerfReport {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!isPerfReportLike(parsed)) {
    throw new Error(`readReport: ${path} is not a valid PerfReport`);
  }
  if (parsed.schemaVersion !== PERF_SCHEMA_VERSION) {
    throw new Error(
      `readReport: ${path} has schemaVersion=${JSON.stringify(
        parsed.schemaVersion,
      )}, expected ${JSON.stringify(PERF_SCHEMA_VERSION)}`,
    );
  }
  return parsed;
}

function isPerfReportLike(x: unknown): x is PerfReport {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.schemaVersion === 'string' &&
    typeof r.timestamp === 'string' &&
    typeof r.hw === 'object' &&
    r.hw !== null &&
    Array.isArray(r.results)
  );
}
