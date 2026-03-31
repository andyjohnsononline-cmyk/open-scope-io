export interface FBO {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

/** Whether the GL context supports rendering to RGBA16F framebuffers. */
let _floatFBOSupported = false;

export function isFloatFBOSupported(): boolean {
  return _floatFBOSupported;
}

export function createWebGL2Context(
  canvas: HTMLCanvasElement,
): WebGL2RenderingContext | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const ext = gl.getExtension('EXT_color_buffer_float');
  _floatFBOSupported = ext !== null;
  if (!ext) {
    _floatFBOSupported = gl.getExtension('EXT_color_buffer_half_float') !== null;
  }

  return gl;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram | null {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  if (!vert || !frag) {
    if (vert) gl.deleteShader(vert);
    if (frag) gl.deleteShader(frag);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return null;
  }

  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  gl.deleteShader(vert);
  gl.deleteShader(frag);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

export function createFBO(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): FBO | null {
  const useFloat = _floatFBOSupported;
  const internalFormat = useFloat ? gl.RGBA16F : gl.RGBA8;
  const type = useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, internalFormat,
    width, height, 0,
    gl.RGBA, type, null,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) {
    gl.deleteTexture(texture);
    return null;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('FBO incomplete:', status);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return null;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { framebuffer, texture, width, height };
}

/**
 * Draw a fullscreen triangle covering the viewport.
 * Uses gl_VertexID in the vertex shader, so no buffer is needed.
 */
export function drawFullscreenTriangle(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function resetGLState(gl: WebGL2RenderingContext): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(null);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.colorMask(true, true, true, true);
}

export function deleteFBO(gl: WebGL2RenderingContext, fbo: FBO): void {
  gl.deleteFramebuffer(fbo.framebuffer);
  gl.deleteTexture(fbo.texture);
}
