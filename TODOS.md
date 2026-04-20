# TODOs — OpenScope

## Design Debt

### WCAG contrast for muted labels
- **What:** Consider bumping muted text from `#6b6e76` to `#8b8e96` (~4.5:1 contrast against `#111214`) for strict WCAG AA compliance
- **Why:** Current 3.8:1 ratio passes for large text/UI components but fails AA for regular text. At 10-11px instrument labels this matches industry convention (Resolve uses similar muted labeling), but is technically non-compliant.
- **Pros:** Meets WCAG AA, more readable for users with mild vision impairment
- **Cons:** Changes DESIGN.md, labels become more prominent (compete more with trace data)
- **Context:** Design system decision. Review with actual scope rendering in place to see if brighter labels compete with trace data.
- **Depends on:** None (WebGL2 renderer is now running, review with actual scope rendering in place)

### Appearance presets / theme system
- **What:** Build a theme/preset system for ScopeAppearance. Ship bundled presets ("resolve-like", "omniscope", "classic-broadcast") and let users create custom presets via JSON files.
- **Why:** Differentiator from proprietary tools. Let users customize their scope look. Community engagement.
- **Pros:** Unique open-source feature, professional customization, potential community contributions
- **Cons:** Adds complexity, needs UI for preset selection in the demo, JSON schema maintenance
- **Context:** Cross-model insight from /office-hours suggested making rendering appearance a versioned, testable artifact. ScopeAppearance interface is already designed to support this. Explicitly deferred from v1.
- **Depends on:** None (WebGL2 renderer + ScopeAppearance shipped in v0.1.2.0)

### ScopeDisplayBackend abstraction
- **What:** Extract a `ScopeDisplayBackend` interface so renderer consumers can swap WebGL2/Canvas 2D/future backends without touching app code.
- **Why:** Cleaner separation, enables headless testing with a mock backend.
- **Pros:** Better architecture, testability, future-proof
- **Cons:** Premature if only two backends exist. Adds indirection.
- **Context:** Deferred from CEO Review (via /autoplan). Consensus: correct idea, wrong time. Build the concrete backends first, extract the interface when a third consumer appears.
- **Depends on:** None (both backends stable as of v0.1.2.0)

### Adoption metric (scope render time logging)
- **What:** Log render time per scope per frame to enable performance tracking and A/B comparison.
- **Why:** Without measurement, can't prove WebGL2 is faster or detect regressions.
- **Pros:** Data-driven perf optimization, CI perf regression detection
- **Cons:** Console noise, needs opt-in mechanism
- **Context:** Deferred from CEO Review (via /autoplan). WebGL2 renderer shipped in v0.1.2.0. Ready to implement.

## From CEO Review — Scope Monitor direction (2026-04-19)

These TODOs were surfaced during the `connect-into-resolve` CEO plan review. The Phase 1 validation lake (playback harness + perf benchmarks) ships on branch `connect-into-resolve`. These items are either prerequisites, strategic checkpoints, or deferred dependencies for later phases.

### Revisit "monitor vs embedded engine" strategic thesis (post-Phase 2)
- **What:** Calendar-driven review after Phase 2 (rendering parity) ships. Decide whether standalone monitor stays the Phase 3 thesis OR "OpenScope as the embedded scope engine inside other tools" (OBS, Olive, Kdenlive, Natron, Nuke) becomes the thesis instead.
- **Why:** Original rationale still applies. Additionally, post-Phase-2 the library will have verified Resolve parity + a CI-gated parity contract — which strengthens the embedded-engine pitch ("drop-in scope engine that's measurably accurate"). Revisit once that's real.
- **Pros:** Keeps strategic optionality alive. Parity work serves either thesis.
- **Cons:** Strategic reviews are easy to skip if not scheduled.
- **Context:** Originally deferred 2026-04-19. Re-dated 2026-04-20 to follow Phase 2. Trigger: after Phase 2 parity CI gate is green on main. Process: 1-hr /plan-ceo-review on direction decision. Output: new CEO plan in ~/.gstack/projects/$SLUG/ceo-plans/.
- **Priority:** P1
- **Depends on:** Phase 2 rendering parity shipped

### Verify WebGPU compute path is primary before Phase 1 benchmarks
- **What:** Audit whether `packages/core/gpu-pipeline.ts` is the primary pipeline in both demo and library consumers, or whether it exists in parallel with the WebGL2 rendering path without being what actually runs in production. If parallel-but-unused, either wire it in or explicitly mark it experimental.
- **Why:** Phase 1 perf benchmarks that measure the WebGPU compute path are misleading if the path isn't what ships. CEO review's adversarial subagent flagged this: "WebGL2 renderer and WebGPU compute path are not yet integrated... Benchmarks that compare only the WebGPU path won't reflect what ships."
- **Pros:** Ensures perf claims in Phase 1 outputs are honest. Prevents marketing "WebGPU-fast" when users get the WebGL2 path.
- **Cons:** May require plumbing work before Phase 1 benchmarks can be trusted.
- **Context:** Surfaced by /plan-ceo-review adversarial review on 2026-04-19. The `demo` app uses `ScopeRenderer` (Canvas 2D) + `WebGlScopeRenderer` — it's unclear from the plan review alone whether the WebGPU compute path is wired in or parallel. Spend ~30 min auditing before committing to Phase 1 perf benchmark architecture.
- **Priority:** P1
- **Depends on:** None (can be verified standalone before Phase 1 work begins)

