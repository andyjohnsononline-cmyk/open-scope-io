# Changelog

All notable changes to OpenScope will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.2.0] - 2026-03-29

### Added

- **WebGL2 scope renderer** (`@openscope/renderer`). You can now render all 5 scope types with GPU-accelerated visuals that match DaVinci Resolve quality: smooth intensity gradients, natural density accumulation, and real-time Gaussian blur/glow. Replaces Canvas 2D as the default display path, with Canvas 2D as automatic fallback.
- **ScopeAppearance configuration** — tune intensity mapping, blur, glow, graticule styling, and background color per scope. Ships with defaults that match professional scope tools out of the box.
- **WebGL2 infrastructure** — GL context management, shader compilation, FBO support with automatic RGBA16F/RGBA8 fallback, and flexible texture upload paths (R32UI, R32F, RGBA8).
- **Scope-specific WebGL renderers** — waveform with RGB overlay mode, RGB parade, vectorscope with skin-tone line and target boxes, histogram with log Y-axis, and false color with zone classification legend.
- **GPU context loss recovery** — if the GPU context drops, scopes automatically fall back to Canvas 2D with a "CPU" badge. Recovery is automatic when the context returns.
- **Waveform RGB/Luma toggle** — switch between combined RGB overlay (additive blending, three-channel view) and single-channel luma trace. Button in demo controls.
- **Demo CSS alignment with DESIGN.md** — color tokens, typography (Geist + Geist Mono), spacing, responsive breakpoints, and focus-visible styles now match the design system.

### For contributors

- **48 new WebGL rendering tests** covering shader math equivalence, sRGB/linear conversions, false color zone lookup, graticule geometry, and parseHexColor edge cases.

### Changed

- **Demo app** now auto-detects WebGL2 and uses GPU rendering by default (Canvas 2D as fallback). Footer shows which renderer is active. Canvas sizing is DPR-aware for crisp HiDPI displays.
- **`@openscope/renderer` exports** now include `WebGlScopeRenderer`, `DEFAULT_APPEARANCE`, `ScopeAppearance`, and `WaveformMode`.

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

