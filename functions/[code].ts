// GET /{code} → 302 redirect to the stored URL.
// Click counter is incremented asynchronously via waitUntil so the redirect
// is not held back by the write.

import { isReservedCode, validateCode } from './lib/validate';

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en" class="bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Link not found — go</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif; }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center px-4">
  <main class="max-w-md w-full text-center">
    <h1 class="text-3xl font-bold tracking-tight">Link not found</h1>
    <p class="mt-3 text-zinc-500 dark:text-zinc-400">This short code isn't in the database. It may have been mistyped, or the link never existed.</p>
    <a href="/" class="inline-block mt-8 text-indigo-500 hover:text-indigo-600 font-medium">Shorten a link →</a>
  </main>
</body>
</html>`;

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const code = context.params.code as string;

  // Defense in depth: middleware already filters these, but a stray direct
  // invocation (e.g. local wrangler tweak) should still not error.
  if (isReservedCode(code) || validateCode(code) === null) {
    return new Response(NOT_FOUND_HTML, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const row = await context.env.DB.prepare(
    'SELECT url FROM links WHERE code = ?'
  )
    .bind(code)
    .first<{ url: string }>();

  if (!row) {
    return new Response(NOT_FOUND_HTML, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Fire-and-forget click increment. The redirect flies immediately.
  context.waitUntil(
    context.env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE code = ?')
      .bind(code)
      .run()
  );

  return Response.redirect(row.url, 302);
};
