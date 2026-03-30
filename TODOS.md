# TODOs — OpenScope

## Design Debt

### WCAG contrast for muted labels
- **What:** Consider bumping muted text from `#6b6e76` to `#8b8e96` (~4.5:1 contrast against `#111214`) for strict WCAG AA compliance
- **Why:** Current 3.8:1 ratio passes for large text/UI components but fails AA for regular text. At 10-11px instrument labels this matches industry convention (Resolve uses similar muted labeling), but is technically non-compliant.
- **Pros:** Meets WCAG AA, more readable for users with mild vision impairment
- **Cons:** Changes DESIGN.md, labels become more prominent (compete more with trace data)
- **Context:** Design system decision. Review with actual scope rendering in place to see if brighter labels compete with trace data.
- **Depends on:** WebGL2 renderer implementation (need to see it running first)

### Appearance presets / theme system
- **What:** Build a theme/preset system for ScopeAppearance. Ship bundled presets ("resolve-like", "omniscope", "classic-broadcast") and let users create custom presets via JSON files.
- **Why:** Differentiator from proprietary tools. Let users customize their scope look. Community engagement.
- **Pros:** Unique open-source feature, professional customization, potential community contributions
- **Cons:** Adds complexity, needs UI for preset selection in the demo, JSON schema maintenance
- **Context:** Cross-model insight from /office-hours suggested making rendering appearance a versioned, testable artifact. ScopeAppearance interface is already designed to support this. Explicitly deferred from v1.
- **Depends on:** WebGL2 renderer + ScopeAppearance implementation

### ScopeDisplayBackend abstraction
- **What:** Extract a `ScopeDisplayBackend` interface so renderer consumers can swap WebGL2/Canvas 2D/future backends without touching app code.
- **Why:** Cleaner separation, enables headless testing with a mock backend.
- **Pros:** Better architecture, testability, future-proof
- **Cons:** Premature if only two backends exist. Adds indirection.
- **Context:** Deferred from CEO Review (via /autoplan). Consensus: correct idea, wrong time. Build the concrete backends first, extract the interface when a third consumer appears.
- **Depends on:** WebGL2 renderer + Canvas 2D fallback both stable

### Adoption metric (scope render time logging)
- **What:** Log render time per scope per frame to enable performance tracking and A/B comparison.
- **Why:** Without measurement, can't prove WebGL2 is faster or detect regressions.
- **Pros:** Data-driven perf optimization, CI perf regression detection
- **Cons:** Console noise, needs opt-in mechanism
- **Context:** Deferred from CEO Review (via /autoplan). Outside current plan's scope. Revisit after v1 WebGL2 renderer ships.
