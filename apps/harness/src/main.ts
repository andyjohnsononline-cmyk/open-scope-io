import { createPipeline, type Pipeline, type ScopeResult } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import {
  ScopeRenderer,
  WebGlScopeRenderer,
  type RenderOptions,
} from '@openscope/renderer';

import {
  fetchResolveSpec,
  buildScopeCrops,
  clampCropRect,
  type ResolveScopeCrop,
} from './resolve-scope-loader.js';
import { diffImages, type DiffResult } from './diff-view.js';
import {
  createInitialScrubberState,
  reduceScrubber,
  activeVariant,
  activeScope,
  type ScrubberAction,
  type ScrubberState,
} from './scrubber.js';

const VARIANTS = [
  '1-Isabella-no-lut',
  '2-isabella-aces1p3-vanilla',
  '3-isabella-aces1p3-vanillahdrp3-1000nit',
] as const;

const SCOPE_IDS = ['waveform', 'rgbParade', 'vectorscope', 'histogram', 'cieChromaticity'] as const;

// OpenScope scopes that have a live implementation (cieChromaticity is not implemented in v1).
const IMPLEMENTED_SCOPE_IDS = new Set([
  'waveform',
  'rgbParade',
  'vectorscope',
  'histogram',
  'falseColor',
]);

// Maps the variant dir name to the baked-PNG frame that OpenScope should
// analyze. Validation frames live in packages/validation/src/goldens/frames/
// and are baked by `scripts/bake-pngs.ts`.
const VARIANT_FRAME_MAP: Record<string, string> = {
  '1-Isabella-no-lut': '/goldens/frames/isabella-no-lut.png',
  '2-isabella-aces1p3-vanilla': '/goldens/frames/isabella-aces13-rec709.png',
  '3-isabella-aces1p3-vanillahdrp3-1000nit': '/goldens/frames/isabella-aces13-hdr-p3.png',
};

const VARIANT_DIR_BASE = '/resolve';

// --- DOM refs ---------------------------------------------------------------
const variantSelect = el<HTMLSelectElement>('variantSelect');
const scopeSelect = el<HTMLSelectElement>('scopeSelect');
const showFullCheck = el<HTMLInputElement>('showFullCheck');
const statusEl = el<HTMLSpanElement>('status');
const pipelineModeEl = el<HTMLSpanElement>('pipelineMode');

const sourceCanvas = el<HTMLCanvasElement>('canvas-source');
const openscopeCanvas = el<HTMLCanvasElement>('canvas-openscope');
const openscopeOverlay = el<HTMLCanvasElement>('overlay-openscope');
const resolveCanvas = el<HTMLCanvasElement>('canvas-resolve');
const resolveOverlay = el<HTMLCanvasElement>('overlay-resolve');
const diffCanvas = el<HTMLCanvasElement>('canvas-diff');
const openscopeBadge = el<HTMLSpanElement>('badge-openscope');

const ssimValueEl = el<HTMLSpanElement>('ssimValue');
const diffPixelsValueEl = el<HTMLSpanElement>('diffPixelsValue');

// --- runtime state ----------------------------------------------------------
let pipeline: Pipeline | null = null;
let canvasRenderer: ScopeRenderer | null = null;
let glRenderer: WebGlScopeRenderer | null = null;
let useWebGL = false;
let lastFrameBitmap: ImageBitmap | null = null;
let lastFrameImageData: ImageData | null = null;
let specCacheByVariant: Map<string, ResolveScopeCrop[]> = new Map();

let state: ScrubberState = createInitialScrubberState(
  VARIANTS,
  SCOPE_IDS,
);

async function boot() {
  try {
    pipeline = await createPipeline();
    pipelineModeEl.textContent = `Pipeline: ${pipeline.mode.toUpperCase()}`;
    for (const scope of allScopes) pipeline.register(scope);

    canvasRenderer = new ScopeRenderer();

    const gl = new WebGlScopeRenderer();
    const ok = gl.initScope('waveform', openscopeCanvas, openscopeOverlay);
    if (ok) {
      glRenderer = gl;
      useWebGL = true;
    } else {
      gl.destroy();
      useWebGL = false;
      openscopeOverlay.style.display = 'none';
    }

    wireUi();
    await renderAll();
  } catch (err) {
    statusEl.textContent = `Boot error: ${(err as Error).message}`;
    statusEl.classList.add('error-status');
    console.error(err);
  }
}

