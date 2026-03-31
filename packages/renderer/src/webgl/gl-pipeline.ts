import type { ScopeAppearance } from '../types.js';
import {
  createFBO,
  createProgram,
  deleteFBO,
  drawFullscreenTriangle,
  type FBO,
} from './gl-utils.js';
import {
  PASSTHROUGH_VERT,
  TONEMAP_FRAG,
  TONEMAP_FLOAT_FRAG,
  BLUR_FRAG,
  COMPOSITE_FRAG,
} from './shaders.js';
import { parseHexColor } from '../types.js';

function srgbToLinear(x: number): number {
  return Math.pow(x, 2.2);
}

export interface PipelineResources {
  tonemapProgram: WebGLProgram;
  tonemapFloatProgram: WebGLProgram;
  blurProgram: WebGLProgram;
  compositeProgram: WebGLProgram;
  vao: WebGLVertexArrayObject;
  tonemapFBO: FBO;
  blurFBO1: FBO;
  blurFBO2: FBO;
  width: number;
  height: number;
}

export function createPipelineResources(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): PipelineResources | null {
  const tonemapProgram = createProgram(gl, PASSTHROUGH_VERT, TONEMAP_FRAG);
  const tonemapFloatProgram = createProgram(gl, PASSTHROUGH_VERT, TONEMAP_FLOAT_FRAG);
  const blurProgram = createProgram(gl, PASSTHROUGH_VERT, BLUR_FRAG);
  const compositeProgram = createProgram(gl, PASSTHROUGH_VERT, COMPOSITE_FRAG);

  if (!tonemapProgram || !tonemapFloatProgram || !blurProgram || !compositeProgram) {
    return null;
  }

  const vao = gl.createVertexArray();
  if (!vao) return null;

  const tonemapFBO = createFBO(gl, width, height);
  const blurFBO1 = createFBO(gl, width, height);
  const blurFBO2 = createFBO(gl, width, height);

  if (!tonemapFBO || !blurFBO1 || !blurFBO2) return null;

  return {
    tonemapProgram,
    tonemapFloatProgram,
    blurProgram,
    compositeProgram,
    vao,
    tonemapFBO,
    blurFBO1,
    blurFBO2,
    width,
    height,
  };
}

export function resizePipelineFBOs(
  gl: WebGL2RenderingContext,
  res: PipelineResources,
  width: number,
  height: number,
): boolean {
  if (res.width === width && res.height === height) return true;

  deleteFBO(gl, res.tonemapFBO);
  deleteFBO(gl, res.blurFBO1);
  deleteFBO(gl, res.blurFBO2);

  const t = createFBO(gl, width, height);
  const b1 = createFBO(gl, width, height);
  const b2 = createFBO(gl, width, height);

  if (!t || !b1 || !b2) return false;

  res.tonemapFBO = t;
  res.blurFBO1 = b1;
  res.blurFBO2 = b2;
  res.width = width;
  res.height = height;
  return true;
}

/**
 * Run the density scope pipeline: tonemap → blur → composite.
 *
 * @param dataTexture - R32UI or R32F texture containing analysis counts
 * @param isFloat - true if the texture is R32F (float fallback path)
 * @param maxVal - maximum count value in the buffer (used for R32UI normalization)
 * @param color - RGB trace color in [0, 1] range
 * @param appearance - rendering appearance parameters
 * @param viewport - [x, y, w, h] viewport within the canvas
 * @param additive - when true, composite with zero background and additive blending
 *   (caller must pre-clear framebuffer with background)
 */
