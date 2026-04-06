#!/usr/bin/env bash
#
# OpenScope Autoresearch — Experiment Runner
#
# Runs the conformance test suite and extracts a composite score.
# Output format matches what program.md expects.
#
# Usage:
#   ./scripts/autoresearch/run.sh
#   ./scripts/autoresearch/run.sh > run.log 2>&1
#
# DO NOT MODIFY — this file is fixed infrastructure for the autoresearch loop.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "Running conformance suite..."
TEMP_JSON=$(mktemp /tmp/openscope-test-XXXXXX.json)

pnpm vitest run --reporter=json --outputFile="$TEMP_JSON" 2>/dev/null || true

if [ ! -f "$TEMP_JSON" ] || [ ! -s "$TEMP_JSON" ]; then
  echo "---"
  echo "conformance_score:    0.0"
  echo "tests_passed:         0"
  echo "tests_total:          0"
  echo "tests_failed:         0"
  echo "pass_rate:            0.0"
  rm -f "$TEMP_JSON"
  exit 1
fi

# Extract metrics from vitest JSON and compute conformance score
node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf-8'));

  const total = data.numTotalTests || 0;
  const passed = data.numPassedTests || 0;
  const failed = data.numFailedTests || 0;
  const passRate = total > 0 ? passed / total : 0;

  let invariantViolations = 0;
  let maxDeviation = 0;

  for (const suite of (data.testResults || [])) {
    for (const test of (suite.assertionResults || [])) {
      if (test.status === 'failed') {
        const name = (test.ancestorTitles || []).join(' ') + ' ' + (test.title || '');
        if (name.includes('invariant')) {
          invariantViolations++;
        }
        if (name.includes('exact match') || name.includes('deviation')) {
          const msg = (test.failureMessages || []).join(' ');
          const match = msg.match(/expected (\d+) to be/);
          if (match) {
            const dev = parseInt(match[1], 10);
            if (dev > maxDeviation) maxDeviation = dev;
          }
        }
      }
    }
  }

  const score = (1000 * passRate - 10 * maxDeviation - 100 * invariantViolations).toFixed(1);

  console.log('---');
  console.log('conformance_score:    ' + score);
  console.log('tests_passed:         ' + passed);
  console.log('tests_total:          ' + total);
  console.log('tests_failed:         ' + failed);
  console.log('pass_rate:            ' + passRate.toFixed(4));
  console.log('invariant_violations: ' + invariantViolations);
  console.log('max_deviation:        ' + maxDeviation);
" "$TEMP_JSON"

rm -f "$TEMP_JSON"
