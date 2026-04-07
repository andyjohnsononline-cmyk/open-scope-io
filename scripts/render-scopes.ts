/**
 * Headless scope renderer — renders all 5 scopes for each Isabella frame
 * to PNG using @napi-rs/canvas and the Canvas 2D renderers.
 *
 * Usage: tsx scripts/render-scopes.ts
 */
import { createCanvas } from '@napi-rs/canvas';
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
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FRAMES_DIR = resolve(
  __dirname,
  '../packages/validation/src/goldens/frames',
);

const FRAMES = [
  { name: 'isabella-no-lut', file: 'isabella-no-lut.tif' },
  { name: 'isabella-aces13-rec709', file: 'isabella-aces13-rec709.tif' },
  { name: 'isabella-aces13-hdr-p3', file: 'isabella-aces13-hdr-p3.tif' },
];

const SCOPE_RENDERERS: Array<{
  id: string;
  scopeId: string;
  render: (ctx: CanvasRenderingContext2D, result: ScopeResult, options?: RenderOptions) => void;
  needsSource?: boolean;
  extraOptions?: Partial<RenderOptions>;
}> = [
  { id: 'waveform', scopeId: 'waveform', render: renderWaveform },
  { id: 'waveform-log', scopeId: 'waveform', render: renderWaveform, extraOptions: { yAxisScale: 'log' } },
  { id: 'waveform-rgb', scopeId: 'rgbParade', render: renderWaveform, extraOptions: { mode: 'rgb' } },
  { id: 'waveform-rgb-log', scopeId: 'rgbParade', render: renderWaveform, extraOptions: { mode: 'rgb', yAxisScale: 'log' } },
  { id: 'parade', scopeId: 'rgbParade', render: renderParade },
  { id: 'parade-log', scopeId: 'rgbParade', render: renderParade, extraOptions: { yAxisScale: 'log' } },
  { id: 'vectorscope', scopeId: 'vectorscope', render: renderVectorscope },
  { id: 'histogram', scopeId: 'histogram', render: renderHistogram },
  { id: 'histogram-stacked', scopeId: 'histogram', render: renderHistogram, extraOptions: { layout: 'stacked' } },
  { id: 'false-color', scopeId: 'falseColor', render: renderFalseColor, needsSource: true },
];

const WIDTH = 960;
const HEIGHT = 540;

async function loadImage(filePath: string) {
  const sharp = (await import('sharp')).default;
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  const buffer = await image.ensureAlpha().raw().toBuffer();
  return {
    data: new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    width,
    height,
  };
}

async function main() {
  const pipeline = createCpuPipeline();
  for (const scope of allScopes) {
    pipeline.register(scope);
  }

  const outBase = resolve(__dirname, '../renders');

  for (const frame of FRAMES) {
    const framePath = join(FRAMES_DIR, frame.file);
    console.log(`Loading ${frame.name}...`);
    const { data, width, height } = await loadImage(framePath);

    console.log(`  Analyzing (${width}x${height})...`);
    const results = await pipeline.analyze({ data, width, height });

    const outDir = join(outBase, frame.name);
    mkdirSync(outDir, { recursive: true });

    for (const renderer of SCOPE_RENDERERS) {
      const result = results.get(renderer.scopeId);
      if (!result) {
        console.warn(`  Skipping ${renderer.id}: no result for ${renderer.scopeId}`);
        continue;
      }

      const canvas = createCanvas(WIDTH, HEIGHT);
      const ctx = canvas.getContext('2d');

      const options: RenderOptions = {
        background: '#111214',
        ...renderer.extraOptions,
      };

      if (renderer.needsSource) {
        options.sourcePixels = data;
        options.sourceWidth = width;
        options.sourceHeight = height;
      }

      renderer.render(ctx as unknown as CanvasRenderingContext2D, result, options);

      const pngBuffer = canvas.toBuffer('image/png');
      const outPath = join(outDir, `${renderer.id}.png`);
      writeFileSync(outPath, pngBuffer);
      console.log(`  Rendered ${renderer.id} → ${outPath}`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
