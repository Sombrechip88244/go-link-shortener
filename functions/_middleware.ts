// Reserved-word blocklist and structural code validation. Static assets
// (anything with a known file extension) and project pages (e.g. /about →
// about.html) are passed through to the asset service directly. /api/*, /,
// and /{code}/+ are also allowed through. The reserved-word check applies
// only to single-segment paths with no extension that aren't project pages —
// those are the actual short-code candidates.

import { isReservedCode, validateCode } from './lib/validate';

// Small static extension allowlist — used by hasStaticExtension.
const STATIC_EXTENSIONS: Record<string, true> = {
  html: true, css: true, js: true, mjs: true, svg: true, png: true,
  jpg: true, jpeg: true, gif: true, webp: true, ico: true, json: true,
  txt: true, xml: true, map: true, woff: true, woff2: true, ttf: true, eot: true,
};

// Project pages served at clean URLs (e.g. /about renders about.html).
// The .html extension is also in STATIC_EXTENSIONS, so both forms work.
const PROJECT_PAGES: Record<string, string> = {
  '/about': '/about.html',
  '/stats': '/stats.html',
};

function hasStaticExtension(path: string): boolean {
  const last = path.split('/').pop() || '';
  const dot = last.lastIndexOf('.');
  if (dot === -1 || dot === 0) return false;
  return STATIC_EXTENSIONS[last.slice(dot + 1).toLowerCase()] === true;
}

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const path = url.pathname;
  const segments = path.split('/').filter(Boolean);

  // Project pages — serve the underlying .html content. Pages' pretty-URL
  // rewrite would 308 /about.html → /about; we follow the redirect once
  // transparently so the user lands on a 200.
  if (PROJECT_PAGES[path]) {
    const target = PROJECT_PAGES[path];
    let response = await context.env.ASSETS.fetch(
      new Request(new URL(target, context.request.url), context.request)
    );
    if (response.status === 308) {
      const loc = response.headers.get('Location') || target;
      response = await context.env.ASSETS.fetch(
        new Request(new URL(loc, context.request.url), context.request)
      );
    }
    return response;
  }

  // Static assets — short-circuit by fetching directly from the asset service.
  // Without this, the catch-all [code].ts would match paths like /about.html
  // and return 404 before ASSETS.fetch ever runs.
  if (hasStaticExtension(path)) {
    return context.env.ASSETS.fetch(context.request);
  }

  // /api/* — always allow.
  if (segments[0] === 'api') {
    return context.next();
  }

  // Root — static index, always allow.
  if (path === '/' || segments.length === 0) {
    return context.next();
  }

  // /{code}/+ — stats page route, always allow.
  if (segments.length === 2 && segments[1] === '+') {
    return context.next();
  }

  // Single-segment paths are candidate short codes; enforce the blocklist.
  if (segments.length === 1) {
    const code = segments[0];
    if (isReservedCode(code) || validateCode(code) === null) {
      return new Response('Invalid code', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  }

  return context.next();
};
