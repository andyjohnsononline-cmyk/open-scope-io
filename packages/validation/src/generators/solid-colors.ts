/**
 * Generate uniform solid-color test images.
 * Every pixel has the same RGBA values — the simplest possible test case.
 */
export function generateSolidColor(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return data;
}

export const SOLID_PRESETS = {
  black: [0, 0, 0] as const,
  white: [255, 255, 255] as const,
  midGray: [128, 128, 128] as const,
  pureRed: [255, 0, 0] as const,
  pureGreen: [0, 255, 0] as const,
  pureBlue: [0, 0, 255] as const,
} as const;
