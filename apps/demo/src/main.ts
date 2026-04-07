import { createPipeline, type Pipeline, type ScopeResult } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import {
  ScopeRenderer,
  WebGlScopeRenderer,
  type WaveformMode,
  type RenderOptions,
  type WaveformScaleStyle,
  type LevelMode,
  type VectorscopeStyle,
  type VectorscopeTargets,
} from '@openscope/renderer';

const SCOPE_IDS = ['waveform', 'rgbParade', 'vectorscope', 'histogram', 'falseColor'];

let pipeline: Pipeline;
let canvasRenderer: ScopeRenderer;
let glRenderer: WebGlScopeRenderer | null = null;
let useWebGL = false;
let running = false;
let paused = false;
let waveformMode: WaveformMode = 'luma';
let lastResults: Map<string, ScopeResult> | null = null;
let lastImageData: ImageData | null = null;
let lastW = 0;
let lastH = 0;

let currentWaveformScale: WaveformScaleStyle = 'percentage';
let currentLevelMode: LevelMode = 'data';
let currentVecStyle: VectorscopeStyle = 'standard';
let currentVecTargets: VectorscopeTargets = '75';
let currentShowLabels = true;

const video = document.getElementById('video') as HTMLVideoElement;
const imageCanvas = document.getElementById('imageCanvas') as HTMLCanvasElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const webcamBtn = document.getElementById('webcamBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const waveformModeBtn = document.getElementById('waveformModeBtn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLSpanElement;
const renderModeSpan = document.getElementById('renderMode') as HTMLSpanElement;

const waveformScaleSelect = document.getElementById('waveformScaleSelect') as HTMLSelectElement;
const levelModeSelect = document.getElementById('levelModeSelect') as HTMLSelectElement;
const vecStyleSelect = document.getElementById('vecStyleSelect') as HTMLSelectElement;
const vecTargetsSelect = document.getElementById('vecTargetsSelect') as HTMLSelectElement;
const showLabelsCheck = document.getElementById('showLabelsCheck') as HTMLInputElement;

const scopeCanvases = new Map<string, CanvasRenderingContext2D>();
const scopeElements = new Map<string, HTMLCanvasElement>();

async function init() {
  pipeline = await createPipeline();

  if (pipeline.mode === 'cpu') {
    const warning = document.createElement('div');
    warning.className = 'gpu-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent =
      'WebGPU not available — using CPU fallback. Performance will be limited.';
    document.body.insertBefore(warning, document.body.firstChild);
  }

  status.textContent = `Pipeline: ${pipeline.mode.toUpperCase()} mode`;

  for (const scope of allScopes) {
    pipeline.register(scope);
  }

  canvasRenderer = new ScopeRenderer();

  // Try WebGL2 renderer
  glRenderer = new WebGlScopeRenderer();
  let allScopesInitialized = true;

  for (const id of SCOPE_IDS) {
    const canvas = document.getElementById(`canvas-${id}`) as HTMLCanvasElement;
    const overlay = document.getElementById(`overlay-${id}`) as HTMLCanvasElement;
    scopeElements.set(id, canvas);

    const ok = glRenderer.initScope(id, canvas, overlay);
    if (!ok) {
      allScopesInitialized = false;
      break;
    }
  }

  if (allScopesInitialized) {
    useWebGL = true;
    renderModeSpan.textContent = `WebGPU + WebGL2`;

    glRenderer.onContextLost = () => {
      useWebGL = false;
      for (const id of SCOPE_IDS) {
        const badge = document.getElementById(`badge-${id}`);
        if (badge) {
          badge.textContent = 'CPU';
          badge.className = 'scope-badge cpu';
        }
      }
      // Reinit Canvas 2D contexts for fallback
      for (const id of SCOPE_IDS) {
        const canvas = scopeElements.get(id);
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) scopeCanvases.set(id, ctx);
        }
      }
      renderModeSpan.textContent = `WebGPU + Canvas 2D (context lost)`;
    };

    glRenderer.onContextRestored = () => {
      useWebGL = true;
      for (const id of SCOPE_IDS) {
        const badge = document.getElementById(`badge-${id}`);
        if (badge) {
          badge.className = 'scope-badge';
        }
      }
      renderModeSpan.textContent = `WebGPU + WebGL2`;
    };
  } else {
    // WebGL2 not available, fall back to Canvas 2D
    glRenderer.destroy();
    glRenderer = null;
    useWebGL = false;

    for (const id of SCOPE_IDS) {
      const canvas = document.getElementById(`canvas-${id}`) as HTMLCanvasElement;
      scopeElements.set(id, canvas);
      resizeCanvas(canvas);
      const ctx = canvas.getContext('2d')!;
      scopeCanvases.set(id, ctx);

      // Show SW badge for permanent fallback
      const badge = document.getElementById(`badge-${id}`);
      if (badge) {
        badge.textContent = 'SW';
        badge.className = 'scope-badge sw';
      }

      // Hide overlay canvas since we don't need it
      const overlay = document.getElementById(`overlay-${id}`);
      if (overlay) overlay.style.display = 'none';
    }

    renderModeSpan.textContent = `WebGPU + Canvas 2D (no WebGL2)`;
  }

  window.addEventListener('resize', handleResize);

  fileInput.addEventListener('change', handleFileInput);
  webcamBtn.addEventListener('click', handleWebcam);
  pauseBtn.addEventListener('click', togglePause);
  waveformModeBtn.addEventListener('click', toggleWaveformMode);

  waveformScaleSelect.addEventListener('change', handleScopeOptionChange);
  levelModeSelect.addEventListener('change', handleScopeOptionChange);
  vecStyleSelect.addEventListener('change', handleScopeOptionChange);
  vecTargetsSelect.addEventListener('change', handleScopeOptionChange);
  showLabelsCheck.addEventListener('change', handleScopeOptionChange);
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = devicePixelRatio || 1;
  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = Math.max(Math.floor(rect.width * dpr), 1);
  canvas.height = Math.max(Math.floor(rect.height * dpr), 1);
}

