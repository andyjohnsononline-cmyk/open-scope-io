import { describe, it, expect } from 'vitest';
import {
  createInitialScrubberState,
  reduceScrubber,
  activeVariant,
  activeScope,
} from './scrubber.js';

const VARIANTS = ['v1', 'v2', 'v3'] as const;
const SCOPES = ['waveform', 'rgbParade', 'vectorscope', 'histogram', 'cieChromaticity'] as const;

describe('createInitialScrubberState', () => {
  it('starts at index 0 for both dimensions', () => {
    const state = createInitialScrubberState(VARIANTS, SCOPES);
    expect(state.variantIndex).toBe(0);
    expect(state.scopeIndex).toBe(0);
    expect(state.showFullScreenshot).toBe(false);
    expect(activeVariant(state)).toBe('v1');
    expect(activeScope(state)).toBe('waveform');
  });

  it('throws on empty inputs', () => {
    expect(() => createInitialScrubberState([], SCOPES)).toThrow();
    expect(() => createInitialScrubberState(VARIANTS, [])).toThrow();
  });
});

describe('reduceScrubber — advance/wrap', () => {
  it('nextVariant/prevVariant wrap cyclically', () => {
    let s = createInitialScrubberState(VARIANTS, SCOPES);
    s = reduceScrubber(s, { type: 'nextVariant' });
    expect(s.variantIndex).toBe(1);
    s = reduceScrubber(s, { type: 'nextVariant' });
    s = reduceScrubber(s, { type: 'nextVariant' });
    expect(s.variantIndex).toBe(0); // wraps
    s = reduceScrubber(s, { type: 'prevVariant' });
    expect(s.variantIndex).toBe(2); // wraps backwards
  });

  it('nextScope/prevScope wrap cyclically', () => {
    let s = createInitialScrubberState(VARIANTS, SCOPES);
    for (let i = 0; i < SCOPES.length; i++) {
      s = reduceScrubber(s, { type: 'nextScope' });
    }
    expect(s.scopeIndex).toBe(0);
    s = reduceScrubber(s, { type: 'prevScope' });
    expect(s.scopeIndex).toBe(SCOPES.length - 1);
  });
});

describe('reduceScrubber — setVariant/setScope clamps', () => {
  it('clamps out-of-range indices into [0, length-1]', () => {
    let s = createInitialScrubberState(VARIANTS, SCOPES);
    s = reduceScrubber(s, { type: 'setVariant', index: 99 });
    expect(s.variantIndex).toBe(VARIANTS.length - 1);
    s = reduceScrubber(s, { type: 'setVariant', index: -5 });
    expect(s.variantIndex).toBe(0);

    s = reduceScrubber(s, { type: 'setScope', index: 12 });
    expect(s.scopeIndex).toBe(SCOPES.length - 1);
    s = reduceScrubber(s, { type: 'setScope', index: -10 });
    expect(s.scopeIndex).toBe(0);
  });

  it('clamps NaN/Infinity safely', () => {
    let s = createInitialScrubberState(VARIANTS, SCOPES);
    s = reduceScrubber(s, { type: 'setVariant', index: Number.NaN });
    expect(s.variantIndex).toBe(0);
    s = reduceScrubber(s, { type: 'setScope', index: Number.POSITIVE_INFINITY });
    expect(s.scopeIndex).toBe(SCOPES.length - 1);
  });

  it('returns a new state object (immutability)', () => {
    const a = createInitialScrubberState(VARIANTS, SCOPES);
    const b = reduceScrubber(a, { type: 'nextScope' });
    expect(b).not.toBe(a);
    expect(a.scopeIndex).toBe(0); // original unchanged
  });
});

describe('reduceScrubber — showFullScreenshot toggle', () => {
  it('sets the flag without touching indices', () => {
    let s = createInitialScrubberState(VARIANTS, SCOPES);
    s = reduceScrubber(s, { type: 'nextVariant' });
    s = reduceScrubber(s, { type: 'nextScope' });
    const before = { v: s.variantIndex, sc: s.scopeIndex };
    s = reduceScrubber(s, { type: 'setShowFullScreenshot', value: true });
    expect(s.showFullScreenshot).toBe(true);
    expect(s.variantIndex).toBe(before.v);
    expect(s.scopeIndex).toBe(before.sc);
  });
});
