#!/usr/bin/env node
/**
 * OpenScope Autoresearch — Golden Reference Generator
 *
 * Generates synthetic test frames, analyzes them with the CPU pipeline,
 * and saves the results as golden reference JSON files.
 *
 * Usage:
 *   node scripts/autoresearch/prepare.ts    (via tsx loader)
 *   pnpm run prepare:goldens               (from repo root)
 *
 * For Resolve-exported frames, place PNGs in packages/validation/src/goldens/frames/
 * then re-run this script — it will compute goldens for those too.
 *
 * DO NOT MODIFY — this file is fixed infrastructure for the autoresearch loop.
 */

import { createCpuPipeline, type ScopeResult } from '../../packages/core/dist/index.js';
import { allScopes } from '../../packages/shaders/dist/index.js';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GOLDENS_DIR = join(__dirname, '../../packages/validation/src/goldens');
const FRAMES_DIR = join(GOLDENS_DIR, 'frames');

// BT.709 luma for golden computation
function bt709Luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ── Generators (self-contained, no imports from packages) ──────────────

function solidColor(w: number, h: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return data;
}

function horizontalGradient(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

function channelRamps(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  const thirdH = Math.floor(h / 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255);
      const i = (y * w + x) * 4;
      if (y < thirdH) {
        data[i] = v; data[i + 1] = 0; data[i + 2] = 0;
      } else if (y < thirdH * 2) {
        data[i] = 0; data[i + 1] = v; data[i + 2] = 0;
      } else {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = v;
      }
      data[i + 3] = 255;
    }
  }
  return data;
}

interface SMPTEBar { label: string; r: number; g: number; b: number }

const SMPTE_75: SMPTEBar[] = [
  { label: '75% White', r: 180, g: 180, b: 180 },
  { label: '75% Yellow', r: 180, g: 180, b: 16 },
  { label: '75% Cyan', r: 16, g: 180, b: 180 },
  { label: '75% Green', r: 16, g: 180, b: 16 },
  { label: '75% Magenta', r: 180, g: 16, b: 180 },
  { label: '75% Red', r: 180, g: 16, b: 16 },
  { label: '75% Blue', r: 16, g: 16, b: 180 },
];

const SMPTE_100: SMPTEBar[] = [
  { label: '100% White', r: 235, g: 235, b: 235 },
  { label: '100% Yellow', r: 235, g: 235, b: 16 },
  { label: '100% Cyan', r: 16, g: 235, b: 235 },
  { label: '100% Green', r: 16, g: 235, b: 16 },
  { label: '100% Magenta', r: 235, g: 16, b: 235 },
  { label: '100% Red', r: 235, g: 16, b: 16 },
  { label: '100% Blue', r: 16, g: 16, b: 235 },
];

function smptePattern(w: number, h: number, bars: SMPTEBar[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const barIdx = Math.min(Math.floor((x / w) * bars.length), bars.length - 1);
      const bar = bars[barIdx];
      const i = (y * w + x) * 4;
      data[i] = bar.r; data[i + 1] = bar.g; data[i + 2] = bar.b; data[i + 3] = 255;
    }
  }
  return data;
}

function ebuBars(w: number, h: number): Uint8ClampedArray {
  const bars: SMPTEBar[] = [
    { label: 'White', r: 235, g: 235, b: 235 },
    { label: 'Yellow', r: 235, g: 235, b: 16 },
    { label: 'Cyan', r: 16, g: 235, b: 235 },
    { label: 'Green', r: 16, g: 235, b: 16 },
    { label: 'Magenta', r: 235, g: 16, b: 235 },
    { label: 'Red', r: 235, g: 16, b: 16 },
    { label: 'Blue', r: 16, g: 16, b: 235 },
    { label: 'Black', r: 16, g: 16, b: 16 },
  ];
  return smptePattern(w, h, bars);
}

