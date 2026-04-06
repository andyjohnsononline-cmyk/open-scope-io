/**
 * Golden reference loader for conformance tests.
 *
 * Loads .golden.json files and provides typed access to expected scope results.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface GoldenScopeData {
  scopeId: string;
  shape: [number, number];
  data: number[];
  metadata: Record<string, number | boolean | string>;
}

export interface GoldenReference {
  version: '1.0';
  name: string;
  description: string;
  frameWidth: number;
  frameHeight: number;
  colorSpace: 'sRGB';
  source: 'synthetic' | 'resolve-export';
  generatedAt: string;
  scopes: Record<string, GoldenScopeData>;
}

/**
 * Load a single golden reference by name.
 */
export function loadGolden(name: string): GoldenReference {
  const filePath = join(__dirname, `${name}.golden.json`);
  if (!existsSync(filePath)) {
    throw new Error(
      `Golden reference not found: ${name}. Run 'pnpm run prepare:goldens' first.`,
    );
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/**
 * List all available golden reference names.
 */
export function listGoldens(): string[] {
  if (!existsSync(__dirname)) return [];
  return readdirSync(__dirname)
    .filter((f) => f.endsWith('.golden.json'))
    .map((f) => f.replace('.golden.json', ''));
}

/**
 * Load all golden references.
 */
export function loadAllGoldens(): Map<string, GoldenReference> {
  const goldens = new Map<string, GoldenReference>();
  for (const name of listGoldens()) {
    goldens.set(name, loadGolden(name));
  }
  return goldens;
}

/**
 * Compare scope result data against a golden reference.
 * Returns deviation metrics.
 */
export function compareToGolden(
  actual: Uint32Array,
  golden: GoldenScopeData,
): {
  maxDeviation: number;
  totalDeviation: number;
  deviatingBins: number;
  totalBins: number;
} {
  const goldenData = golden.data;
  const totalBins = Math.min(actual.length, goldenData.length);
  let maxDeviation = 0;
  let totalDeviation = 0;
  let deviatingBins = 0;

  for (let i = 0; i < totalBins; i++) {
    const diff = Math.abs(actual[i] - goldenData[i]);
    if (diff > 0) {
      deviatingBins++;
      totalDeviation += diff;
      if (diff > maxDeviation) maxDeviation = diff;
    }
  }

  return { maxDeviation, totalDeviation, deviatingBins, totalBins };
}
