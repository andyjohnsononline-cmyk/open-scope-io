/**
 * Edge-case test images designed to stress scope implementations.
 */

/** 1px checkerboard alternating black and white. */
export function generateCheckerboard(
  width: number,
  height: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = (x + y) % 2 === 0 ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Single colored pixel at (0,0) on a black background. */
export function generateSinglePixel(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  // All black by default (Uint8ClampedArray is zero-initialized)
  // Set alpha for all pixels
  for (let i = 3; i < data.length; i += 4) {
    data[i] = 255;
  }
  // Set the single colored pixel at (0,0)
  data[0] = r;
  data[1] = g;
  data[2] = b;
  return data;
}

/**
 * Seeded pseudo-random noise for reproducible statistical tests.
 * Uses a simple mulberry32 PRNG.
 */
export function generateSeededNoise(
  width: number,
  height: number,
  seed = 42,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  let state = seed;

  function mulberry32(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(mulberry32() * 256);
    data[i + 1] = Math.floor(mulberry32() * 256);
    data[i + 2] = Math.floor(mulberry32() * 256);
    data[i + 3] = 255;
  }
  return data;
}
