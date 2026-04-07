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
import {
  generateSolidColor,
  generateHorizontalGradient,
  generateChannelRamps,
  generateSMPTEBars,
  SMPTE_75_BARS,
  SMPTE_100_BARS,
  generateColorPatches,
  generatePLUGE,
  generateZonePatches,
  generateSkinToneTarget,
  generateHighSatPrimaries,
  generateNearBlackGradient,
  generateNearWhiteGradient,
  EBU_100_BARS,
} from '../../packages/validation/src/generators/index.js';
import type {
  GoldenReference,
  GoldenScopeData,
} from '../../packages/validation/src/goldens/loader.js';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GOLDENS_DIR = join(__dirname, '../../packages/validation/src/goldens');
const FRAMES_DIR = join(GOLDENS_DIR, 'frames');

// ── Main ─────────────────────────────────────────────────────────────────

const W = 256;
const H = 128;

interface TestFrame {
  name: string;
  description: string;
  generate: () => Uint8ClampedArray;
}

const testFrames: TestFrame[] = [
  { name: 'solid-black', description: 'Pure black (0,0,0)', generate: () => generateSolidColor(W, H, 0, 0, 0) },
  { name: 'solid-white', description: 'Pure white (255,255,255)', generate: () => generateSolidColor(W, H, 255, 255, 255) },
  { name: 'solid-mid-gray', description: '50% gray (128,128,128)', generate: () => generateSolidColor(W, H, 128, 128, 128) },
  { name: 'solid-red', description: 'Pure red (255,0,0)', generate: () => generateSolidColor(W, H, 255, 0, 0) },
  { name: 'solid-green', description: 'Pure green (0,255,0)', generate: () => generateSolidColor(W, H, 0, 255, 0) },
  { name: 'solid-blue', description: 'Pure blue (0,0,255)', generate: () => generateSolidColor(W, H, 0, 0, 255) },
  { name: 'horizontal-gradient', description: 'Horizontal black-to-white ramp', generate: () => generateHorizontalGradient(W, H) },
  { name: 'channel-ramps', description: 'R/G/B horizontal ramps stacked vertically', generate: () => generateChannelRamps(W, H) },
  { name: 'smpte-75', description: 'SMPTE RP 219 75% color bars', generate: () => generateSMPTEBars(W, H, SMPTE_75_BARS) },
  { name: 'smpte-100', description: 'SMPTE RP 219 100% color bars', generate: () => generateSMPTEBars(W, H, SMPTE_100_BARS) },
  { name: 'ebu-bars', description: 'EBU 100% color bars (8 bars including black)', generate: () => generateColorPatches(W, H, EBU_100_BARS) },
  { name: 'pluge-pulse', description: 'PLUGE near-black patches (0-20 IRE, 2-level steps)', generate: () => generatePLUGE(W, H) },
  { name: 'zone-patches', description: '11-step zone system (0 to 255 in ~25 steps)', generate: () => generateZonePatches(W, H) },
  { name: 'skin-tone-target', description: '6 skin tone patches across the diversity spectrum', generate: () => generateSkinToneTarget(W, H) },
  { name: 'high-sat-primaries', description: '100% saturated R/G/B/Y/M/C primaries and secondaries', generate: () => generateHighSatPrimaries(W, H) },
  { name: 'near-black-gradient', description: 'Fine gradient in 0-20 range (shadow detail)', generate: () => generateNearBlackGradient(W, H) },
  { name: 'near-white-gradient', description: 'Fine gradient in 235-255 range (highlight detail)', generate: () => generateNearWhiteGradient(W, H) },
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
