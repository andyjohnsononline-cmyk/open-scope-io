/** Fullscreen triangle vertex shader — draws a triangle covering the entire viewport. */
export const PASSTHROUGH_VERT = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle trick: 3 vertices, no buffers needed
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  vUv = vec2(x, y) * 0.5 + 0.5;
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

/** Tonemap fragment shader — maps raw integer counts to log/linear/gamma intensity. */
export const TONEMAP_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp usampler2D;

uniform usampler2D uData;
uniform float uMaxVal;
uniform float uGain;
uniform float uLogBias;
uniform float uGammaExp;
uniform int uMapping; // 0=log, 1=linear, 2=gamma
uniform vec3 uColor;

in vec2 vUv;
out vec4 fragColor;

void main() {
  uint raw = texture(uData, vUv).r;
  float count = float(raw);

  float maxV = max(uMaxVal, 1.0);
  float intensity;

  if (uMapping == 0) {
    // Log mapping
    intensity = log(count * uLogBias + 1.0) / log(maxV * uLogBias + 1.0);
  } else if (uMapping == 1) {
    // Linear mapping
    intensity = count / maxV;
  } else {
    // Gamma mapping
    intensity = pow(count / maxV, uGammaExp);
  }

  intensity = clamp(intensity * uGain, 0.0, 1.0);
  fragColor = vec4(uColor * intensity, intensity);
}
`;

/** Tonemap fragment shader for R32F textures (float fallback path). */
export const TONEMAP_FLOAT_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uData;
uniform float uMaxVal;
uniform float uGain;
uniform float uLogBias;
uniform float uGammaExp;
uniform int uMapping; // 0=log, 1=linear, 2=gamma
uniform vec3 uColor;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float normalized = texture(uData, vUv).r;

  float intensity;
  if (uMapping == 0) {
    float mv = max(uMaxVal, 1.0);
    intensity = log(normalized * mv * uLogBias + 1.0) / log(mv * uLogBias + 1.0);
  } else if (uMapping == 1) {
    intensity = normalized;
  } else {
    intensity = pow(normalized, uGammaExp);
  }

  intensity = clamp(intensity * uGain, 0.0, 1.0);
  fragColor = vec4(uColor * intensity, intensity);
}
`;

/** Separable Gaussian blur fragment shader. */
export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uDirection; // (1/w, 0) for H pass, (0, 1/h) for V pass
uniform float uRadius;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 sum = vec4(0.0);
  float totalWeight = 0.0;

  float sigma = uRadius * 0.5;
  float invSigma2 = 1.0 / (2.0 * sigma * sigma);

  int samples = int(ceil(uRadius));
  for (int i = -samples; i <= samples; i++) {
    float fi = float(i);
    float weight = exp(-fi * fi * invSigma2);
    vec2 offset = uDirection * fi;
    sum += texture(uTexture, vUv + offset) * weight;
    totalWeight += weight;
  }

  fragColor = sum / totalWeight;
}
`;

/** Composite fragment shader — blends sharp + glow with sRGB output encode. */
export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uSharp;
uniform sampler2D uGlow;
uniform float uGlowStrength;
uniform vec3 uBackground;

in vec2 vUv;
out vec4 fragColor;

vec3 linearToSrgb(vec3 c) {
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

void main() {
  vec4 sharp = texture(uSharp, vUv);
  vec4 glow = texture(uGlow, vUv);

  vec3 trace = sharp.rgb + glow.rgb * uGlowStrength;
  vec3 result = uBackground + trace;

  fragColor = vec4(linearToSrgb(result), 1.0);
}
`;

/** Graticule line vertex shader. */
export const GRATICULE_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;
uniform vec2 uResolution;

void main() {
  vec2 clip = (aPosition / uResolution) * 2.0 - 1.0;
  clip.y = -clip.y; // flip Y so (0,0) = top-left
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

/** Graticule line fragment shader. */
export const GRATICULE_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  fragColor = uColor;
}
`;

/** Histogram fill vertex shader — positions triangle vertices for filled areas. */
export const HISTOGRAM_VERT = /* glsl */ `#version 300 es
precision highp float;
in vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/** False color fragment shader — maps luma to zone colors. */
export const FALSE_COLOR_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uFrame;

in vec2 vUv;
out vec4 fragColor;

const float LUMA_R = 0.2126;
const float LUMA_G = 0.7152;
const float LUMA_B = 0.0722;

struct Zone {
  float maxIre;
  vec3 color;
};

const Zone zones[12] = Zone[12](
  Zone(0.02, vec3(0.0, 0.0, 0.502)),
  Zone(0.10, vec3(0.0, 0.0, 1.0)),
  Zone(0.20, vec3(0.0, 0.502, 1.0)),
  Zone(0.30, vec3(0.0, 0.702, 0.302)),
  Zone(0.40, vec3(0.302, 0.8, 0.302)),
  Zone(0.50, vec3(0.502, 0.502, 0.502)),
  Zone(0.60, vec3(0.8, 0.8, 0.302)),
  Zone(0.70, vec3(1.0, 0.702, 0.0)),
  Zone(0.80, vec3(1.0, 0.4, 0.0)),
  Zone(0.90, vec3(1.0, 0.0, 0.0)),
  Zone(0.95, vec3(1.0, 0.302, 0.302)),
  Zone(1.00, vec3(1.0, 1.0, 1.0))
);

void main() {
  vec4 pixel = texture(uFrame, vUv);
  float luma = dot(pixel.rgb, vec3(LUMA_R, LUMA_G, LUMA_B));

  vec3 zoneColor = zones[11].color;
  for (int i = 0; i < 12; i++) {
    if (luma <= zones[i].maxIre) {
      zoneColor = zones[i].color;
      break;
    }
  }

  fragColor = vec4(zoneColor, 1.0);
}
`;