export function runDensityPipeline(
  gl: WebGL2RenderingContext,
  res: PipelineResources,
  dataTexture: WebGLTexture,
  isFloat: boolean,
  maxVal: number,
  color: [number, number, number],
  appearance: ScopeAppearance,
  viewport: [number, number, number, number],
  additive = false,
): void {
  const [vx, vy, vw, vh] = viewport;
  const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;

  gl.bindVertexArray(res.vao);

  // Pass 1: Tonemap — data texture → tonemapFBO
  const prog = isFloat ? res.tonemapFloatProgram : res.tonemapProgram;
  gl.useProgram(prog);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dataTexture);
  gl.uniform1i(gl.getUniformLocation(prog, 'uData'), 0);

  gl.uniform1f(gl.getUniformLocation(prog, 'uMaxVal'), maxVal);
  gl.uniform1f(gl.getUniformLocation(prog, 'uLogBias'), appearance.intensity.logBias);

  gl.uniform1f(gl.getUniformLocation(prog, 'uGain'), appearance.intensity.gain);
  gl.uniform1f(gl.getUniformLocation(prog, 'uGammaExp'), appearance.intensity.gammaExponent);
  const mappingMap = { log: 0, linear: 1, gamma: 2 } as const;
  gl.uniform1i(gl.getUniformLocation(prog, 'uMapping'), mappingMap[appearance.intensity.mapping]);
  gl.uniform3f(
    gl.getUniformLocation(prog, 'uColor'),
    srgbToLinear(color[0]),
    srgbToLinear(color[1]),
    srgbToLinear(color[2]),
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, res.tonemapFBO.framebuffer);
  gl.viewport(0, 0, res.tonemapFBO.width, res.tonemapFBO.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.BLEND);

  drawFullscreenTriangle(gl);

  // Pass 2 & 3: Blur (separable Gaussian) — tonemapFBO → blurFBO1 (H) → blurFBO2 (V)
  if (appearance.blur.enabled || appearance.glow.enabled) {
    gl.useProgram(res.blurProgram);
    gl.uniform1i(gl.getUniformLocation(res.blurProgram, 'uTexture'), 0);

    const blurRadius = (appearance.blur.enabled ? appearance.blur.radius : 0) +
      (appearance.glow.enabled ? appearance.glow.radius : 0);
    const effectiveRadius = Math.min(blurRadius * dpr, 32);

    gl.uniform1f(gl.getUniformLocation(res.blurProgram, 'uRadius'), effectiveRadius);

    // Horizontal pass
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.tonemapFBO.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.blurFBO1.framebuffer);
    gl.viewport(0, 0, res.blurFBO1.width, res.blurFBO1.height);
    gl.uniform2f(
      gl.getUniformLocation(res.blurProgram, 'uDirection'),
      1.0 / res.blurFBO1.width,
      0,
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawFullscreenTriangle(gl);

    // Vertical pass
    gl.bindTexture(gl.TEXTURE_2D, res.blurFBO1.texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, res.blurFBO2.framebuffer);
    gl.viewport(0, 0, res.blurFBO2.width, res.blurFBO2.height);
    gl.uniform2f(
      gl.getUniformLocation(res.blurProgram, 'uDirection'),
      0,
      1.0 / res.blurFBO2.height,
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
    drawFullscreenTriangle(gl);
  }

  // Pass 4: Composite — sharp (tonemap) + glow (blur) → default framebuffer
  gl.useProgram(res.compositeProgram);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, res.tonemapFBO.texture);
  gl.uniform1i(gl.getUniformLocation(res.compositeProgram, 'uSharp'), 0);

  gl.activeTexture(gl.TEXTURE1);
  const glowTex = (appearance.blur.enabled || appearance.glow.enabled)
    ? res.blurFBO2.texture
    : res.tonemapFBO.texture;
  gl.bindTexture(gl.TEXTURE_2D, glowTex);
  gl.uniform1i(gl.getUniformLocation(res.compositeProgram, 'uGlow'), 1);

  const glowStr = appearance.glow.enabled
    ? appearance.glow.strength + (appearance.blur.enabled ? appearance.blur.strength : 0)
    : (appearance.blur.enabled ? appearance.blur.strength : 0);
  gl.uniform1f(gl.getUniformLocation(res.compositeProgram, 'uGlowStrength'), glowStr);

  if (additive) {
    gl.uniform3f(gl.getUniformLocation(res.compositeProgram, 'uBackground'), 0, 0, 0);
  } else {
    const [bgR, bgG, bgB] = parseHexColor(appearance.background);
    gl.uniform3f(
      gl.getUniformLocation(res.compositeProgram, 'uBackground'),
      srgbToLinear(bgR / 255),
      srgbToLinear(bgG / 255),
      srgbToLinear(bgB / 255),
    );
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(vx, vy, vw, vh);
  if (additive) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  } else {
    gl.disable(gl.BLEND);
  }
  drawFullscreenTriangle(gl);

  if (additive) {
    gl.disable(gl.BLEND);
  }

  gl.bindVertexArray(null);
}

export function destroyPipelineResources(
  gl: WebGL2RenderingContext,
  res: PipelineResources,
): void {
  gl.deleteProgram(res.tonemapProgram);
  gl.deleteProgram(res.tonemapFloatProgram);
  gl.deleteProgram(res.blurProgram);
  gl.deleteProgram(res.compositeProgram);
  gl.deleteVertexArray(res.vao);
  deleteFBO(gl, res.tonemapFBO);
  deleteFBO(gl, res.blurFBO1);
  deleteFBO(gl, res.blurFBO2);
}
