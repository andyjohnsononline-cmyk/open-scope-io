# Contributing to OpenScope

## How to Add a New Scope Type

Adding a scope type is the primary way to extend OpenScope. Each scope is a self-contained module that implements the `ScopePlugin` interface.

### Step 1: Create your scope file

Create a new file in `packages/shaders/src/`, e.g. `my-scope.ts`:

```typescript
import type { ScopePlugin, ScopeResult } from '@openscope/core';

const BINS = 256;

// GPU path: WGSL compute shader
// Must use this exact bind group convention:
//   @group(0) @binding(0) var inputTexture: texture_2d<f32>;
//   @group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;
export const myScopeShader = /* wgsl */ `
@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<atomic<u32>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(inputTexture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(inputTexture, vec2u(gid.x, gid.y), 0);

  // Your analysis logic here — write results to output buffer using atomicAdd
  let bin = u32(clamp(pixel.r * 255.0, 0.0, 255.0));
  atomicAdd(&output[bin], 1u);
}
`;

// CPU path: pure TypeScript (required for CLI / Node.js)
function analyzeCpu(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ScopeResult {
  const data = new Uint32Array(BINS);

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    // Your analysis logic here
    data[r]++;
  }

  return {
    scopeId: 'myScope',
    data,
    shape: [1, BINS],
    metadata: {
      // Your computed metadata
      peakBin: findPeak(data),
    },
  };
}

function findPeak(data: Uint32Array): number {
  let max = 0, peak = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] > max) { max = data[i]; peak = i; }
  }
  return peak;
}

// The plugin object
export const myScope: ScopePlugin = {
  id: 'myScope',
  name: 'My Custom Scope',
  shader: myScopeShader,

  getBufferSize(_width: number, _height: number): number {
    return BINS; // Size in u32 elements
  },

  parseResult(data: Uint32Array, _width: number, _height: number): ScopeResult {
    return {
      scopeId: 'myScope',
      data,
      shape: [1, BINS],
      metadata: { peakBin: findPeak(data) },
    };
  },

  analyzeCpu,
};
```

### Step 2: Register it

```typescript
import { createPipeline } from '@openscope/core';
import { myScope } from './my-scope';

const pipeline = await createPipeline();
pipeline.register(myScope);
```

### Step 3: Add a renderer (optional)

If you want a visual representation, register a custom renderer:

```typescript
import { ScopeRenderer } from '@openscope/renderer';
import type { ScopeResult } from '@openscope/core';

const renderer = new ScopeRenderer();

renderer.registerRenderer('myScope', (ctx, result, options) => {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);

  // Draw your visualization using result.data and result.metadata
});
```

### Key Rules

1. **Shader convention**: All shaders must use the standard bind group layout — `texture_2d<f32>` at binding 0, `array<atomic<u32>>` storage buffer at binding 1.

2. **CPU parity**: Implement `analyzeCpu` for CLI/Node.js compatibility. The CPU and GPU paths should produce equivalent results.

3. **Workgroup size**: Use `@workgroup_size(16, 16)` and guard against out-of-bounds with the dimensions check.

4. **Buffer size**: `getBufferSize()` returns the number of `u32` elements (not bytes).

5. **Metadata**: Include meaningful computed metadata in the `ScopeResult` — this is what the CLI `--compact` flag outputs.

## Development Setup

```bash
pnpm install
pnpm test          # Run tests
pnpm dev           # Start demo app
pnpm build         # Build all packages
```

## Testing

Write tests alongside your scope in `packages/shaders/src/`:

```typescript
import { describe, it, expect } from 'vitest';
import { myScope } from './my-scope';

describe('myScope', () => {
  it('analyzes a solid color image', () => {
    const pixels = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    const result = myScope.analyzeCpu!(pixels, 16, 16);
    expect(result.scopeId).toBe('myScope');
    expect(result.metadata.peakBin).toBe(128);
  });
});
```

Run with `pnpm test`.
