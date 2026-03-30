/**
 * Transpose column-major analysis data to row-major for texImage2D.
 * Analysis buffers store data as data[col * rows + row] (column-major).
 * texImage2D expects row-major: data[row * cols + col].
 */
export function transposeColumnMajor(
  data: Uint32Array,
  cols: number,
  rows: number,
): Uint32Array {
  const out = new Uint32Array(cols * rows);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      out[r * cols + c] = data[c * rows + r];
    }
  }
  return out;
}

/**
 * Upload a Uint32Array analysis buffer as an R32UI texture.
 * Returns the texture, or null if integer textures aren't supported.
 */
export function uploadR32UI(
  gl: WebGL2RenderingContext,
  data: Uint32Array,
  width: number,
  height: number,
  existing?: WebGLTexture | null,
): WebGLTexture | null {
  if (data.length < width * height) {
    console.warn(
      `Buffer size mismatch: expected ${width * height}, got ${data.length}`,
    );
    return null;
  }

  const texture = existing ?? gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32UI,
    width,
    height,
    0,
    gl.RED_INTEGER,
    gl.UNSIGNED_INT,
    data.subarray(0, width * height),
  );

  if (gl.getError() !== gl.NO_ERROR) {
    if (!existing) gl.deleteTexture(texture);
    return null;
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}

/**
 * Upload a Uint32Array as an R32F texture (CPU-normalized fallback).
 * Scans the buffer for the max value and normalizes to [0, 1].
 */
export function uploadR32F(
  gl: WebGL2RenderingContext,
  data: Uint32Array,
  width: number,
  height: number,
  existing?: WebGLTexture | null,
): { texture: WebGLTexture; maxVal: number } | null {
  if (data.length < width * height) {
    console.warn(
      `Buffer size mismatch: expected ${width * height}, got ${data.length}`,
    );
    return null;
  }

  const count = width * height;
  let maxVal = 0;
  for (let i = 0; i < count; i++) {
    if (data[i] > maxVal) maxVal = data[i];
  }

  const floatData = new Float32Array(count);
  if (maxVal > 0) {
    const inv = 1.0 / maxVal;
    for (let i = 0; i < count; i++) {
      floatData[i] = data[i] * inv;
    }
  }

  const texture = existing ?? gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32F,
    width,
    height,
    0,
    gl.RED,
    gl.FLOAT,
    floatData,
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return { texture, maxVal };
}

/**
 * Upload RGBA8 pixel data (for false color source frame).
 */
export function uploadRGBA8(
  gl: WebGL2RenderingContext,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  existing?: WebGLTexture | null,
): WebGLTexture | null {
  if (data.length < width * height * 4) return null;

  const texture = existing ?? gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);

  // ImageData row 0 is the top of the image. Without this flip, it would
  // map to texture V=0 (GL bottom) and render upside down.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data,
  );
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}
