# Changelog

All notable changes to OpenScope will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.2.0] - 2026-03-29

### Added

- **WebGL2 scope renderer** (`@openscope/renderer`). New GPU-accelerated display pipeline replacing Canvas 2D for all 5 scope types. Multi-pass rendering: analysis buffer upload, log/linear/gamma tonemap, separable Gaussian blur, additive blend compositing, and graticule overlay. Matches DaVinci Resolve-quality visual rendering with smooth intensity gradients and natural density accumulation.
- **Configurable scope appearance** — tune intensity mapping, blur, glow, graticule styling, and background color via the `ScopeAppearance` interface. Ships with defaults matched to professional scope tools.
- **WebGL2 infrastructure** — GL context management, shader compilation utilities, FBO management with RGBA16F/RGBA8 fallback, R32UI/R32F texture upload paths, and column-major transpose utility.
- **Scope-specific WebGL renderers** for waveform (with RGB overlay mode), RGB parade, vectorscope (centered square viewport, skin-tone line, target boxes), histogram (log Y-axis, triangulated channel fills), and false color (fragment shader zone classification with legend overlay).
- **GPU context loss recovery** — if the GPU drops mid-session, scopes fall back to Canvas 2D automatically with "CPU" badge indicators, then restore when the context recovers.
- **Waveform RGB/Luma mode toggle** in demo controls. RGB mode overlaps R/G/B channels with additive blending; Luma mode shows single white trace.
- **Demo CSS alignment with DESIGN.md** — updated all color tokens, typography (Geist + Geist Mono via CDN), spacing, responsive breakpoints, and focus-visible styles to match the design system.
- **WebGL rendering unit tests** — 48 new tests covering shader math equivalence (log/linear/gamma tonemap, sRGB/linear conversions, false color zones), column-major transpose, graticule geometry generation, and parseHexColor edge cases.

### Changed

- **Demo app** now auto-detects WebGL2 and uses GPU-accelerated rendering by default, falling back to Canvas 2D when unavailable. Footer shows active rendering mode. HiDPI displays get pixel-perfect sizing.
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