function handleResize() {
  if (useWebGL && glRenderer) {
    glRenderer.resizeAll();
  } else {
    for (const canvas of scopeElements.values()) {
      resizeCanvas(canvas);
    }
  }
}

function toggleWaveformMode() {
  waveformMode = waveformMode === 'luma' ? 'rgb' : 'luma';
  waveformModeBtn.textContent = `Waveform: ${waveformMode === 'luma' ? 'Luma' : 'RGB'}`;
  if (glRenderer) {
    glRenderer.waveformMode = waveformMode;
  }
  if (!running && lastResults && lastImageData) {
    renderResults(lastResults, lastImageData, lastW, lastH);
  }
}

function handleScopeOptionChange() {
  currentWaveformScale = waveformScaleSelect.value as WaveformScaleStyle;
  currentLevelMode = levelModeSelect.value as LevelMode;
  currentVecStyle = vecStyleSelect.value as VectorscopeStyle;
  currentVecTargets = vecTargetsSelect.value as VectorscopeTargets;
  currentShowLabels = showLabelsCheck.checked;

  if (!running && lastResults && lastImageData) {
    renderResults(lastResults, lastImageData, lastW, lastH);
  }
}

function buildRenderOptions(extra?: Partial<RenderOptions>): RenderOptions {
  return {
    ...extra,
    waveformScale: currentWaveformScale,
    levelMode: currentLevelMode,
    vectorscopeStyle: currentVecStyle,
    vectorscopeTargets: currentVecTargets,
    showLabels: currentShowLabels,
  };
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|tiff?|svg|avif|heic)$/i;

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.test(file.name);
}