### NDI SDK licensing review before Phase 3 NDI input
- **What:** Research NewTek/Vizrt NDI redistribution agreement terms. Determine whether an MIT-licensed OpenScope binary can legally link the NDI SDK, and under what conditions.
- **Why:** NDI is not open source. Shipping an MIT binary that links NDI without clearing licensing may violate the SDK agreement and expose the project to legal risk. Raised by CEO review adversarial subagent as a Phase 3 blocker.
- **Pros:** De-risks Phase 3 before implementation effort starts. May discover NDI is ruled out — in which case, redirect Phase 3 effort (e.g., prioritize Spout for Win + skip NDI, or build a separate proprietary distribution path).
- **Cons:** Legal research is slow and may require a lawyer consult.
- **Context:** Phase 3 work. Surfaced by /plan-ceo-review adversarial review on 2026-04-19. Check current NDI SDK EULA at ndi.video; look at prior art (Chromatic App, OBS NDI plugin, other OSS tools that ship NDI support).
- **Priority:** P2
- **Depends on:** Phase 2 shipping (not blocking for current work)

### Browser WebGPU test infrastructure (Playwright-based)
- **What:** Build a Playwright or similar browser-test harness that exercises the WebGPU compute path end-to-end and asserts results against the CPU path within a documented tolerance.
- **Why:** Currently `packages/validation/src/perf/bench.ts:145` short-circuits WebGPU cells to `status:'skipped'` in Node. Vitest runs in Node only. Real CPU⇔GPU parity CI needs a browser runner. Codex's outside voice on the Phase 2 CEO plan flagged this gap — v2 of the plan pushed this to Phase 3 rather than fake it.
- **Pros:** Makes the WebGPU compute path actually testable. Closes a trust gap for library consumers ("does GPU give the same answers as CPU?"). Blocker for any CI-gated GPU claim.
- **Cons:** Non-trivial CI complexity (headless Chromium + WebGPU flag or a real GPU runner). Adds test runtime. Second browser (Firefox/Safari) needs separate infra.
- **Context:** Surfaced by Codex outside voice on 2026-04-20. Phase 2 ships a one-off manual sanity check in its place; real CI infra is this TODO.
- **Priority:** P1 (blocks Phase 3 monitor-app confidence)
- **Depends on:** Phase 2 parity gate landed

### Graticule module extraction (refactor)
- **What:** Extract a shared `Graticule` module from `packages/renderer/src/render-waveform.ts` / `render-parade.ts` / `render-histogram.ts`. Log-aware, range-aware, single source of truth for axis labels + gridlines + tick marks.
- **Why:** Phase 2 parity work adds log-axis support across multiple scopes; duplicated graticule code risks drift between them. Not blocking Phase 2 (inlining is fine for the initial parity ship) but is follow-up refactor debt.
- **Pros:** DRY. Easier to add new graticule styles (broadcast 7.5 IRE pedestal, etc.) once.
- **Cons:** Premature if only 3 scopes use it. Adds an abstraction layer.
- **Context:** Deferred from Phase 2 CEO review 2026-04-20 (v2). Revisit after Phase 2 lands; extract if Phase 3 adds a 4th consumer.
- **Priority:** P3
- **Depends on:** Phase 2 rendering parity shipped

### Code signing + notarization plan for Phase 3 distribution (was Phase 2)
- **What:** Set up Apple Developer account, establish code signing + notarization pipeline, configure hardened runtime profile, and document the release flow for macOS distribution of the Tauri-based OpenScope Monitor.
- **Why:** macOS won't let users run unsigned or un-notarized binaries outside dev. ScreenCaptureKit entitlements specifically require signed + notarized builds with hardened runtime. Monitor app cannot ship to users without this infrastructure. Surfaced by CEO review adversarial subagent.
- **Pros:** Unblocks monitor-app distribution. Windows equivalent (Authenticode signing) becomes later concern.
- **Cons:** ~$99/yr Apple Developer fee. Notarization pipeline adds CI complexity. First-time setup is non-trivial (~1 day).
- **Context:** Originally Phase 2 blocker 2026-04-19. Moved to Phase 3 on 2026-04-20 after Phase 2 pivoted to rendering parity. Monitor app is now Phase 3. Apple Developer account registration takes 24-48 hrs for individual. Tauri has documented macOS signing/notarization paths.
- **Priority:** P2 (Phase 3 blocker)
- **Depends on:** Phase 2 rendering parity shipping + decision to proceed with monitor app (see strategic-thesis TODO above)
