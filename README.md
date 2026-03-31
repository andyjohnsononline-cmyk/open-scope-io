# OpenScope

Open source composable video scope engine. Waveform, vectorscope, histogram, RGB parade, false color — as a library you can embed anywhere.

**Not another scope app.** OpenScope is the engine that scope apps are built on. The plugin architecture makes adding new scope types trivial: write a WGSL compute shader + TypeScript module, register it, done.

## Features

- **5 built-in scopes**: Luma Waveform, RGB Parade, Vectorscope, Histogram, False Color
- **WebGPU compute shaders** for GPU-accelerated analysis in the browser
- **WebGL2 display renderer** with additive blending, Gaussian blur, log intensity mapping, and graticule overlays — matches DaVinci Resolve visual quality
- **CPU fallback** for Node.js CLI and headless/agentic workflows
- **Plugin system** — add custom scope types (EL Zones, skin tone isolation, etc.)
- **Agentic CLI** — `openscope analyze frame.png --format json` for AI agent pipelines
- **MIT licensed** — embed it anywhere

## Quick Start

```bash
npm install openscope
```

### Browser (10 lines to your first waveform)

```typescript
import { createPipeline, waveform, ScopeRenderer } from 'openscope';

const pipeline = await createPipeline();
pipeline.register(waveform);

const renderer = new ScopeRenderer();
const canvas = document.querySelector('canvas')!;
const ctx = canvas.getContext('2d')!;

const video = document.querySelector('video')!;
const bitmap = await createImageBitmap(video);
const results = await pipeline.analyze(bitmap);

renderer.render(ctx, results.get('waveform')!);
```

### CLI / Agentic

```bash
npx @openscope/cli analyze photo.png --scopes waveform,histogram --compact
```

```json
{
  "version": "1.0",
  "source": "photo.png",
  "colorSpace": "sRGB",
  "frames": [{
    "index": 0,
    "width": 1920,
    "height": 1080,
    "scopes": {
      "waveform": {
        "dataShape": [1920, 256],
        "minIre": 3.2,
        "maxIre": 97.8,
        "meanIre": 42.1,
        "clippingShadows": false,
        "clippingHighlights": false
      },
      "histogram": {
        "dataShape": [4, 256],
        "mode": 128,
        "median": 122
      }
    }
  }]
}
```

### Node.js (CPU pipeline)

```typescript
import { createCpuPipeline } from '@openscope/core';
import { waveform, histogram } from '@openscope/shaders';

const pipeline = createCpuPipeline();
pipeline.register(waveform);
pipeline.register(histogram);

// pixels: Uint8ClampedArray from sharp, canvas, or any source
const results = await pipeline.analyze({ data: pixels, width: 1920, height: 1080 });

const wfResult = results.get('waveform')!;
console.log(`IRE range: ${wfResult.metadata.minIre} - ${wfResult.metadata.maxIre}`);
```

## Packages

| Package | Description |
|---------|-------------|
| `openscope` | Meta-package — re-exports everything |
| `@openscope/core` | Plugin registry, pipeline, types |
| `@openscope/shaders` | Built-in scope implementations (GPU + CPU) |
| `@openscope/renderer` | WebGL2 + Canvas 2D scope visualizations |
| `@openscope/cli` | CLI binary for headless analysis |

## Architecture

```
┌─────────────────────────────────────────────┐
│              Applications                    │
│  Browser Demo │ CLI Tool │ Third-party Embed │
├──────────────────────────────────────────────┤
│            @openscope/renderer               │
│   WebGL2 + Canvas 2D scope visualizations    │
├──────────────────────────────────────────────┤
│              @openscope/core                 │
│     Plugin registry + pipeline orchestration │
├──────────────────────────────────────────────┤
│            @openscope/shaders                │
│    WGSL compute shaders + CPU reference      │
│  Waveform │ Parade │ Vectorscope │ ...       │
└──────────────────────────────────────────────┘
```

## Built-in Scopes

| Scope | ID | Description | Metadata |
|-------|-----|-------------|----------|
| Luma Waveform | `waveform` | Luminance distribution per column | minIre, maxIre, meanIre, clipping |
| RGB Parade | `rgbParade` | Per-channel waveforms side by side | rMin/rMax, gMin/gMax, bMin/bMax |
| Vectorscope | `vectorscope` | Chrominance (Cb/Cr) distribution | saturationPeak, saturationMean, skinToneDeviation |
| Histogram | `histogram` | R/G/B/Luma bin counts | mode, median |
| False Color | `falseColor` | IRE zone distribution | percentBelow16Ire, percentAbove90Ire, percentInRange |

## Development

```bash
# Install dependencies
pnpm install

# Run demo app
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build
```

## Color Science

v1 assumes sRGB / Rec.709 input with BT.709 luma coefficients (0.2126 R + 0.7152 G + 0.0722 B). OCIO integration for ACES / Rec.2020 / DCI-P3 is planned for v2.

## Design System

See [DESIGN.md](DESIGN.md) for visual/UI guidelines (colors, typography, spacing).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a new scope type.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Roadmap

See [TODOS.md](TODOS.md) for planned features and design debt.

## License

MIT
