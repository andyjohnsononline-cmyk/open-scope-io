// Meta-package: re-exports from all OpenScope subpackages
export {
  type ScopeResult,
  type ScopePlugin,
  type PixelData,
  type FrameSource,
  type Pipeline,
  type PipelineOptions,
  PluginRegistry,
  CpuPipeline,
  GpuPipeline,
  createPipeline,
  createCpuPipeline,
} from '@openscope/core';

export {
  waveform,
  rgbParade,
  vectorscope,
  histogram,
  falseColor,
  allScopes,
  waveformShader,
  paradeShader,
  vectorscopeShader,
  histogramShader,
  falseColorShader,
  DEFAULT_ZONES,
} from '@openscope/shaders';

export {
  ScopeRenderer,
  renderWaveform,
  renderParade,
  renderVectorscope,
  renderHistogram,
  renderFalseColor,
  type RenderOptions,
  type ScopeRenderFn,
} from '@openscope/renderer';
