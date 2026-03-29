/**
 * Generate SMPTE color bar test patterns with exact specification values.
 *
 * Values from SMPTE ECR 1-1978 / RP 219:2002, using BT.709 matrix coefficients.
 * Source: https://en.wikipedia.org/wiki/SMPTE_color_bars
 */

export interface SMPTEBar {
  label: string;
  r: number;
  g: number;
  b: number;
}

/**
 * 75% SMPTE bars — 8-bit Studio R'G'B' values from RP 219:2002 Table.
 * These are the standard 7 bars that appear in the top 2/3 of the pattern.
 */
export const SMPTE_75_BARS: SMPTEBar[] = [
  { label: '75% White', r: 180, g: 180, b: 180 },
  { label: '75% Yellow', r: 180, g: 180, b: 16 },
  { label: '75% Cyan', r: 16, g: 180, b: 180 },
  { label: '75% Green', r: 16, g: 180, b: 16 },
  { label: '75% Magenta', r: 180, g: 16, b: 180 },
  { label: '75% Red', r: 180, g: 16, b: 16 },
  { label: '75% Blue', r: 16, g: 16, b: 180 },
];

/**
 * 100% SMPTE bars — full intensity primaries/secondaries.
 */
export const SMPTE_100_BARS: SMPTEBar[] = [
  { label: '100% White', r: 235, g: 235, b: 235 },
  { label: '100% Yellow', r: 235, g: 235, b: 16 },
  { label: '100% Cyan', r: 16, g: 235, b: 235 },
  { label: '100% Green', r: 16, g: 235, b: 16 },
  { label: '100% Magenta', r: 235, g: 16, b: 235 },
  { label: '100% Red', r: 235, g: 16, b: 16 },
  { label: '100% Blue', r: 16, g: 16, b: 235 },
];

/**
 * Generate a simplified SMPTE bar pattern (7 equal-width vertical bars).
 * Uses the top 2/3 only — no castellations or PLUGE pulse.
 */
export function generateSMPTEBars(
  width: number,
  height: number,
  bars: SMPTEBar[] = SMPTE_75_BARS,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const barCount = bars.length;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const barIndex = Math.min(
        Math.floor((x / width) * barCount),
        barCount - 1,
      );
      const bar = bars[barIndex];
      const i = (y * width + x) * 4;
      data[i] = bar.r;
      data[i + 1] = bar.g;
      data[i + 2] = bar.b;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Get the column ranges each bar occupies for a given width.
 * Returns [startX, endX) for each bar.
 */
export function getBarColumnRanges(
  width: number,
  barCount: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < barCount; i++) {
    const start = Math.floor((i / barCount) * width);
    const end = i === barCount - 1 ? width : Math.floor(((i + 1) / barCount) * width);
    ranges.push([start, end]);
  }
  return ranges;
}
