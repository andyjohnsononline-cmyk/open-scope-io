import { createPipeline, type Pipeline } from '@openscope/core';
import { allScopes } from '@openscope/shaders';
import { ScopeRenderer } from '@openscope/renderer';

const SCOPE_IDS = ['waveform', 'rgbParade', 'vectorscope', 'histogram', 'falseColor'];

let pipeline: Pipeline;
let renderer: ScopeRenderer;
let running = false;
let paused = false;

const video = document.getElementById('video') as HTMLVideoElement;
const imageCanvas = document.getElementById('imageCanvas') as HTMLCanvasElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const webcamBtn = document.getElementById('webcamBtn') as HTMLButtonElement;
const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLSpanElement;

const scopeCanvases = new Map<string, CanvasRenderingContext2D>();
const scopeElements = new Map<string, HTMLCanvasElement>();

async function init() {
  pipeline = await createPipeline();

  if (pipeline.mode === 'cpu') {
    const warning = document.createElement('div');
    warning.className = 'gpu-warning';
    warning.textContent =
      'WebGPU not available — using CPU fallback. Performance will be limited.';
    document.body.insertBefore(warning, document.body.firstChild);
  }

  status.textContent = `Pipeline: ${pipeline.mode.toUpperCase()} mode`;

  for (const scope of allScopes) {
    pipeline.register(scope);
  }

  renderer = new ScopeRenderer();

  for (const id of SCOPE_IDS) {
    const canvas = document.getElementById(`canvas-${id}`) as HTMLCanvasElement;
    scopeElements.set(id, canvas);
    resizeCanvas(canvas);
    const ctx = canvas.getContext('2d')!;
    scopeCanvases.set(id, ctx);
  }

  window.addEventListener('resize', () => {
    for (const canvas of scopeElements.values()) {
      resizeCanvas(canvas);
    }
  });

  fileInput.addEventListener('change', handleFileInput);
  webcamBtn.addEventListener('click', handleWebcam);
  pauseBtn.addEventListener('click', togglePause);
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.parentElement!.getBoundingClientRect();
  canvas.width = Math.max(Math.floor(rect.width), 1);
  canvas.height = Math.max(Math.floor(rect.height), 1);
}

function resizeAllCanvases() {
  for (const canvas of scopeElements.values()) {
    resizeCanvas(canvas);
  }
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
    const img = new Image();
    img.onload = async () => {
      imageCanvas.width = img.naturalWidth;
      imageCanvas.height = img.naturalHeight;
      const ctx = imageCanvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resizeAllCanvases();
      status.textContent = `Image: ${img.naturalWidth}×${img.naturalHeight}`;
      URL.revokeObjectURL(url);
      await analyzeImage(ctx, img.naturalWidth, img.naturalHeight);
    };
    img.onerror = () => {
      status.textContent = 'Error: failed to decode image';
      URL.revokeObjectURL(url);
    };
    img.src = url;
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

async function loop() {
  if (!running || paused) return;

  if (video.readyState >= 2) {
    const w = video.videoWidth;
    const h = video.videoHeight;

    offscreen.width = w;
    offscreen.height = h;
    offCtx.drawImage(video, 0, 0, w, h);

    const imageData = offCtx.getImageData(0, 0, w, h);

    try {
      const results = await pipeline.analyze(
        { data: imageData.data, width: w, height: h },
        SCOPE_IDS,
      );

      for (const [id, result] of results) {
        const ctx = scopeCanvases.get(id);
        if (!ctx) continue;

        renderer.render(ctx, result, {
          sourcePixels: imageData.data,
          sourceWidth: w,
          sourceHeight: h,
        });
      }
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

    for (const [id, result] of results) {
      const scopeCtx = scopeCanvases.get(id);
      if (!scopeCtx) continue;

      renderer.render(scopeCtx, result, {
        sourcePixels: imageData.data,
        sourceWidth: width,
        sourceHeight: height,
      });
    }
  } catch (e) {
    console.error('Image analysis error:', e);
    status.textContent = `Analysis error: ${(e as Error).message}`;
  }
}

init().catch((e) => {
  status.textContent = `Init error: ${e.message}`;
  console.error(e);
});
