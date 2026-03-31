export { ScopeRenderer } from './scope-renderer.js';
export { WebGlScopeRenderer } from './webgl/webgl-scope-renderer.js';
export { renderWaveform } from './render-waveform.js';
export { renderParade } from './render-parade.js';
export { renderVectorscope } from './render-vectorscope.js';
export { renderHistogram } from './render-histogram.js';
export { renderFalseColor } from './render-false-color.js';
export { parseHexColor, DEFAULT_APPEARANCE } from './types.js';
export type {
  RenderOptions,
  ScopeRenderFn,
  ScopeAppearance,
} from './types.js';
export type { WaveformMode } from './webgl/webgl-scope-renderer.js';