function wireUi() {
  // <select> options are declared in index.html; just sync them to state.
  variantSelect.value = activeVariant(state);
  scopeSelect.value = activeScope(state);
  showFullCheck.checked = state.showFullScreenshot;

  variantSelect.addEventListener('change', () => {
    dispatch({ type: 'setVariant', index: VARIANTS.indexOf(variantSelect.value as typeof VARIANTS[number]) });
  });
  scopeSelect.addEventListener('change', () => {
    dispatch({ type: 'setScope', index: SCOPE_IDS.indexOf(scopeSelect.value as typeof SCOPE_IDS[number]) });
  });
  showFullCheck.addEventListener('change', () => {
    dispatch({ type: 'setShowFullScreenshot', value: showFullCheck.checked });
  });
}

function dispatch(action: ScrubberAction) {
  const prev = state;
  state = reduceScrubber(state, action);
  variantSelect.value = activeVariant(state);
  scopeSelect.value = activeScope(state);
  showFullCheck.checked = state.showFullScreenshot;

  const variantChanged = prev.variantIndex !== state.variantIndex;
  void renderAll({ reloadFrame: variantChanged });
}

async function renderAll(options: { reloadFrame?: boolean } = {}): Promise<void> {
  if (!pipeline) return;
  const variant = activeVariant(state);
  const scopeId = activeScope(state);

  // Load spec + crops for this variant (cached).
  let crops = specCacheByVariant.get(variant);
  if (!crops) {
    try {
      const specUrl = `${VARIANT_DIR_BASE}/${encodeURIComponent(variant)}/spec.json`;
      const spec = await fetchResolveSpec(specUrl);
      const variantDirUrl = `${VARIANT_DIR_BASE}/${encodeURIComponent(variant)}`;
      crops = buildScopeCrops(spec, variantDirUrl);
      specCacheByVariant.set(variant, crops);
    } catch (e) {
      statusEl.textContent = `Spec error: ${(e as Error).message}`;
      return;
    }
  }

  // Load the source frame bitmap (cached across scope changes within a variant).
  if (options.reloadFrame || lastFrameBitmap === null) {
    const framePath = VARIANT_FRAME_MAP[variant];
    if (!framePath) {
      statusEl.textContent = `No frame mapping for ${variant}`;
      return;
    }
    try {
      lastFrameBitmap?.close();
      lastFrameBitmap = await loadImageBitmap(framePath);
      lastFrameImageData = bitmapToImageData(lastFrameBitmap);
      drawBitmapToFit(sourceCanvas, lastFrameBitmap);
    } catch (e) {
      statusEl.textContent = `Frame load error: ${(e as Error).message}`;
      return;
    }
  }

  // Render OpenScope live (if implemented).
  if (IMPLEMENTED_SCOPE_IDS.has(scopeId) && lastFrameImageData) {
    await renderOpenscopeScope(scopeId);
    openscopeBadge.textContent = useWebGL ? '' : 'CPU';
    openscopeBadge.className = useWebGL ? 'scope-badge' : 'scope-badge cpu';
  } else {
    drawNotImplemented(openscopeCanvas, scopeId);
    openscopeBadge.textContent = 'N/A';
    openscopeBadge.className = 'scope-badge sw';
  }

  // Draw Resolve crop (or full screenshot with overlay, if toggled).
  const crop = crops.find((c) => c.scopeId === scopeId);
  if (!crop) {
    statusEl.textContent = `No crop defined for ${scopeId} in ${variant}`;
    clearCanvas(resolveCanvas);
    clearCanvas(resolveOverlay);
    clearCanvas(diffCanvas);
    return;
  }

  const resolveImageData = await drawResolvePanel(crop, state.showFullScreenshot);

  // Run diff only when the two sides are comparable sizes. Resize the
  // OpenScope render to match the Resolve crop and compute SSIM + pixelmatch.
  if (IMPLEMENTED_SCOPE_IDS.has(scopeId) && resolveImageData) {
    try {
      const openscopeImageData = readCanvasImageData(openscopeCanvas);
      const resizedOs = resizeToMatch(openscopeImageData, resolveImageData.width, resolveImageData.height);
      const diff = diffImages(resizedOs, resolveImageData);
      drawDiff(diff);
      updateReadout(diff);
      statusEl.textContent = `${variant} · ${scopeId} · ${resolveImageData.width}x${resolveImageData.height}`;
      statusEl.classList.remove('error-status');
    } catch (e) {
      clearCanvas(diffCanvas);
      ssimValueEl.textContent = '—';
      diffPixelsValueEl.textContent = '—';
      statusEl.textContent = `Diff error: ${(e as Error).message}`;
    }
  } else {
    clearCanvas(diffCanvas);
    ssimValueEl.textContent = '—';
    diffPixelsValueEl.textContent = '—';
    statusEl.textContent = `${variant} · ${scopeId} · diff skipped (scope not implemented)`;
  }
}

