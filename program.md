# OpenScope Autoresearch — Scope Conformance

Autonomous research loop for OpenScope video scope analysis conformance.
Adapted from [karpathy/autoresearch](https://github.com/karpathy/autoresearch).

The goal: make OpenScope's 5 scope analyzers (waveform, RGB parade, vectorscope,
histogram, false color) produce results identical to DaVinci Resolve for any
real-world or synthetic input.

## Setup

To set up a new experiment, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `apr6`). The branch `autoresearch/<tag>` must not already exist — this is a fresh run.
2. **Create the branch**: `git checkout -b autoresearch/<tag>` from current main.
3. **Read the in-scope files**: The repo is a pnpm monorepo. Read these for full context:
   - `CLAUDE.md` — project architecture, conventions, color science decisions
   - `packages/shaders/src/*.ts` — the 5 scope analysis implementations (**these are what you modify**)
   - `packages/shaders/src/utils.ts` — shared BT.709 luma, clamp helpers
   - `packages/validation/src/conformance.test.ts` — existing golden tests
   - `packages/validation/src/resolve-conformance.test.ts` — Resolve-verified golden tests
   - `packages/validation/src/invariants/*.ts` — mathematical invariant checkers
   - `packages/validation/src/generators/*.ts` — synthetic frame generators
   - `packages/validation/src/goldens/*.golden.json` — golden reference data
4. **Verify golden references exist**: Check that `packages/validation/src/goldens/` contains `.golden.json` files and any required frame PNGs. If not, tell the human to run `pnpm run prepare:goldens`.
5. **Initialize results.tsv**: Create `results.tsv` with just the header row. The baseline will be recorded after the first run.
6. **Confirm and go**: Confirm setup looks good.

Once you get confirmation, kick off the experimentation.

## Experimentation

Each experiment runs the conformance test suite. The metric is the **conformance score** — higher is better. You run it via:

```bash
./scripts/autoresearch/run.sh
```

This runs `pnpm test`, extracts the conformance score, and prints a summary.

**What you CAN do:**

- Modify `packages/shaders/src/*.ts` — the scope analysis implementations. Everything is fair game: `analyzeCpu()` logic, `parseResult()`, luma coefficients, clamping behavior, Cb/Cr mapping, bin counting, metadata computation.
- Add new test patterns in `packages/validation/src/generators/` to discover edge cases.
- Add new invariant checks in `packages/validation/src/invariants/`.
- Add new golden test cases in `packages/validation/src/conformance.test.ts` or `resolve-conformance.test.ts`.

**What you CANNOT do:**

- Modify `packages/core/` — the pipeline, types, and registry are fixed.
- Modify golden reference data in `packages/validation/src/goldens/*.golden.json` — these are ground truth.
- Modify `program.md` or `scripts/autoresearch/`.
- Delete or weaken existing tests. You can only add new tests or fix analysis code to pass them.
- Install new packages or add dependencies.

**The goal is simple: get the highest conformance score.** This means all golden tests pass, all invariants hold, all cross-scope consistency checks pass, and deviation from golden references is zero.

**Simplicity criterion**: All else being equal, simpler is better. A small improvement that adds ugly complexity is not worth it. Removing code and getting equal or better results is a great outcome. When evaluating whether to keep a change, weigh the complexity cost against the improvement magnitude.

## The conformance metric

The conformance score is computed as:

```
score = 1000 * pass_rate - 10 * max_deviation - 100 * invariant_violations
```

Where:
- `pass_rate` = fraction of tests passing (0.0 to 1.0)
- `max_deviation` = worst-case bin count deviation from any golden reference
- `invariant_violations` = number of mathematical invariant violations across all test images

A perfect score is **1000** (100% pass rate, zero deviation, zero violations).

## Output format

After `run.sh` finishes it prints a summary:

```
---
conformance_score:    985.0
tests_passed:         47
tests_total:          50
invariant_violations: 0
max_deviation:        3
```

## Logging results

When an experiment is done, log it to `results.tsv` (tab-separated, NOT comma-separated).

The TSV has a header row and 6 columns:

```
commit	score	tests_passed	tests_total	status	description
```

