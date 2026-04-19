/**
 * Scrubber — state + DOM controller for the harness.
 *
 * The pure state machine (ScrubberState + reducer) is unit-tested under node.
 * The DOM controller (ScrubberController) is exercised end-to-end in the
 * browser and is intentionally thin.
 */

export interface ScrubberState {
  /** Indices into the two lists. */
  variantIndex: number;
  scopeIndex: number;
  /** Copies of the lists so the reducer is pure. */
  variants: readonly string[];
  scopes: readonly string[];
  showFullScreenshot: boolean;
}

export type ScrubberAction =
  | { type: 'setVariant'; index: number }
  | { type: 'setScope'; index: number }
  | { type: 'nextVariant' }
  | { type: 'prevVariant' }
  | { type: 'nextScope' }
  | { type: 'prevScope' }
  | { type: 'setShowFullScreenshot'; value: boolean };

/**
 * Pure reducer. Never mutates input; out-of-range index changes are clamped
 * silently (next/prev wrap; setX clamps into [0, length-1]).
 */
export function reduceScrubber(
  state: ScrubberState,
  action: ScrubberAction,
): ScrubberState {
  switch (action.type) {
    case 'setVariant':
      return { ...state, variantIndex: clamp(action.index, state.variants.length) };
    case 'setScope':
      return { ...state, scopeIndex: clamp(action.index, state.scopes.length) };
    case 'nextVariant':
      return {
        ...state,
        variantIndex: wrap(state.variantIndex + 1, state.variants.length),
      };
    case 'prevVariant':
      return {
        ...state,
        variantIndex: wrap(state.variantIndex - 1, state.variants.length),
      };
    case 'nextScope':
      return {
        ...state,
        scopeIndex: wrap(state.scopeIndex + 1, state.scopes.length),
      };
    case 'prevScope':
      return {
        ...state,
        scopeIndex: wrap(state.scopeIndex - 1, state.scopes.length),
      };
    case 'setShowFullScreenshot':
      return { ...state, showFullScreenshot: action.value };
    default: {
      // Exhaustiveness
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function createInitialScrubberState(
  variants: readonly string[],
  scopes: readonly string[],
): ScrubberState {
  if (variants.length === 0) {
    throw new Error('createInitialScrubberState: variants must be non-empty');
  }
  if (scopes.length === 0) {
    throw new Error('createInitialScrubberState: scopes must be non-empty');
  }
  return {
    variantIndex: 0,
    scopeIndex: 0,
    variants,
    scopes,
    showFullScreenshot: false,
  };
}

export function activeVariant(state: ScrubberState): string {
  return state.variants[state.variantIndex]!;
}

export function activeScope(state: ScrubberState): string {
  return state.scopes[state.scopeIndex]!;
}

function clamp(n: number, length: number): number {
  if (length === 0) return 0;
  if (Number.isNaN(n)) return 0;
  if (n === Number.POSITIVE_INFINITY) return length - 1;
  if (n === Number.NEGATIVE_INFINITY) return 0;
  return Math.max(0, Math.min(Math.trunc(n), length - 1));
}

function wrap(n: number, length: number): number {
  if (length === 0) return 0;
  const m = Math.trunc(n) % length;
  return m < 0 ? m + length : m;
}
