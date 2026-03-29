/**
 * Generate gradient test images for scope validation.
 */

/** Horizontal gradient: left = black, right = white. All channels equal. */
export function generateHorizontalGradient(
  width: number,
  height: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = Math.round((x / (width - 1)) * 255);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Vertical gradient: top = black, bottom = white. All channels equal. */
export function generateVerticalGradient(
  width: number,
  height: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = Math.round((y / (height - 1)) * 255);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}
