import type { ScopeResult } from '@openscope/core';

export interface RenderOptions {
  /** Background color (default: '#111') */
  background?: string;
  /** Foreground/trace color — overridden per scope type when appropriate */
  color?: string;
  /** Source frame pixels — required for false color overlay */
  sourcePixels?: Uint8ClampedArray;
  sourceWidth?: number;
  sourceHeight?: number;
}

export type ScopeRenderFn = (
  ctx: CanvasRenderingContext2D,
  result: ScopeResult,
  options?: RenderOptions,
) => void;

export function parseHexColor(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}
