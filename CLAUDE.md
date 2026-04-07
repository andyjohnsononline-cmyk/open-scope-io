# OpenScope — AI Agent Context

Open source composable video scope engine for browser and Node.js.

## Project Structure

Monorepo using pnpm workspaces:

```
packages/
  core/       — Plugin registry, GPU + CPU pipeline orchestration, types
  shaders/    — Built-in scope implementations (WGSL compute + CPU fallback)
  renderer/   — WebGL2 + Canvas 2D scope visualizations
  cli/        — Headless CLI tool for agentic workflows
  openscope/  — Meta-package re-exporting everything
  validation/ — Conformance validation suite (private, test-only)
apps/
  demo/       — Vite demo app for testing scopes in-browser
```

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Start demo app (Vite, port 5173)
pnpm test             # Run tests (vitest)
pnpm typecheck        # TypeScript type checking
pnpm prepare:goldens  # Regenerate golden reference JSONs (requires pnpm build first)
```

## Testing

- Framework: **vitest** (config at `vitest.config.ts`)
- Test location: `packages/*/src/**/*.test.ts`
- Run: `pnpm test`
- When writing new scopes or modifying analysis logic, write tests for the CPU path

## Architecture

- **ScopePlugin** interface: each scope type provides a WGSL shader, buffer size calculator, result parser, and CPU fallback
- **GpuPipeline**: WebGPU compute pipeline — creates textures from images, dispatches shaders, reads back results
- **CpuPipeline**: Pure TypeScript fallback for Node.js / headless environments
- **ScopeRenderer**: Maps scope IDs to Canvas 2D render functions (fallback/headless)
- **WebGlScopeRenderer**: WebGL2 GPU-accelerated display renderer with multi-pass pipeline (tonemap → blur → composite → graticule). Uses `ScopeAppearance` for configurable intensity, blur, glow, and graticule styling

## Color Science

v1 assumes sRGB / Rec.709 with BT.709 luma coefficients (0.2126R + 0.7152G + 0.0722B).

## Key Conventions

- All WGSL shaders use bind group 0: texture at binding 0, storage buffer at binding 1
- Workgroup size: 16x16
- Buffer sizes are in u32 elements, not bytes
- CPU and GPU paths must produce equivalent results
- Use `parseHexColor()` from `@openscope/renderer` for hex color parsing

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
