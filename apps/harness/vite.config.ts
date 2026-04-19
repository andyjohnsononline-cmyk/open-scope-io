import { defineConfig, type PluginOption } from 'vite';
import { resolve } from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Harness runs on port 5174 (demo occupies 5173). The scrubber loads two kinds
// of static assets from outside the Vite root:
//
//   /resolve/<variant-dir>/<file>        -> golden-references/2_april-6-2026-stills and scopes/<variant-dir>/<file>
//   /goldens/frames/<file>               -> packages/validation/src/goldens/frames/<file>
//
// Vite's built-in static server only serves files under the app root, so we
// plug in a small middleware that resolves these prefixes safely (no path
// traversal) and streams the requested file.

const repoRoot = resolve(__dirname, '../..');
const RESOLVE_PREFIX = '/resolve/';
const RESOLVE_ROOT = resolve(
  repoRoot,
  'golden-references/2_april-6-2026-stills and scopes',
);
const GOLDENS_PREFIX = '/goldens/';
const GOLDENS_ROOT = resolve(repoRoot, 'packages/validation/src/goldens');

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.tif':
    case '.tiff':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

function resolveSafe(root: string, relative: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(relative);
    } catch {
      return null;
    }
  })();
  if (decoded === null) return null;
  const abs = resolve(root, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
  if (abs !== root && !abs.startsWith(root + '/')) return null;
  return abs;
}

function staticMiddleware(): PluginOption {
  return {
    name: 'harness-static-assets',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? '';
        let root: string | null = null;
        let rest: string | null = null;
        if (url.startsWith(RESOLVE_PREFIX)) {
          root = RESOLVE_ROOT;
          rest = url.slice(RESOLVE_PREFIX.length).split('?')[0]!;
        } else if (url.startsWith(GOLDENS_PREFIX)) {
          root = GOLDENS_ROOT;
          rest = url.slice(GOLDENS_PREFIX.length).split('?')[0]!;
        }
        if (!root || !rest) return next();

        const abs = resolveSafe(root, rest);
        if (!abs || !existsSync(abs) || !statSync(abs).isFile()) {
          res.statusCode = 404;
          res.end(`Not found: ${url}`);
          return;
        }
        res.setHeader('Content-Type', mimeFor(extname(abs)));
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(abs).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [staticMiddleware()],
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: [
        repoRoot,
        resolve(repoRoot, 'golden-references'),
        resolve(repoRoot, 'packages/validation/src/goldens'),
      ],
    },
  },
});
