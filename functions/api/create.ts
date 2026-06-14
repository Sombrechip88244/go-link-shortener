// POST /api/create — shortens a URL, optionally with a caller-chosen code.
// Rate-limited per IP via a D1 counter table. Accepts JSON or form-encoded
// bodies. Returns JSON when the request prefers application/json, otherwise
// plain text (so no-JS form submissions get a usable response).

import {
  generateCode,
  isReservedCode,
  validateCode,
  validateUrl,
} from '../lib/validate';

const RATE_LIMIT_HOUR = 30;
const RATE_LIMIT_MINUTE = 5;

type CreateResponse = {
  short: string;
  code: string;
  clicks: number;
  error?: string;
};

function json(body: CreateResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function plain(text: string, status: number): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const ip =
    context.request.headers.get('cf-connecting-ip') ||
    context.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    '127.0.0.1';

  // Rate limit: 5/min and 30/hour per IP.
  const now = Math.floor(Date.now() / 1000);
  const minuteAgo = now - 60;
  const hourAgo = now - 3600;

  const minuteCount = await context.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM rate_limits WHERE ip = ? AND created_at > ?'
  )
    .bind(ip, minuteAgo)
    .first<{ n: number }>();

  if (minuteCount && minuteCount.n >= RATE_LIMIT_MINUTE) {
    return new Response('Rate limit exceeded. Try again in a minute.', {
      status: 429,
    });
  }

  const hourCount = await context.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM rate_limits WHERE ip = ? AND created_at > ?'
  )
    .bind(ip, hourAgo)
    .first<{ n: number }>();

  if (hourCount && hourCount.n >= RATE_LIMIT_HOUR) {
    return new Response('Rate limit exceeded. Try again later.', {
      status: 429,
    });
  }

  // Parse body.
  const contentType = context.request.headers.get('content-type') || '';
  let rawUrl = '';
  let rawCode: string | null = null;

  if (contentType.includes('application/json')) {
    const body = (await context.request.json().catch(() => ({}))) as {
      url?: string;
      code?: string;
    };
    rawUrl = (body.url ?? '').toString();
    rawCode = body.code != null ? body.code.toString() : null;
  } else {
    const form = await context.request.formData().catch(() => null);
    if (form) {
      rawUrl = (form.get('url') ?? '').toString();
      const c = form.get('code');
      rawCode = c != null ? c.toString() : null;
    }
  }

  const accept = context.request.headers.get('accept') || '';
  const wantsJson = accept.includes('application/json');

  // Validate URL.
  const url = validateUrl(rawUrl);
  if (!url) {
    const body: CreateResponse = {
      short: '',
      code: '',
      clicks: 0,
      error: "That URL doesn't look right.",
    };
    return wantsJson ? json(body, 400) : plain(body.error!, 400);
  }

  // Validate custom code (if provided).
  let code: string | null = null;
  if (rawCode && rawCode.trim()) {
    const validated = validateCode(rawCode);
    if (!validated) {
      const body: CreateResponse = {
        short: '',
        code: '',
        clicks: 0,
        error: 'Code must be 1-32 letters, numbers, hyphens, or underscores.',
      };
      return wantsJson ? json(body, 400) : plain(body.error!, 400);
    }
    if (isReservedCode(validated)) {
      const body: CreateResponse = {
        short: '',
        code: '',
        clicks: 0,
        error: 'That code is reserved.',
      };
      return wantsJson ? json(body, 400) : plain(body.error!, 400);
    }
    code = validated;
  }

  // Insert. If a custom code was provided, attempt once; on UNIQUE, surface 409.
  // Otherwise, retry up to 5 times on random generation.
  const db = context.env.DB;
  const origin = new URL(context.request.url).origin;

  if (code) {
    try {
      await db
        .prepare('INSERT INTO links (code, url) VALUES (?, ?)')
        .bind(code, url)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('PRIMARY')) {
        const body: CreateResponse = {
          short: '',
          code: '',
          clicks: 0,
          error: 'That code is already taken.',
        };
        return wantsJson ? json(body, 409) : plain(body.error!, 409);
      }
      throw err;
    }
  } else {
    let inserted = false;
    for (let i = 0; i < 5; i++) {
      const candidate = generateCode();
      try {
        await db
          .prepare('INSERT INTO links (code, url) VALUES (?, ?)')
          .bind(candidate, url)
          .run();
        code = candidate;
        inserted = true;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') || msg.includes('PRIMARY')) continue;
        throw err;
      }
    }
    if (!inserted) {
      const body: CreateResponse = {
        short: '',
        code: '',
        clicks: 0,
        error: 'Could not generate a unique code. Try again.',
      };
      return wantsJson ? json(body, 500) : plain(body.error!, 500);
    }
  }

  // Record this rate-limit hit + cleanup >24h old rows.
  context.waitUntil(
    Promise.all([
      db.prepare('INSERT INTO rate_limits (ip, created_at) VALUES (?, ?)')
        .bind(ip, now)
        .run(),
      db.prepare('DELETE FROM rate_limits WHERE created_at < ?')
        .bind(now - 86400)
        .run(),
    ])
  );

  const short = `${origin}/${code}`;
  const body: CreateResponse = { short, code: code!, clicks: 0 };
  return wantsJson
    ? json(body, 201)
    : plain(short, 201);
};
