import { spawn } from 'node:child_process';

export interface FrameData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Load an image file using sharp and return raw RGBA pixels.
 */
export async function loadImage(filePath: string): Promise<FrameData> {
  // Dynamic import so sharp is only loaded when needed
  const sharp = (await import('sharp')).default;
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const buffer = await image
    .ensureAlpha()
    .raw()
    .toBuffer();

  return {
    data: new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    width,
    height,
  };
}

/**
 * Extract frames from a video file using ffmpeg.
 * Yields raw RGBA frames, one every `sampleRate` frames.
 */
export async function* loadVideoFrames(
  filePath: string,
  sampleRate: number,
): AsyncGenerator<FrameData> {
  // First, get video dimensions
  const probeInfo = await probeVideo(filePath);

  const selectFilter =
    sampleRate > 1 ? `select=not(mod(n\\,${sampleRate})),` : '';

  const args = [
    '-i', filePath,
    '-vf', `${selectFilter}scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-vsync', 'vfr',
    '-an',
    'pipe:1',
  ];

  const proc = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const width = probeInfo.width;
  const height = probeInfo.height;
  const frameSize = width * height * 4;

  let buffer = Buffer.alloc(0);

  for await (const chunk of proc.stdout!) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);

    while (buffer.length >= frameSize) {
      const frameBuffer = buffer.subarray(0, frameSize);
      buffer = buffer.subarray(frameSize);

      yield {
        data: new Uint8ClampedArray(
          frameBuffer.buffer,
          frameBuffer.byteOffset,
          frameBuffer.byteLength,
        ),
        width,
        height,
      };
    }
  }

  await new Promise<void>((resolve, reject) => {
    proc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`ffmpeg exited with code ${code}`));
      } else {
        resolve();
      }
    });
    proc.on('error', (err) => {
      reject(new Error(`ffmpeg not found. Install ffmpeg to analyze video files. (${err.message})`));
    });
  });
}

async function probeVideo(
  filePath: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'json',
      filePath,
    ]);

    let out = '';
    proc.stdout!.on('data', (d: Buffer) => (out += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('ffprobe failed — is ffmpeg installed?'));
        return;
      }
      try {
        const parsed = JSON.parse(out);
        const stream = parsed.streams?.[0];
        if (!stream?.width || !stream?.height) {
          reject(new Error('Could not determine video dimensions'));
          return;
        }
        // Round to even for ffmpeg compatibility
        resolve({
          width: Math.floor(stream.width / 2) * 2,
          height: Math.floor(stream.height / 2) * 2,
        });
      } catch {
        reject(new Error('Failed to parse ffprobe output'));
      }
    });

    proc.on('error', () => {
      reject(new Error('ffprobe not found. Install ffmpeg to analyze video files.'));
    });
  });
}
