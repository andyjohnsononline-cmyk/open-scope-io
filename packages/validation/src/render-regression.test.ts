/**
 * Render regression tests.
 *
 * Compares Canvas2D scope renders against committed golden PNGs using
 * pixelmatch with a generous per-pixel threshold so darwin/linux
 * @napi-rs/canvas antialiasing drift doesn't flag false regressions. Real
 * regressions (geometry, missing passes, clear-on-top bugs) shift >5% of
 * pixels and still fail.
 *
 * Regenerate goldens: UPDATE_GOLDENS=1 pnpm test render-regression
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { createCpuPipeline, type ScopeResult } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import {
  renderWaveform,
  renderParade,
  renderVectorscope,
  renderHistogram,
  renderFalseColor,
  type RenderOptions,
} from '@openscope/renderer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import { createCanvas } from '@napi-rs/canvas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, './goldens/frames');
const TIF_PATH = resolve(FRAMES_DIR, 'isabella-no-lut.tif');
const GOLDENS_DIR = resolve(__dirname, './goldens/render');

const WIDTH = 480;
const HEIGHT = 270;

// pixelmatch threshold: 0.15 is relatively strict per-pixel (0=identical, 1=anything).
// Max allowed fraction of differing pixels, tuned for darwin/linux canvas drift.
const MAX_DIFF_FRACTION = 0.05;
const PIXELMATCH_THRESHOLD = 0.15;

let results: Map<string, ScopeResult>;
let frameData: { data: Uint8ClampedArray; width: number; height: number };

function createTestCanvas(): {
  ctx: CanvasRenderingContext2D;
  pixels: () => Uint8Array;
} {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    pixels: () => {
      const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
      return new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
    },
  };
}

function writeGolden(name: string, rgba: Uint8Array): void {
  mkdirSync(GOLDENS_DIR, { recursive: true });
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  png.data = Buffer.from(rgba);
  writeFileSync(join(GOLDENS_DIR, `${name}.png`), PNG.sync.write(png));
}

function readGolden(name: string): Uint8Array {
  const buf = readFileSync(join(GOLDENS_DIR, `${name}.png`));
  const png = PNG.sync.read(buf);
  if (png.width !== WIDTH || png.height !== HEIGHT) {
    throw new Error(
      `golden ${name}.png has unexpected dims ${png.width}x${png.height}, expected ${WIDTH}x${HEIGHT}`,
    );
  }
  return new Uint8Array(png.data);
}

function expectMatchesGolden(name: string, actual: Uint8Array): void {
  if (process.env.UPDATE_GOLDENS === '1') {
    writeGolden(name, actual);
    return;
  }
  const goldenPath = join(GOLDENS_DIR, `${name}.png`);
  if (!existsSync(goldenPath)) {
    throw new Error(
      `golden ${name}.png missing. Regenerate with: UPDATE_GOLDENS=1 pnpm test render-regression`,
    );
  }
  const expected = readGolden(name);
  const diff = new Uint8Array(WIDTH * HEIGHT * 4);
  const diffPixels = pixelmatch(expected, actual, diff, WIDTH, HEIGHT, {
    threshold: PIXELMATCH_THRESHOLD,
  });
  const fraction = diffPixels / (WIDTH * HEIGHT);
  expect(
    fraction,
    `render-regression ${name}: ${diffPixels} px differ (${(fraction * 100).toFixed(2)}%), ` +
      `threshold ${(MAX_DIFF_FRACTION * 100).toFixed(1)}%. ` +
      `If this is an intentional render change, update goldens with: ` +
      `UPDATE_GOLDENS=1 pnpm test render-regression`,
  ).toBeLessThanOrEqual(MAX_DIFF_FRACTION);
}

async function loadFrame() {
  const sharp = (await import('sharp')).default;
  const image = sharp(TIF_PATH);
  const metadata = await image.metadata();
  const buffer = await image.ensureAlpha().raw().toBuffer();
  return {
    data: new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    width: metadata.width!,
    height: metadata.height!,
  };
}

const HAS_TIF = existsSync(TIF_PATH);

describe.skipIf(!HAS_TIF)('rendering regression', () => {
  beforeAll(async () => {
    frameData = await loadFrame();
    const pipeline = createCpuPipeline();
    for (const scope of allScopes) pipeline.register(scope);
    results = await pipeline.analyze(frameData);
  });

  it('waveform linear renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderWaveform(ctx, results.get('waveform')!);
    expectMatchesGolden('waveform-linear', pixels());
  });

  it('waveform log renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderWaveform(ctx, results.get('waveform')!, { yAxisScale: 'log' });
    expectMatchesGolden('waveform-log', pixels());
  });

  it('waveform rgb renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderWaveform(ctx, results.get('rgbParade')!, { mode: 'rgb' });
    expectMatchesGolden('waveform-rgb', pixels());
  });

  it('parade linear renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderParade(ctx, results.get('rgbParade')!);
    expectMatchesGolden('parade-linear', pixels());
  });

  it('parade log renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderParade(ctx, results.get('rgbParade')!, { yAxisScale: 'log' });
    expectMatchesGolden('parade-log', pixels());
  });

  it('vectorscope renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderVectorscope(ctx, results.get('vectorscope')!);
    expectMatchesGolden('vectorscope', pixels());
  });

  it('histogram overlaid renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderHistogram(ctx, results.get('histogram')!);
    expectMatchesGolden('histogram-overlaid', pixels());
  });

  it('histogram stacked renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderHistogram(ctx, results.get('histogram')!, { layout: 'stacked' });
    expectMatchesGolden('histogram-stacked', pixels());
  });

  it('false color renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    const opts: RenderOptions = {
      sourcePixels: frameData.data,
      sourceWidth: frameData.width,
      sourceHeight: frameData.height,
    };
    renderFalseColor(ctx, results.get('falseColor')!, opts);
    expectMatchesGolden('false-color', pixels());
  });
});
