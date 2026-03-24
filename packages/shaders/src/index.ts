export { waveform, waveformShader } from './waveform.js';
export { rgbParade, paradeShader } from './parade.js';
export { vectorscope, vectorscopeShader } from './vectorscope.js';
export { histogram, histogramShader } from './histogram.js';
export { falseColor, falseColorShader, DEFAULT_ZONES } from './false-color.js';

import type { ScopePlugin } from '@openscope/core';
import { waveform } from './waveform.js';
import { rgbParade } from './parade.js';
import { vectorscope } from './vectorscope.js';
import { histogram } from './histogram.js';
import { falseColor } from './false-color.js';

/** All built-in scope plugins. Register them with pipeline.register(). */
export const allScopes: ScopePlugin[] = [
  waveform,
  rgbParade,
  vectorscope,
  histogram,
  falseColor,
];
