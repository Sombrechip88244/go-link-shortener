// GET /{code}/+ — stats page. The HTML is inlined in the Function (no
// template engine, no build step). The JS in the page reads the code from
// window.location.pathname, fetches /api/stats/{code}, and renders the
// result. On 404 or network error, a friendly empty state is shown.

const PAGE = `<!doctype html>
<html lang="en" class="bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Link stats — go</title>
  <script>
    tailwind.config = { darkMode: 'media' };
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif; }
  </style>
</head>
<body class="min-h-screen">
  <main class="mx-auto max-w-[600px] px-4 pt-16 pb-24">
    <div class="mb-6">
      <a href="/" class="text-sm text-zinc-500 dark:text-zinc-400 hover:text-indigo-500">← Shorten a link</a>
    </div>
    <div id="content">
      <p class="text-zinc-500 dark:text-zinc-400">Loading…</p>
    </div>
  </main>
  <script>
    (async () => {
      const content = document.getElementById('content');
      const path = window.location.pathname;
      const code = path.split('/').filter(Boolean)[0] || '';

      if (!code) {
        content.innerHTML = '<p class="text-zinc-500 dark:text-zinc-400">No code provided.</p>';
        return;
      }

      let data;
      try {
        const res = await fetch('/api/stats/' + encodeURIComponent(code));
        if (res.status === 404) {
          content.innerHTML = [
            '<h1 class="text-3xl font-bold tracking-tight">Link not found</h1>',
            '<p class="mt-3 text-zinc-500 dark:text-zinc-400">This short code isn\\'t in the database.</p>',
            '<a href="/" class="inline-block mt-8 text-indigo-500 hover:text-indigo-600 font-medium">Shorten a link →</a>'
          ].join('');
          return;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        data = await res.json();
      } catch (err) {
        content.innerHTML = [
          '<h1 class="text-3xl font-bold tracking-tight">Something went wrong</h1>',
          '<p class="mt-3 text-zinc-500 dark:text-zinc-400">We couldn\\'t load the stats. Try again.</p>',
          '<a href="/" class="inline-block mt-8 text-indigo-500 hover:text-indigo-600 font-medium">Shorten a link →</a>'
        ].join('');
        return;
      }

      const created = new Date(data.created_at * 1000);
      const createdStr = created.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      content.innerHTML = [
        '<h1 class="text-3xl font-bold tracking-tight">' + escapeHtml(data.code) + '</h1>',
        '<div class="mt-8 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">',
        '  <div class="flex items-center justify-between gap-3">',
        '    <code class="font-mono text-base text-indigo-600 dark:text-indigo-400 break-all" id="short-url">' + escapeHtml(data.short) + '</code>',
        '    <button id="copy" type="button" class="shrink-0 px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Copy</button>',
        '  </div>',
        '</div>',
        '<dl class="mt-6 space-y-4">',
        '  <div>',
        '    <dt class="text-sm text-zinc-500 dark:text-zinc-400">Original</dt>',
        '    <dd class="mt-1 break-all"><a href="' + escapeHtml(data.url) + '" class="text-indigo-500 hover:text-indigo-600" rel="noopener noreferrer">' + escapeHtml(data.url) + '</a></dd>',
        '  </div>',
        '  <div>',
        '    <dt class="text-sm text-zinc-500 dark:text-zinc-400">Clicks</dt>',
        '    <dd class="mt-1 text-2xl font-semibold">' + data.clicks + '</dd>',
        '  </div>',
        '  <div>',
        '    <dt class="text-sm text-zinc-500 dark:text-zinc-400">Created</dt>',
        '    <dd class="mt-1">' + createdStr + '</dd>',
        '  </div>',
        '</dl>'
      ].join('\\n');

      const btn = document.getElementById('copy');
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(data.short);
          const original = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = original; }, 1500);
        } catch (err) {
          btn.textContent = 'Failed';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        }
      });
    })();

    function escapeHtml(s) {
      return String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }
  </script>
</body>
</html>`;

export const onRequest: PagesFunction = async () => {
  return new Response(PAGE, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
