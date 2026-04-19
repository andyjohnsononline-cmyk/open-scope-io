/**
 * Resolve scope loader.
 *
 * Given a variant directory under `golden-references/2_april-6-2026-stills and scopes/`,
 * parses `spec.json` and exposes one `ResolveScopeCrop` per scope, describing
 * the Resolve screenshot file, the cropRect to apply, and the axis metadata.
 *
 * This module is intentionally split from DOM/canvas concerns so it can be
 * unit-tested under node without jsdom.
 */
export interface ResolveSpec {
  version: '1.0';
  variant: string;
  description: string;
  source: {
    tif: string;
    width: number;
    height: number;
    colorspace: string;
    transferFunction: string;
    [k: string]: unknown;
  };
  screenshotWindow: {
    width: number;
    height: number;
    os: string;
    app: string;
    capturedAt: string;
    retinaScale: number;
    notes?: string;
  };
  scopes: ResolveSpecScope[];
  annotationMeta: {
    annotatedBy: string;
    annotatedAt: string;
    confidence: 'low' | 'medium' | 'high';
    reviewStatus: 'pending' | 'verified' | string;
    notes?: string;
  };
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolveSpecScope {
  scopeId: string;
  resolveName: string;
  file: string;
  cropRect: CropRect;
  axisRange: unknown;
  colorspace: string;
  targets?: string;
  notes?: string;
}

export interface ResolveScopeCrop {
  scopeId: string;
  resolveName: string;
  /** Absolute (or app-relative) URL to the full Resolve screenshot. */
  screenshotUrl: string;
  /** Crop rectangle to apply to the full screenshot, in pixel coordinates. */
  cropRect: CropRect;
  /** Full screenshot window dimensions, from spec.json. */
  screenshotWidth: number;
  screenshotHeight: number;
  axisRange: unknown;
  colorspace: string;
  targets?: string;
  notes?: string;
}

/** Parse a spec.json string into a validated ResolveSpec. Throws on error. */
export function parseResolveSpec(raw: string): ResolveSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `spec.json is not valid JSON: ${(e as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('spec.json must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.version !== '1.0') {
    throw new Error(`spec.json: unsupported version: ${String(obj.version)}`);
  }
  const scopes = obj.scopes;
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('spec.json: scopes must be a non-empty array');
  }
  for (const s of scopes) {
    if (!s || typeof s !== 'object') {
      throw new Error('spec.json: each scope entry must be an object');
    }
    const sc = s as Record<string, unknown>;
    if (typeof sc.scopeId !== 'string' || typeof sc.file !== 'string') {
      throw new Error('spec.json: scope entries require scopeId and file');
    }
    if (!isCropRect(sc.cropRect)) {
      throw new Error(
        `spec.json: scope "${sc.scopeId}" has invalid cropRect`,
      );
    }
  }

  return parsed as ResolveSpec;
}

function isCropRect(v: unknown): v is CropRect {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number' &&
    r.width > 0 &&
    r.height > 0
  );
}

/**
 * Build the list of ResolveScopeCrop entries for a variant. `variantDirUrl`
 * is the web-accessible base path to the variant directory (no trailing /).
 * Screenshot URLs are produced by appending the spec's `file` field.
 */
export function buildScopeCrops(
  spec: ResolveSpec,
  variantDirUrl: string,
): ResolveScopeCrop[] {
  const base = variantDirUrl.replace(/\/+$/, '');
  return spec.scopes.map((s) => ({
    scopeId: s.scopeId,
    resolveName: s.resolveName,
    screenshotUrl: `${base}/${encodePathSegment(s.file)}`,
    cropRect: s.cropRect,
    screenshotWidth: spec.screenshotWindow.width,
    screenshotHeight: spec.screenshotWindow.height,
    axisRange: s.axisRange,
    colorspace: s.colorspace,
    targets: s.targets,
    notes: s.notes,
  }));
}

/** URL-safe encode a single path segment (spaces, etc). */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

/**
 * Clamp a crop rect into a frame. Returns the clamped rect (never exceeds
 * frame bounds, always width/height > 0 if possible). If clamping would
 * collapse the rect to zero, returns null.
 */
export function clampCropRect(
  crop: CropRect,
  frameWidth: number,
  frameHeight: number,
): CropRect | null {
  const x = Math.max(0, Math.min(crop.x, frameWidth));
  const y = Math.max(0, Math.min(crop.y, frameHeight));
  const width = Math.max(0, Math.min(crop.width, frameWidth - x));
  const height = Math.max(0, Math.min(crop.height, frameHeight - y));
  if (width === 0 || height === 0) return null;
  return { x, y, width, height };
}

/**
 * Browser-side: fetch + parse a spec.json by URL. Thin wrapper around
 * `parseResolveSpec` with a friendly "missing spec" error.
 */
export async function fetchResolveSpec(specUrl: string): Promise<ResolveSpec> {
  const res = await fetch(specUrl);
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`spec.json not found at ${specUrl}`);
    }
    throw new Error(
      `Failed to fetch spec.json (${res.status} ${res.statusText}): ${specUrl}`,
    );
  }
  const text = await res.text();
  return parseResolveSpec(text);
}
