// GET /api/stats/{code} — public stats for a single short code.

type StatsRow = {
  code: string;
  url: string;
  clicks: number;
  created_at: number;
};

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const code = context.params.code as string;
  const row = await context.env.DB.prepare(
    'SELECT code, url, clicks, created_at FROM links WHERE code = ?'
  )
    .bind(code)
    .first<StatsRow>();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Link not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const origin = new URL(context.request.url).origin;
  return new Response(
    JSON.stringify({
      code: row.code,
      url: row.url,
      clicks: row.clicks,
      created_at: row.created_at,
      short: `${origin}/${row.code}`,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