function plugePulse(w: number, h: number): Uint8ClampedArray {
  const levels = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const data = new Uint8ClampedArray(w * h * 4);
  const patchWidth = Math.floor(w / levels.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = Math.min(Math.floor(x / patchWidth), levels.length - 1);
      const v = levels[idx];
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

function zonePatches(w: number, h: number): Uint8ClampedArray {
  const zones = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255];
  const data = new Uint8ClampedArray(w * h * 4);
  const patchWidth = Math.floor(w / zones.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = Math.min(Math.floor(x / patchWidth), zones.length - 1);
      const v = zones[idx];
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

function colorPatches(w: number, h: number, patches: {r: number; g: number; b: number}[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  const count = patches.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = Math.min(Math.floor((x / w) * count), count - 1);
      const p = patches[idx];
      const i = (y * w + x) * 4;
      data[i] = p.r; data[i + 1] = p.g; data[i + 2] = p.b; data[i + 3] = 255;
    }
  }
  return data;
}

function skinToneTarget(w: number, h: number): Uint8ClampedArray {
  return colorPatches(w, h, [
    { r: 232, g: 190, b: 172 },
    { r: 215, g: 168, b: 140 },
    { r: 188, g: 143, b: 113 },
    { r: 156, g: 110, b: 80 },
    { r: 107, g: 72, b: 49 },
    { r: 66, g: 43, b: 30 },
  ]);
}

function highSatPrimaries(w: number, h: number): Uint8ClampedArray {
  return colorPatches(w, h, [
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 255, g: 0, b: 255 },
    { r: 0, g: 255, b: 255 },
  ]);
}

function nearBlackGradient(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 20);
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

function nearWhiteGradient(w: number, h: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round(235 + (x / (w - 1)) * 20);
      const i = (y * w + x) * 4;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return data;
}

// ── Golden reference schema ──────────────────────────────────────────────

interface GoldenScopeData {
  scopeId: string;
  shape: [number, number];
  data: number[];
  metadata: Record<string, number | boolean | string>;
}

interface GoldenReference {
  version: '1.0';
  name: string;
  description: string;
  frameWidth: number;
  frameHeight: number;
  colorSpace: 'sRGB';
  source: 'synthetic' | 'resolve-export';
  generatedAt: string;
  scopes: Record<string, GoldenScopeData>;
}

// ── Main ─────────────────────────────────────────────────────────────────

const W = 256;
const H = 128;

interface TestFrame {
  name: string;
  description: string;
  generate: () => Uint8ClampedArray;
}

const testFrames: TestFrame[] = [
  { name: 'solid-black', description: 'Pure black (0,0,0)', generate: () => solidColor(W, H, 0, 0, 0) },
  { name: 'solid-white', description: 'Pure white (255,255,255)', generate: () => solidColor(W, H, 255, 255, 255) },
  { name: 'solid-mid-gray', description: '50% gray (128,128,128)', generate: () => solidColor(W, H, 128, 128, 128) },
  { name: 'solid-red', description: 'Pure red (255,0,0)', generate: () => solidColor(W, H, 255, 0, 0) },
  { name: 'solid-green', description: 'Pure green (0,255,0)', generate: () => solidColor(W, H, 0, 255, 0) },
  { name: 'solid-blue', description: 'Pure blue (0,0,255)', generate: () => solidColor(W, H, 0, 0, 255) },
  { name: 'horizontal-gradient', description: 'Horizontal black-to-white ramp', generate: () => horizontalGradient(W, H) },
  { name: 'channel-ramps', description: 'R/G/B horizontal ramps stacked vertically', generate: () => channelRamps(W, H) },
  { name: 'smpte-75', description: 'SMPTE RP 219 75% color bars', generate: () => smptePattern(W, H, SMPTE_75) },
  { name: 'smpte-100', description: 'SMPTE RP 219 100% color bars', generate: () => smptePattern(W, H, SMPTE_100) },
  { name: 'ebu-bars', description: 'EBU 100% color bars (8 bars including black)', generate: () => ebuBars(W, H) },
  { name: 'pluge-pulse', description: 'PLUGE near-black patches (0-20 IRE, 2-level steps)', generate: () => plugePulse(W, H) },
  { name: 'zone-patches', description: '11-step zone system (0 to 255 in ~25 steps)', generate: () => zonePatches(W, H) },
  { name: 'skin-tone-target', description: '6 skin tone patches across the diversity spectrum', generate: () => skinToneTarget(W, H) },
  { name: 'high-sat-primaries', description: '100% saturated R/G/B/Y/M/C primaries and secondaries', generate: () => highSatPrimaries(W, H) },
  { name: 'near-black-gradient', description: 'Fine gradient in 0-20 range (shadow detail)', generate: () => nearBlackGradient(W, H) },
  { name: 'near-white-gradient', description: 'Fine gradient in 235-255 range (highlight detail)', generate: () => nearWhiteGradient(W, H) },
];

async function main() {
  mkdirSync(GOLDENS_DIR, { recursive: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const pipeline = createCpuPipeline();
  for (const scope of allScopes) {
    pipeline.register(scope);
  }

  console.log('OpenScope Autoresearch — Golden Reference Generator');
  console.log('===================================================');
  console.log(`Output: ${GOLDENS_DIR}`);
  console.log(`Frame size: ${W}x${H}`);
  console.log(`Scopes: ${allScopes.map(s => s.id).join(', ')}`);
  console.log();

  // Generate goldens for synthetic test frames
  let count = 0;
  for (const frame of testFrames) {
    const pixels = frame.generate();
    const results = await pipeline.analyze({ data: pixels, width: W, height: H });

    const golden: GoldenReference = {
      version: '1.0',
      name: frame.name,
      description: frame.description,
      frameWidth: W,
      frameHeight: H,
      colorSpace: 'sRGB',
      source: 'synthetic',
      generatedAt: new Date().toISOString(),
      scopes: {},
    };

    for (const [scopeId, result] of results) {
      golden.scopes[scopeId] = {
        scopeId: result.scopeId,
        shape: result.shape,
        data: Array.from(result.data),
        metadata: result.metadata,
      };
    }

    const outPath = join(GOLDENS_DIR, `${frame.name}.golden.json`);
    writeFileSync(outPath, JSON.stringify(golden, null, 2));
    console.log(`  [synthetic] ${frame.name} → ${basename(outPath)}`);
    count++;
  }

  // Process any Resolve-exported frames in the frames/ directory
  if (existsSync(FRAMES_DIR)) {
    const framePngs = readdirSync(FRAMES_DIR).filter(f => /\.(png|tiff?|jpg|jpeg)$/i.test(f));
    if (framePngs.length > 0) {
      console.log();
      console.log(`Found ${framePngs.length} Resolve-exported frame(s) in ${FRAMES_DIR}`);

      for (const framePng of framePngs) {
        try {
          const sharp = (await import('sharp')).default;
          const filePath = join(FRAMES_DIR, framePng);
          const image = sharp(filePath);
          const meta = await image.metadata();
          const w = meta.width!;
          const h = meta.height!;
          const buffer = await image.ensureAlpha().raw().toBuffer();
          const pixels = new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength);

          const results = await pipeline.analyze({ data: pixels, width: w, height: h });
          const name = framePng.replace(/\.[^.]+$/, '');

          const golden: GoldenReference = {
            version: '1.0',
            name,
            description: `Resolve-exported frame: ${framePng}`,
            frameWidth: w,
            frameHeight: h,
            colorSpace: 'sRGB',
            source: 'resolve-export',
            generatedAt: new Date().toISOString(),
            scopes: {},
          };

          for (const [scopeId, result] of results) {
            golden.scopes[scopeId] = {
              scopeId: result.scopeId,
              shape: result.shape,
              data: Array.from(result.data),
              metadata: result.metadata,
            };
          }

          const outPath = join(GOLDENS_DIR, `${name}.golden.json`);
          writeFileSync(outPath, JSON.stringify(golden, null, 2));
          console.log(`  [resolve] ${framePng} → ${basename(outPath)}`);
          count++;
        } catch (err) {
          console.error(`  [error] Failed to process ${framePng}: ${err}`);
        }
      }
    }
  }

  console.log();
  console.log(`Done. Generated ${count} golden reference(s).`);
  console.log();
  console.log('To add Resolve-exported frames:');
  console.log(`  1. Place PNG/TIFF files in ${FRAMES_DIR}`);
  console.log('  2. Re-run this script');
  console.log('  3. Golden references will be computed from pixel data');

  pipeline.destroy();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
