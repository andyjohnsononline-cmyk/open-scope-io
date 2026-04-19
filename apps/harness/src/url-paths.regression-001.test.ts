import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Regression: ISSUE-001 — VARIANT_DIR_BASE double-prefix against Vite middleware
// Found by /qa on 2026-04-19
// Report: .gstack/qa-reports/qa-report-localhost-2026-04-19.md
//
// The Vite middleware in apps/harness/vite.config.ts maps
//   /resolve/<rest>  →  golden-references/2_april-6-2026-stills and scopes/<rest>
// so VARIANT_DIR_BASE in main.ts MUST be '/resolve'. If someone sets it to
// '/resolve/2_april-6-2026-stills and scopes' (the old buggy value), every
// spec.json fetch 404s because the subdir gets duplicated.
describe('harness URL contract (regression: ISSUE-001)', () => {
  it('VARIANT_DIR_BASE is exactly "/resolve" (no doubled subdirectory)', () => {
    const src = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');
    const match = src.match(/const\s+VARIANT_DIR_BASE\s*=\s*['"]([^'"]+)['"]/);
    expect(match, 'VARIANT_DIR_BASE constant not found in main.ts').not.toBeNull();
    expect(match![1]).toBe('/resolve');
  });
});
