# Design System — OpenScope

## Product Context
- **What this is:** Open source composable video scope engine (library + CLI + demo app)
- **Who it's for:** Developers embedding scope analysis in their tools, colorists and post-production engineers using the demo/CLI directly
- **Space/industry:** Video post-production (DaVinci Resolve, Nobe OmniScope, ScopeBox) + developer tooling (npm libraries, CLI tools)
- **Project type:** Library + demo web app + CLI tool + documentation site

## Aesthetic Direction
- **Direction:** Industrial/Instrument
- **Decoration level:** Minimal — typography and scope data do all the work. No gradients, no blobs, no decorative elements. The scope traces ARE the decoration.
- **Mood:** Precision measurement tool that happens to live in a browser. Dark, technical, confident. Think oscilloscope panel, not SaaS dashboard.
- **Reference sites:** timeinpixels.com/nobe-omniscope, scopebox.com, vitest.dev (dev tool reference)

## Typography
- **Display/Hero:** Geist (700) — Sharp geometric sans with technical precision. Not warm, not friendly. Exact.
- **Body:** Geist (400/500) — Same family for extreme cohesion. Dense technical product benefits from one type family.
- **UI/Labels:** Geist (500) at 11-12px, uppercase with 0.5-1.5px letter-spacing for instrument labeling
- **Data/Tables:** Geist Mono (400) — Tabular figures via `font-variant-numeric: tabular-nums`, ligatures off. Workhorse for scope values, CLI output, measurements.
- **Code:** Geist Mono (400)
- **Loading:** CDN via `https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/`
- **Scale:**
  - 48px — Display (hero headlines)
  - 32px — Heading (page section titles)
  - 20px — Section (feature headings)
  - 14px — Subhead (subsection titles)
  - 13px — Body (default text)
  - 12px — Small (secondary information)
  - 11px — Label (instrument labels, eyebrows)
  - 10px — Micro (panel labels, scope overlays)

## Color
- **Approach:** Restrained — one accent + neutrals. Color is rare and meaningful.
- **Background:** `#08090a` — Near-black, slightly cool. The darkroom.
- **Surface:** `#111214` — Panels, cards, code blocks. One step above background.
- **Border:** `#1e2024` — Subtle separation between panels.
- **Text primary:** `#e8e8eb` — Slightly warm white for readability.
- **Text muted:** `#6b6e76` — Instrument labeling. Present but not competing.
- **Accent:** `#00e599` — Phosphor green. Direct reference to CRT oscilloscope traces. The signature color.
- **Accent dim:** `rgba(0, 229, 153, 0.2)` — Subtle highlights, active states, hover backgrounds.
- **Accent subtle:** `rgba(0, 229, 153, 0.08)` — Table row hover, barely-there presence.
- **Semantic:**
  - Success: `#00e599` (accent doubles as success)
  - Warning: `#ffaa33`
  - Danger: `#ff4d4d`
  - Info: `#5599ff`
- **Dark mode:** This IS dark mode. No light theme. Scope tools are used in dark environments. Period.

### Syntax Highlighting (code blocks)
- Keywords: `#00e599` (accent)
- Strings: `#ffaa33` (warning/warm)
- Functions: `#5599ff` (info/cool)
- Comments: `#6b6e76` (muted)
- Numbers: `#ff8866`

## Spacing
- **Base unit:** 4px
- **Density:** Compact — scope tools are information-dense by nature. Density is a feature.
- **Scale:** 2px(gap) 4px(micro) 8px(sm) 12px(md) 16px(lg) 24px(xl) 32px(2xl) 48px(3xl) 64px(4xl)
- **Panel gaps:** 2px between scope panels (matches existing demo)
- **Internal padding:** 8px on small elements (buttons, inputs), 16px on cards, 24px on sections

## Layout
- **Approach:** Grid-disciplined — strict panel grid for the demo app, clean single-column for docs, instrument-style hero for marketing
- **Grid:** Demo app: 3x2 equal panels. Docs: single column, max-width constrained.
- **Max content width:** 1120px
- **Border radius:** sm:4px (buttons, inputs), md:6px (cards, code blocks), lg:8px (large panels). No `full/9999px` pill shapes.

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** All transitions use `ease` or `ease-out`
- **Duration:** micro:100ms (hover, focus) short:150ms (button press, toggle) medium:200ms (panel transition). No entrance animations. Scopes update in real-time, that IS the motion.
- **Scope rendering:** 60fps requestAnimationFrame loop for live video. No easing, no interpolation. Raw data.

## Anti-Patterns (never use)
- Purple/violet gradients
- Colored circle icons in feature grids
- Centered-everything layouts
- Uniform bubbly border-radius
- Gradient buttons
- Generic hero images
- Light themes
- Display fonts that aren't Geist
- Decorative elements that don't convey data

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-27 | Initial design system created | Created by /design-consultation with competitive research (OmniScope, ScopeBox, Vitest) |
| 2026-03-27 | Phosphor green (#00e599) as sole accent | CRT oscilloscope reference, distinctive in both scope tool and dev tool categories |
| 2026-03-27 | Single type family (Geist + Geist Mono) | Extreme cohesion for a dense technical product. Marketing can feel clinical, but that's the brand. |
| 2026-03-27 | No light theme | Scope tools are used in dark environments (grading suites, edit bays). A light theme would be unused and unmaintained. |
| 2026-03-27 | Compact 4px base spacing | Matches professional scope tool density. Information density is a feature for this audience. |
