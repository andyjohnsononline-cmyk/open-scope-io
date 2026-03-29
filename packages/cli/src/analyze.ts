import { createCpuPipeline, type ScopeResult } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import { loadImage, loadVideoFrames } from './frame-loader.js';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';

export interface AnalyzeOptions {
  scopes: string[];
  format: string;
  compact: boolean;
  sampleRate: number;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.bmp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.mxf', '.m4v']);

export async function analyze(file: string, opts: AnalyzeOptions): Promise<void> {
  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const pipeline = createCpuPipeline();
  for (const scope of allScopes) {
    pipeline.register(scope);
  }

  const ext = extname(file).toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const isVideo = VIDEO_EXTS.has(ext);

  if (!isImage && !isVideo) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const output: {
    version: string;
    source: string;
    colorSpace: string;
    frames: Array<{
      index: number;
      width: number;
      height: number;
      scopes: Record<string, unknown>;
    }>;
  } = {
    version: '1.0',
    source: file,
    colorSpace: 'sRGB',
    frames: [],
  };

  if (isImage) {
    const { data, width, height } = await loadImage(file);
    const results = await pipeline.analyze(
      { data, width, height },
      opts.scopes,
    );
    output.frames.push(formatFrame(0, width, height, results, opts.compact));
  } else {
    let frameIndex = 0;
    for await (const frame of loadVideoFrames(file, opts.sampleRate)) {
      const results = await pipeline.analyze(
        { data: frame.data, width: frame.width, height: frame.height },
        opts.scopes,
      );
      output.frames.push(
        formatFrame(frameIndex, frame.width, frame.height, results, opts.compact),
      );
      frameIndex++;
    }
  }

  if (output.frames.length === 0) {
    throw new Error('No frames analyzed');
  }

  console.log(JSON.stringify(output, null, 2));
  const partial = output.frames.some(
    (f) => Object.keys(f.scopes).length < opts.scopes.length,
  );
  process.exitCode = partial ? 1 : 0;
}

function formatFrame(
  index: number,
  width: number,
  height: number,
  results: Map<string, ScopeResult>,
  compact: boolean,
): {
  index: number;
  width: number;
  height: number;
  scopes: Record<string, unknown>;
} {
  const scopes: Record<string, unknown> = {};

  for (const [id, result] of results) {
    if (compact) {
      scopes[id] = {
        dataShape: result.shape,
        ...result.metadata,
      };
    } else {
      scopes[id] = {
        dataShape: result.shape,
        data: Array.from(result.data),
        ...result.metadata,
      };
    }
  }

  return { index, width, height, scopes };
}
