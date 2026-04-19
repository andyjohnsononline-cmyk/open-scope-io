/**
 * Diff view: combined pixelmatch + SSIM comparison of two images.
 *
 * The caller is responsible for resizing images to identical dimensions — this
 * module refuses mismatched input on purpose, so the scrubber can make the
 * explicit choice about whether to downscale Resolve or upscale OpenScope.
 */
import pixelmatch from 'pixelmatch';
import { ssim } from 'ssim.js';

export interface DiffOptions {
  /** pixelmatch threshold (0..1). Lower is more sensitive. Default 0.1. */
  threshold?: number;
  /** pixelmatch alpha blend of original image in diff output. Default 0.1. */
  alpha?: number;
}

export interface DiffResult {
  /** Number of pixels flagged different by pixelmatch. */
  diffPixels: number;
  /** MSSIM score in [0, 1]. 1 means perceptually identical. */
  ssim: number;
  /** Diff ImageData visualization (same dims as inputs). */
  diffImageData: ImageData;
  /** Fraction of pixels different (diffPixels / (w*h)), for convenience. */
  diffFraction: number;
}

/**
 * Diff two equally sized ImageData. Throws if dimensions do not match.
 */
export function diffImages(
  a: ImageData,
  b: ImageData,
  options: DiffOptions = {},
): DiffResult {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `diffImages: dimension mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
  }
  if (a.width <= 0 || a.height <= 0) {
    throw new Error(`diffImages: non-positive dimensions ${a.width}x${a.height}`);
  }

  const { width, height } = a;
  const output = new Uint8ClampedArray(width * height * 4);

  const diffPixels = pixelmatch(a.data, b.data, output, width, height, {
    threshold: options.threshold ?? 0.1,
    alpha: options.alpha ?? 0.1,
    diffColor: [255, 77, 77], // matches DESIGN.md danger color
    aaColor: [255, 170, 51], // matches DESIGN.md warning color
  });

  const ssimResult = ssim(a, b);
  const diffImageData = new ImageData(output, width, height);

  return {
    diffPixels,
    ssim: ssimResult.mssim,
    diffImageData,
    diffFraction: diffPixels / (width * height),
  };
}

/**
 * Resize an ImageData to `targetWidth`x`targetHeight` using a Canvas.
 * Convenience helper for the scrubber; not exercised by unit tests that run
 * under node (it requires the DOM/OffscreenCanvas).
 */
export function resizeImageData(
  src: ImageData,
  targetWidth: number,
  targetHeight: number,
): ImageData {
  if (targetWidth === src.width && targetHeight === src.height) {
    return src;
  }
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = src.width;
  srcCanvas.height = src.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('resizeImageData: 2D context unavailable');
  srcCtx.putImageData(src, 0, 0);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = targetWidth;
  dstCanvas.height = targetHeight;
  const dstCtx = dstCanvas.getContext('2d');
  if (!dstCtx) throw new Error('resizeImageData: 2D context unavailable');
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';
  dstCtx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
  return dstCtx.getImageData(0, 0, targetWidth, targetHeight);
}
