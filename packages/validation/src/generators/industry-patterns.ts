/**
 * Industry-standard test patterns for scope conformance validation.
 *
 * These go beyond the basic SMPTE bars to exercise edge cases
 * that matter for matching DaVinci Resolve's scope behavior.
 */

export interface ColorPatch {
  label: string;
  r: number;
  g: number;
  b: number;
}

/**
 * EBU 100% color bars — 8 equal-width vertical bars including black.
 * Standard European Broadcasting Union test pattern.
 */
export const EBU_100_BARS: ColorPatch[] = [
  { label: 'White', r: 235, g: 235, b: 235 },
  { label: 'Yellow', r: 235, g: 235, b: 16 },
  { label: 'Cyan', r: 16, g: 235, b: 235 },
  { label: 'Green', r: 16, g: 235, b: 16 },
  { label: 'Magenta', r: 235, g: 16, b: 235 },
  { label: 'Red', r: 235, g: 16, b: 16 },
  { label: 'Blue', r: 16, g: 16, b: 235 },
  { label: 'Black', r: 16, g: 16, b: 16 },
];

/**
 * EBU 75% color bars — 8 bars at 75% intensity.
 */
export const EBU_75_BARS: ColorPatch[] = [
  { label: '75% White', r: 180, g: 180, b: 180 },
  { label: '75% Yellow', r: 180, g: 180, b: 16 },
  { label: '75% Cyan', r: 16, g: 180, b: 180 },
  { label: '75% Green', r: 16, g: 180, b: 16 },
  { label: '75% Magenta', r: 180, g: 16, b: 180 },
  { label: '75% Red', r: 180, g: 16, b: 16 },
  { label: '75% Blue', r: 16, g: 16, b: 180 },
  { label: '75% Black', r: 16, g: 16, b: 16 },
];

/**
 * Generate vertical color patches (equal-width bars).
 */
export function generateColorPatches(
  width: number,
  height: number,
  patches: ColorPatch[],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const patchCount = patches.length;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = Math.min(Math.floor((x / width) * patchCount), patchCount - 1);
      const patch = patches[idx];
      const i = (y * width + x) * 4;
      data[i] = patch.r;
      data[i + 1] = patch.g;
      data[i + 2] = patch.b;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * PLUGE (Picture Line-Up Generation Equipment) pulse pattern.
 * Near-black patches for monitor calibration: steps from 0 to 20 in 2-level increments.
 * Critical for validating shadow detail in waveform and false color scopes.
 */
export function generatePLUGE(
  width: number,
  height: number,
): Uint8ClampedArray {
  const levels = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const data = new Uint8ClampedArray(width * height * 4);
  const patchWidth = Math.floor(width / levels.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = Math.min(Math.floor(x / patchWidth), levels.length - 1);
      const v = levels[idx];
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Zone system patches: 11 steps from pure black to peak white.
 * Evenly spaced at approximately 0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255.
 * Tests full dynamic range in waveform, histogram, and false color.
 */
export function generateZonePatches(
  width: number,
  height: number,
): Uint8ClampedArray {
  const zones = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255];
  const data = new Uint8ClampedArray(width * height * 4);
  const patchWidth = Math.floor(width / zones.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = Math.min(Math.floor(x / patchWidth), zones.length - 1);
      const v = zones[idx];
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Skin tone diversity target: 6 patches spanning a range of human skin tones.
 * Critical for vectorscope skin tone line validation.
 * Values approximate common skin tones in sRGB.
 */
export const SKIN_TONE_PATCHES: ColorPatch[] = [
  { label: 'Light', r: 232, g: 190, b: 172 },
  { label: 'Medium-Light', r: 215, g: 168, b: 140 },
  { label: 'Medium', r: 188, g: 143, b: 113 },
  { label: 'Medium-Dark', r: 156, g: 110, b: 80 },
  { label: 'Dark', r: 107, g: 72, b: 49 },
  { label: 'Very Dark', r: 66, g: 43, b: 30 },
];

/**
 * Generate skin tone target pattern.
 */
export function generateSkinToneTarget(
  width: number,
  height: number,
): Uint8ClampedArray {
  return generateColorPatches(width, height, SKIN_TONE_PATCHES);
}

/**
 * High-saturation primaries and secondaries at 100%.
 * Stresses vectorscope by hitting the outer edge of the gamut.
 */
export const HIGH_SAT_PATCHES: ColorPatch[] = [
  { label: 'Red', r: 255, g: 0, b: 0 },
  { label: 'Green', r: 0, g: 255, b: 0 },
  { label: 'Blue', r: 0, g: 0, b: 255 },
  { label: 'Yellow', r: 255, g: 255, b: 0 },
  { label: 'Magenta', r: 255, g: 0, b: 255 },
  { label: 'Cyan', r: 0, g: 255, b: 255 },
];

/**
 * Generate high-saturation primaries/secondaries pattern.
 */
export function generateHighSatPrimaries(
  width: number,
  height: number,
): Uint8ClampedArray {
  return generateColorPatches(width, height, HIGH_SAT_PATCHES);
}

/**
 * Near-black gradient: fine steps in the 0-20 range.
 * Tests shadow resolution in waveform and histogram.
 */
export function generateNearBlackGradient(
  width: number,
  height: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 20);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Near-white gradient: fine steps in the 235-255 range.
 * Tests highlight resolution and clipping detection.
 */
export function generateNearWhiteGradient(
  width: number,
  height: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round(235 + (x / (width - 1)) * 20);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Channel ramps: R, G, B horizontal gradients stacked vertically.
 * Tests per-channel analysis in RGB parade and histogram.
 */
export function generateChannelRamps(
  width: number,
  height: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const thirdH = Math.floor(height / 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 255);
      const i = (y * width + x) * 4;
      if (y < thirdH) {
        data[i] = v; data[i + 1] = 0; data[i + 2] = 0;
      } else if (y < thirdH * 2) {
        data[i] = 0; data[i + 1] = v; data[i + 2] = 0;
      } else {
        data[i] = 0; data[i + 1] = 0; data[i + 2] = v;
      }
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * CDL-graded test: applies ASC CDL Slope/Offset/Power to a mid-gray field.
 * Simulates what Resolve does when applying CDL grades.
 * Useful for validating that OpenScope correctly reads graded content.
 */
export function generateCDLGraded(
  width: number,
  height: number,
  slope: [number, number, number] = [1.2, 1.0, 0.8],
  offset: [number, number, number] = [0.02, 0.0, -0.02],
  power: [number, number, number] = [1.0, 1.0, 1.0],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const baseVal = x / (width - 1);

      let r = Math.pow(Math.max(0, baseVal * slope[0] + offset[0]), power[0]);
      let g = Math.pow(Math.max(0, baseVal * slope[1] + offset[1]), power[1]);
      let b = Math.pow(Math.max(0, baseVal * slope[2] + offset[2]), power[2]);

      r = Math.min(1, Math.max(0, r));
      g = Math.min(1, Math.max(0, g));
      b = Math.min(1, Math.max(0, b));

      const i = (y * width + x) * 4;
      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}