async function renderOpenscopeScope(scopeId: string) {
  if (!pipeline || !lastFrameImageData) return;
  const { data, width, height } = lastFrameImageData;

  const results = await pipeline.analyze(
    { data, width, height },
    [scopeId === 'waveform' ? 'waveform' : scopeId, 'waveform', 'rgbParade', 'vectorscope', 'histogram', 'falseColor'].filter(
      (v, i, a) => a.indexOf(v) === i && IMPLEMENTED_SCOPE_IDS.has(v),
    ),
  );

  const renderOpts: RenderOptions = {
    sourcePixels: data,
    sourceWidth: width,
    sourceHeight: height,
  };

  const result = results.get(scopeId);
  if (!result) {
    drawNotImplemented(openscopeCanvas, scopeId);
    return;
  }

  sizeCanvasToDisplay(openscopeCanvas);
  sizeCanvasToDisplay(openscopeOverlay);

  if (useWebGL && glRenderer) {
    // Re-init the WebGL renderer for this specific scope. The shared
    // display canvas is reused — we pass the current scope ID so the GL
    // renderer picks the right shader program.
    const inited = glRenderer.initScope(scopeId, openscopeCanvas, openscopeOverlay);
    if (inited) {
      glRenderer.render(scopeId, result, renderOpts);
      return;
    }
    // Fall through to Canvas 2D if GL init fails for this scope.
  }

  if (canvasRenderer) {
    const ctx = openscopeCanvas.getContext('2d');
    if (!ctx) return;
    canvasRenderer.render(ctx, result, renderOpts);
  }
}

async function drawResolvePanel(
  crop: ResolveScopeCrop,
  showFull: boolean,
): Promise<ImageData | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await loadImageBitmap(crop.screenshotUrl);
  } catch (e) {
    clearCanvas(resolveCanvas);
    clearCanvas(resolveOverlay);
    statusEl.textContent = `Resolve load error: ${(e as Error).message}`;
    return null;
  }

  const clamped = clampCropRect(
    crop.cropRect,
    bitmap.width,
    bitmap.height,
  );

  if (showFull) {
    // Full screenshot + crop overlay rectangle.
    drawBitmapToFit(resolveCanvas, bitmap);
    drawCropOverlay(resolveOverlay, resolveCanvas, bitmap, clamped);
    const imageData = clamped
      ? cropBitmapToImageData(bitmap, clamped)
      : bitmapToImageData(bitmap);
    bitmap.close();
    return imageData;
  }

  clearCanvas(resolveOverlay);
  const region = clamped ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  // Draw the cropped region to the resolve canvas at the panel aspect.
  drawBitmapRegionToFit(resolveCanvas, bitmap, region);
  const imageData = cropBitmapToImageData(bitmap, region);
  bitmap.close();
  return imageData;
}

function drawDiff(diff: DiffResult) {
  diffCanvas.width = diff.diffImageData.width;
  diffCanvas.height = diff.diffImageData.height;
  const ctx = diffCanvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(diff.diffImageData, 0, 0);
}

