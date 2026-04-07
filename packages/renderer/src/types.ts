import type { ScopeResult } from '@openscope/core';

export type WaveformScaleStyle = 'percentage' | '10-bit' | '12-bit' | 'mv' | 'hdr';
export type LevelMode = 'video' | 'data';
export type VectorscopeStyle = 'off' | 'standard' | 'simplified' | 'hue-vectors';
export type VectorscopeTargets = '75' | '100' | '75+100';

export interface RenderOptions {
  /** Background color (default: '#111214') */
  background?: string;
  /** Foreground/trace color — overridden per scope type when appropriate */
  color?: string;
  /** Source frame pixels — required for false color overlay */
  sourcePixels?: Uint8ClampedArray;
  sourceWidth?: number;
  sourceHeight?: number;
  /** Y axis scale for waveform/parade (default: 'linear') */
  yAxisScale?: 'linear' | 'log';
  /** Waveform trace mode: luma (single trace) or rgb (3 overlapping channel traces) */
  mode?: 'luma' | 'rgb';
  /** Histogram layout: overlaid channels or stacked rows (default: 'overlaid') */
  layout?: 'overlaid' | 'stacked';
  /** Waveform/parade Y-axis scale unit (default: 'percentage') */
  waveformScale?: WaveformScaleStyle;
  /** Signal level interpretation (default: 'data') */
  levelMode?: LevelMode;
  /** Vectorscope graticule style (default: 'standard') */
  vectorscopeStyle?: VectorscopeStyle;
  /** Vectorscope color target level (default: '75') */
  vectorscopeTargets?: VectorscopeTargets;
  /** Show text labels on graticules (default: true) */
  showLabels?: boolean;
}

export type ScopeRenderFn = (
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
) => void;

export interface ScopeAppearance {
  intensity: {
    mapping: 'log' | 'linear' | 'gamma';
    /** Controls log curve knee (used with 'log' mapping), default 1.0 */
    logBias: number;
    /** Exponent value (used with 'gamma' mapping), default 0.4 */
    gammaExponent: number;
    /** Global intensity multiplier, default 1.0 */
    gain: number;
  };
  blur: {
    enabled: boolean;
    /** CSS pixels (multiplied by DPR at render time), default 3 */
    radius: number;
    /** 0.0–1.0, default 0.3 */
    strength: number;
  };
  glow: {
    enabled: boolean;
    /** CSS pixels (multiplied by DPR at render time), default 6 */
    radius: number;
    /** 0.0–1.0, default 0.15 */
    strength: number;
  };
  graticule: {
    lineColor: string;
    labelColor: string;
    lineWidth: number;
    dashPattern: number[];
    labelFont: string;
  };
  background: string;
}

export const DEFAULT_APPEARANCE: ScopeAppearance = {
  intensity: {
    mapping: 'log',
    logBias: 1.0,
    gammaExponent: 0.4,
    gain: 1.0,
  },
  blur: {
    enabled: true,
    radius: 3,
    strength: 0.3,
  },
  glow: {
    enabled: true,
    radius: 6,
    strength: 0.15,
  },
  graticule: {
    lineColor: '#1e2024',
    labelColor: '#6b6e76',
    lineWidth: 1,
    dashPattern: [4, 4],
    labelFont: '10px "Geist Mono", monospace',
  },
  background: '#111214',
};

export function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return [
      Number.isNaN(r) ? 0 : r,
      Number.isNaN(g) ? 0 : g,
      Number.isNaN(b) ? 0 : b,
    ];
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [
    Number.isNaN(r) ? 0 : r,
    Number.isNaN(g) ? 0 : g,
    Number.isNaN(b) ? 0 : b,
  ];
}