async function handleFileInput() {
  const file = fileInput.files?.[0];
  if (!file) return;

  stopLoop();
  const url = URL.createObjectURL(file);

  if (isImageFile(file)) {
    video.style.display = 'none';
    imageCanvas.style.display = 'block';

    try {
      const bitmap = await createImageBitmap(file);
      imageCanvas.width = bitmap.width;
      imageCanvas.height = bitmap.height;
      const ctx = imageCanvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      handleResize();
      status.textContent = `Image: ${bitmap.width}×${bitmap.height}`;
      URL.revokeObjectURL(url);
      await analyzeImage(ctx, imageCanvas.width, imageCanvas.height);
    } catch (e) {
      const img = new Image();
      img.onload = async () => {
        imageCanvas.width = img.naturalWidth;
        imageCanvas.height = img.naturalHeight;
        const ctx = imageCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        handleResize();
        status.textContent = `Image: ${img.naturalWidth}×${img.naturalHeight}`;
        URL.revokeObjectURL(url);
        await analyzeImage(ctx, img.naturalWidth, img.naturalHeight);
      };
      img.onerror = () => {
        const ext = file.name.split('.').pop()?.toUpperCase() ?? 'unknown';
        status.textContent = `Error: ${ext} format not supported by this browser. Use PNG, JPEG, or WebP.`;
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  } else {
    imageCanvas.style.display = 'none';
    video.style.display = 'block';
    video.src = url;
    video.onloadeddata = () => {
      status.textContent = `Video: ${video.videoWidth}×${video.videoHeight}`;
      video.play();
      pauseBtn.disabled = false;
      startLoop();
    };
  }
}

async function handleWebcam() {
  try {
    stopLoop();
    imageCanvas.style.display = 'none';
    video.style.display = 'block';
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.play();
    pauseBtn.disabled = false;
    status.textContent = 'Webcam active';
    startLoop();
  } catch (e) {
    status.textContent = `Webcam error: ${(e as Error).message}`;
  }
}

function togglePause() {
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  if (paused) {
    video.pause();
  } else {
    video.play();
    if (!running) startLoop();
  }
}

function startLoop() {
  running = true;
  requestAnimationFrame(loop);
}

function stopLoop() {
  running = false;
}

const offscreen = document.createElement('canvas');
const offCtx = offscreen.getContext('2d', { willReadFrequently: true })!;

function renderResults(
  results: Map<string, ScopeResult>,
  imageData: ImageData,
  w: number,
  h: number,
) {
  lastResults = results;
  lastImageData = imageData;
  lastW = w;
  lastH = h;

  const baseOpts = { sourcePixels: imageData.data, sourceWidth: w, sourceHeight: h };
  const opts = buildRenderOptions(baseOpts);

  if (useWebGL && glRenderer) {
    if (waveformMode === 'rgb') {
      const paradeResult = results.get('rgbParade');
      if (paradeResult) {
        const waveformFromParade: ScopeResult = {
          ...paradeResult,
          scopeId: 'waveform',
        };
        glRenderer.render('waveform', waveformFromParade, opts);
      }
    } else {
      const waveformResult = results.get('waveform');
      if (waveformResult) {
        glRenderer.render('waveform', waveformResult, opts);
      }
    }

    for (const id of ['rgbParade', 'vectorscope', 'histogram', 'falseColor']) {
      const result = results.get(id);
      if (result) {
        glRenderer.render(id, result, opts);
      }
    }
  } else {
    for (const [id, result] of results) {
      const ctx = scopeCanvases.get(id);
      if (!ctx) continue;
      canvasRenderer.render(ctx, result, opts);
    }
  }
}

async function loop() {
  if (!running || paused) return;

  if (video.readyState >= 2) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      requestAnimationFrame(loop);
      return;
    }

    offscreen.width = w;
    offscreen.height = h;
    offCtx.drawImage(video, 0, 0, w, h);

    const imageData = offCtx.getImageData(0, 0, w, h);

    try {
      const results = await pipeline.analyze(
        { data: imageData.data, width: w, height: h },
        SCOPE_IDS,
      );

      renderResults(results, imageData, w, h);
    } catch (e) {
      console.error('Analysis error:', e);
    }
  }

  requestAnimationFrame(loop);
}

async function analyzeImage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);

    const results = await pipeline.analyze(
      { data: imageData.data, width, height },
      SCOPE_IDS,
    );

    renderResults(results, imageData, width, height);
  } catch (e) {
    console.error('Image analysis error:', e);
    status.textContent = `Analysis error: ${(e as Error).message}`;
  }
}

init().catch((e) => {
  status.textContent = `Init error: ${e.message}`;
  console.error(e);
});
