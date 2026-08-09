/**
 * A very small static file server for the built client.
 *
 * Deliberately dependency-free — Lexo's only production dependency is
 * `ws`. If you already run nginx or a CDN in front of this, point it at
 * `packages/client/dist` and ignore this file entirely.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function resolveFile(root: string, urlPath: string): Promise<string | null> {
  // Resolve first, then confirm the result is still inside the root, so
  // `../` in a URL cannot walk out of the client bundle.
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = path.resolve(root, '.' + path.posix.normalize(decoded));
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;

  try {
    const info = await stat(candidate);
    if (info.isDirectory()) return resolveFile(root, path.posix.join(decoded, 'index.html'));
    return candidate;
  } catch {
    return null;
  }
}

export function createStaticHandler(root: string) {
  const normalisedRoot = path.resolve(root);

  return async function serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const urlPath = request.url ?? '/';
    let file = await resolveFile(normalisedRoot, urlPath);

    // Single-page app: unknown paths are routes, not missing files.
    if (!file) file = await resolveFile(normalisedRoot, '/index.html');
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(
        'Client bundle not found. Run `npm run build` first, or use `npm run dev` for the dev server.',
      );
      return;
    }

    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    response.writeHead(200, {
      'content-type': type,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(response);
  };
}