1. git commit hash (short, 7 chars)
2. conformance score (e.g. 985.0)
3. tests passed count
4. tests total count
5. status: `keep`, `discard`, or `crash`
6. short text description of what this experiment tried

Example:

```
commit	score	tests_passed	tests_total	status	description
a1b2c3d	980.0	45	50	keep	baseline
b2c3d4e	990.0	48	50	keep	fix waveform rounding at bin boundaries
c3d4e5f	975.0	44	50	discard	switch to BT.2020 luma coefficients
d4e5f6g	0.0	0	0	crash	vectorscope grid overflow
```

## The experiment loop

The experiment runs on a dedicated branch (e.g. `autoresearch/apr6`).

LOOP FOREVER:

1. Look at the git state: current branch/commit.
2. Identify a weakness: look at failing tests, high-deviation golden comparisons, or missing edge case coverage. Read the test output to understand what's wrong.
3. Modify scope analysis code with an experimental fix or improvement.
4. `git commit -m "experiment: <description>"`
5. Run the experiment: `./scripts/autoresearch/run.sh > run.log 2>&1`
6. Read out the results: `grep "^conformance_score:\|^tests_passed:\|^tests_total:" run.log`
7. If grep output is empty, the run crashed. Run `tail -n 50 run.log` to read the error.
8. Record the results in `results.tsv` (do NOT commit results.tsv — leave it untracked)
9. If conformance score improved (higher), keep the commit and advance.
10. If score is equal or worse, `git reset --hard HEAD~1` to revert.

**What to try when stuck:**

- Re-read the BT.709 spec — are the luma coefficients correct?
- Check rounding: `Math.round` vs `Math.floor` vs `Math.trunc` for bin assignment
- Check clamping boundaries: off-by-one at bin 0 and bin 255
- Check vectorscope Cb/Cr derivation constants (1.8556, 1.5748)
- Compare analyzeCpu vs parseResult — do they agree?
- Add a new test pattern that exposes the failure more clearly
- Try fixing one scope at a time instead of changing multiple
- Look at cross-scope invariants for inconsistencies between histogram/waveform/parade

**NEVER STOP**: Once the experiment loop has begun, do NOT pause to ask the human. The human might be asleep. You are autonomous. If you run out of ideas, think harder — re-read the scope implementations for new angles, try combining previous near-misses, look at edge cases in the generators. The loop runs until the human interrupts you, period.

## Color science reference

OpenScope v1 assumes **sRGB / Rec. 709** throughout:

- Luma: `Y = 0.2126*R + 0.7152*G + 0.0722*B`
- Cb: `(B - Y) / 1.8556` — range [-0.5, 0.5]
- Cr: `(R - Y) / 1.5748` — range [-0.5, 0.5]
- Vectorscope grid: 512x512, center = (255, 255) = zero chroma
- Histogram: 4 channels (R, G, B, Luma) x 256 bins
- Waveform: width columns x 256 bins (luma per column)
- RGB Parade: 3 channels x width columns x 256 bins
- False Color: 256 bins (luma histogram for zone classification)

These constants must match DaVinci Resolve's Rec. 709 mode.

## File structure

```
program.md                     ← you are here (DO NOT MODIFY)
scripts/autoresearch/
  run.sh                       ← experiment runner (DO NOT MODIFY)
  prepare.ts                   ← golden reference generator (DO NOT MODIFY)
results.tsv                    ← experiment log (untracked)
packages/shaders/src/
  waveform.ts                  ← MODIFY: luma waveform analysis
  histogram.ts                 ← MODIFY: RGBL histogram analysis
  vectorscope.ts               ← MODIFY: Cb/Cr vectorscope analysis
  parade.ts                    ← MODIFY: RGB parade analysis
  false-color.ts               ← MODIFY: false color / exposure analysis
  utils.ts                     ← MODIFY: shared luma/clamp helpers
packages/validation/src/
  conformance.test.ts           ← CAN EXPAND: add golden test cases
  resolve-conformance.test.ts   ← CAN EXPAND: add Resolve golden tests
  generators/                   ← CAN EXPAND: add test pattern generators
  invariants/                   ← CAN EXPAND: add invariant checkers
  goldens/                      ← DO NOT MODIFY: golden reference data
```