function updateReadout(diff: DiffResult) {
  ssimValueEl.textContent = diff.ssim.toFixed(4);
  diffPixelsValueEl.textContent = formatInt(diff.diffPixels);
}

// --- Canvas helpers ---------------------------------------------------------

async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
  }
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

function cropBitmapToImageData(
  bitmap: ImageBitmap,
  region: { x: number; y: number; width: number; height: number },
): ImageData {
  const c = document.createElement('canvas');
  c.width = region.width;
  c.height = region.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(
    bitmap,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );
  return ctx.getImageData(0, 0, region.width, region.height);
}

function drawBitmapToFit(canvas: HTMLCanvasElement, bitmap: ImageBitmap) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { dx, dy, dw, dh } = contain(bitmap.width, bitmap.height, canvas.width, canvas.height);
  ctx.drawImage(bitmap, dx, dy, dw, dh);
}

function drawBitmapRegionToFit(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  region: { x: number; y: number; width: number; height: number },
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { dx, dy, dw, dh } = contain(region.width, region.height, canvas.width, canvas.height);
  ctx.drawImage(
    bitmap,
    region.x,
    region.y,
    region.width,
    region.height,
    dx,
    dy,
    dw,
    dh,
  );
}

function drawCropOverlay(
  overlay: HTMLCanvasElement,
  baseCanvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  clamped: { x: number; y: number; width: number; height: number } | null,
) {
  overlay.width = baseCanvas.width;
  overlay.height = baseCanvas.height;
  const ctx = overlay.getContext('2d');
  if (!ctx || !clamped) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const { dx, dy, dw, dh } = contain(
    bitmap.width,
    bitmap.height,
    baseCanvas.width,
    baseCanvas.height,
  );
  const scaleX = dw / bitmap.width;
  const scaleY = dh / bitmap.height;
  const rx = dx + clamped.x * scaleX;
  const ry = dy + clamped.y * scaleY;
  const rw = clamped.width * scaleX;
  const rh = clamped.height * scaleY;
  ctx.strokeStyle = '#00e599';
  ctx.lineWidth = 2;
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.fillStyle = 'rgba(0, 229, 153, 0.08)';
  ctx.fillRect(rx, ry, rw, rh);
}

function contain(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  if (srcW <= 0 || srcH <= 0) return { dx: 0, dy: 0, dw: 0, dh: 0 };
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  return { dx: (dstW - dw) / 2, dy: (dstH - dh) / 2, dw, dh };
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function sizeCanvasToDisplay(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

function readCanvasImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // WebGL case: draw the GL canvas into a 2D canvas
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const c2 = c.getContext('2d');
    if (!c2) throw new Error('2D context unavailable');
    c2.drawImage(canvas, 0, 0);
    return c2.getImageData(0, 0, c.width, c.height);
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function resizeToMatch(src: ImageData, w: number, h: number): ImageData {
  if (src.width === w && src.height === h) return src;
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = src.width;
  srcCanvas.height = src.height;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('2D context unavailable');
  srcCtx.putImageData(src, 0, 0);

  const dst = document.createElement('canvas');
  dst.width = w;
  dst.height = h;
  const dstCtx = dst.getContext('2d');
  if (!dstCtx) throw new Error('2D context unavailable');
  dstCtx.imageSmoothingEnabled = true;
  dstCtx.imageSmoothingQuality = 'high';
  dstCtx.drawImage(srcCanvas, 0, 0, w, h);
  return dstCtx.getImageData(0, 0, w, h);
}

function drawNotImplemented(canvas: HTMLCanvasElement, scopeId: string) {
  sizeCanvasToDisplay(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#111214';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#6b6e76';
  ctx.font = `500 ${Math.floor(14 * (window.devicePixelRatio || 1))}px Geist, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${scopeId} — not implemented in v1`, canvas.width / 2, canvas.height / 2);
}

function formatInt(n: number): string {
  return n.toLocaleString('en-US');
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing element #${id}`);
  return e as T;
}

boot();
