# Changelog

All notable changes to OpenScope will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.1.0] - 2026-03-29

### Added

- **Conformance validation suite** (`@openscope/validation`). New private workspace package with Tier 1 synthetic golden tests and Tier 2 property-based invariants across all 5 scope types. 106 tests covering solid colors, gradients, SMPTE bars, checkerboard, single pixel, seeded noise, and cross-scope consistency.
- **Test image generators** for solid colors, horizontal/vertical gradients, SMPTE 75%/100% bars, checkerboard, single pixel, and seeded PRNG noise patterns.
- **Mathematical invariant checkers** for histogram, waveform, RGB parade, vectorscope, and cross-scope consistency. Verifies bin sums equal pixel count, values stay in range, and histogram/waveform/parade agree.
- **CLI JSON contract test** verifying the `openscope analyze` command outputs valid JSON with correct top-level shape, frame shape, scope IDs, dataShape, data arrays, compact mode, and scope filtering.
- **Design system** (`DESIGN.md`). Phosphor green accent, Geist type family, 4px base spacing, dark-only theme. Researched from Nobe OmniScope, ScopeBox, and Vitest.

### Fixed

- **CLI stdout truncation when piped.** `process.exit()` called immediately after `console.log()` could terminate the process before stdout flushed, producing truncated JSON output. Changed to `process.exitCode` which allows the event loop to drain naturally.

### Changed

- **CLAUDE.md** now references DESIGN.md for visual/UI decisions and lists the validation package in the project structure.

## [0.1.0.1] - 2026-03-24

### Added

- VERSION file for semantic versioning (4-digit format: MAJOR.MINOR.PATCH.MICRO)
- CHANGELOG.md following Keep a Changelog format
- CLAUDE.md with project structure, commands, testing, architecture, and conventions for AI agent workflows

