/**
 * TIFF → PNG sidecar baker.
 *
 * Reads .tif frames from packages/validation/src/goldens/frames/ and writes
 * .png sidecars next to them. The scrubber harness and perf bench consume
 * PNGs (the compute pipeline is rgba8unorm, so no precision loss for scope
 * inputs).
 *
 * Usage: pnpm tsx scripts/bake-pngs.ts
 */
import sharp from 'sharp';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FRAMES_DIR = resolve(
  __dirname,
  '../packages/validation/src/goldens/frames',
);

interface BakeResult {
  source: string;
  output: string;
  skipped: boolean;
  width: number;
  height: number;
}

async function bakeFrame(tifPath: string): Promise<BakeResult> {
  const pngPath = tifPath.replace(/\.tif$/i, '.png');
  const source = basename(tifPath);
  const output = basename(pngPath);

  if (existsSync(pngPath) && statSync(pngPath).mtimeMs >= statSync(tifPath).mtimeMs) {
    const meta = await sharp(pngPath).metadata();
    return {
      source,
      output,
      skipped: true,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  }

  const image = sharp(tifPath);
  const meta = await image.metadata();
  await image
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toFile(pngPath);

  return {
    source,
    output,
    skipped: false,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

async function main() {
  if (!existsSync(FRAMES_DIR)) {
    console.error(`Frames directory not found: ${FRAMES_DIR}`);
    process.exit(1);
  }

  const tifs = readdirSync(FRAMES_DIR)
    .filter((f) => extname(f).toLowerCase() === '.tif')
    .map((f) => join(FRAMES_DIR, f));

  if (tifs.length === 0) {
    console.log('No .tif files found. Nothing to bake.');
    return;
  }

  console.log(`Baking ${tifs.length} TIFF${tifs.length === 1 ? '' : 's'} → PNG...`);
  for (const tif of tifs) {
    const res = await bakeFrame(tif);
    const tag = res.skipped ? 'skip' : 'bake';
    console.log(`  [${tag}] ${res.source} → ${res.output} (${res.width}x${res.height})`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
