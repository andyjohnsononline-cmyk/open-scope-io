import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, './goldens/frames');
const TIF_PATH = resolve(FRAMES_DIR, 'isabella-no-lut.tif');

const WIDTH = 480;
const HEIGHT = 270;

let results: Map<string, ScopeResult>;
let frameData: { data: Uint8ClampedArray; width: number; height: number };

function hashPixels(pixels: Uint8ClampedArray): string {
  return createHash('sha256').update(pixels).digest('hex').slice(0, 16);
}

function createTestCanvas(): { ctx: CanvasRenderingContext2D; pixels: () => Uint8ClampedArray } {
  const { createCanvas } = require('@napi-rs/canvas');
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    pixels: () => {
      const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
      return imageData.data;
    },
  };
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
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('waveform log renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderWaveform(ctx, results.get('waveform')!, { yAxisScale: 'log' });
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('waveform rgb renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderWaveform(ctx, results.get('rgbParade')!, { mode: 'rgb' });
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('parade linear renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderParade(ctx, results.get('rgbParade')!);
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('parade log renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderParade(ctx, results.get('rgbParade')!, { yAxisScale: 'log' });
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('vectorscope renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderVectorscope(ctx, results.get('vectorscope')!);
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('histogram overlaid renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderHistogram(ctx, results.get('histogram')!);
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('histogram stacked renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    renderHistogram(ctx, results.get('histogram')!, { layout: 'stacked' });
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });

  it('false color renders consistently', () => {
    const { ctx, pixels } = createTestCanvas();
    const opts: RenderOptions = {
      sourcePixels: frameData.data,
      sourceWidth: frameData.width,
      sourceHeight: frameData.height,
    };
    renderFalseColor(ctx, results.get('falseColor')!, opts);
    const hash = hashPixels(pixels());
    expect(hash).toMatchSnapshot();
  });
});
