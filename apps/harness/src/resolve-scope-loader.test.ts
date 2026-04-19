import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseResolveSpec,
  buildScopeCrops,
  clampCropRect,
  encodePathSegment,
} from './resolve-scope-loader.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

function loadRealSpec(variant: string): string {
  const path = resolve(
    __dirname,
    '../../../golden-references/2_april-6-2026-stills and scopes/',
    variant,
    'spec.json',
  );
  return readFileSync(path, 'utf-8');
}

describe('parseResolveSpec', () => {
  it('parses all three real variant spec.json files', () => {
    for (const variant of [
      '1-Isabella-no-lut',
      '2-isabella-aces1p3-vanilla',
      '3-isabella-aces1p3-vanillahdrp3-1000nit',
    ]) {
      const spec = parseResolveSpec(loadRealSpec(variant));
      expect(spec.version).toBe('1.0');
      expect(spec.variant).toBe(variant);
      expect(spec.scopes.length).toBeGreaterThanOrEqual(5);
      for (const scope of spec.scopes) {
        expect(scope.cropRect.width).toBeGreaterThan(0);
        expect(scope.cropRect.height).toBeGreaterThan(0);
      }
    }
  });

  it('throws on invalid JSON', () => {
    expect(() => parseResolveSpec('not json')).toThrow(/not valid JSON/);
  });

  it('throws on wrong version', () => {
    expect(() => parseResolveSpec(JSON.stringify({ version: '2.0', scopes: [] }))).toThrow(
      /unsupported version/,
    );
  });

  it('throws on empty scopes array', () => {
    const raw = JSON.stringify({ version: '1.0', scopes: [] });
    expect(() => parseResolveSpec(raw)).toThrow(/scopes must be a non-empty array/);
  });

  it('throws when a scope has a malformed cropRect', () => {
    const raw = JSON.stringify({
      version: '1.0',
      scopes: [
        {
          scopeId: 'waveform',
          file: 'a.png',
          cropRect: { x: 0, y: 0, width: -1, height: 100 },
        },
      ],
    });
    expect(() => parseResolveSpec(raw)).toThrow(/invalid cropRect/);
  });
});

describe('buildScopeCrops', () => {
  it('produces one crop per scope with URL-encoded filenames', () => {
    const spec = parseResolveSpec(loadRealSpec('1-Isabella-no-lut'));
    const crops = buildScopeCrops(spec, '/resolve/1-Isabella-no-lut');
    expect(crops.length).toBe(spec.scopes.length);
    expect(crops[0]!.screenshotUrl.startsWith('/resolve/1-Isabella-no-lut/')).toBe(true);
    // Filenames contain spaces, verify encoding
    expect(crops[0]!.screenshotUrl).toContain('Screenshot%202026-04-06');
    expect(crops[0]!.screenshotWidth).toBe(spec.screenshotWindow.width);
    expect(crops[0]!.cropRect).toEqual(spec.scopes[0]!.cropRect);
  });

  it('trims trailing slash from base URL', () => {
    const spec = parseResolveSpec(loadRealSpec('1-Isabella-no-lut'));
    const crops = buildScopeCrops(spec, '/resolve/1-Isabella-no-lut/');
    expect(crops[0]!.screenshotUrl.startsWith('/resolve/1-Isabella-no-lut/')).toBe(true);
    expect(crops[0]!.screenshotUrl).not.toContain('//Screenshot');
  });
});

describe('clampCropRect', () => {
  it('returns original rect when fully inside frame', () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 };
    expect(clampCropRect(rect, 200, 200)).toEqual(rect);
  });

  it('clamps width/height that overflow the frame', () => {
    const rect = { x: 100, y: 100, width: 500, height: 500 };
    expect(clampCropRect(rect, 300, 300)).toEqual({ x: 100, y: 100, width: 200, height: 200 });
  });

  it('returns null when rect is entirely outside the frame', () => {
    const rect = { x: 500, y: 500, width: 10, height: 10 };
    expect(clampCropRect(rect, 300, 300)).toBeNull();
  });

  it('clamps negative origin to zero', () => {
    const rect = { x: -50, y: -10, width: 100, height: 50 };
    expect(clampCropRect(rect, 400, 400)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });
});

describe('encodePathSegment', () => {
  it('encodes spaces as %20', () => {
    expect(encodePathSegment('Screenshot 2026-04-06 at 22.54.34.png')).toBe(
      'Screenshot%202026-04-06%20at%2022.54.34.png',
    );
  });
});
