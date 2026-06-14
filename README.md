# go

A personal, self-hostable link shortener. Built on Cloudflare Pages + D1. No tracking, no accounts, no ads — just shorter URLs that you control.

## Project description

`go` is a polished, fast, single-purpose link shortener deployable to Cloudflare Pages with a custom domain. The frontend is plain HTML styled with Tailwind CSS (CDN, no build step) on a zinc/indigo palette that follows `prefers-color-scheme`. The API runs on Pages Functions (TypeScript), storage is D1 (Cloudflare's SQLite), and there is no auth, no analytics, no tracking — the whole product is one form and one stats page. Total cost at hobby scale: $0/month.

## Screenshot / mock

ASCII mock of the form page (light mode):

```
+--------------------------------------------+
|                                            |
|    Shorten a link                          |
|    No tracking. No accounts. Just shorter. |
|                                            |
|    [ https://example.com/very/long... ]    |
|    [ optional (custom code)              ] |
|    [ Shorten ]                             |
|                                            |
|    Self-hosted on Cloudflare · Source      |
+--------------------------------------------+
```

## Local development

```bash
npm install
npx wrangler d1 execute go-link-shortener-db --local --file=./schema.sql
npx wrangler pages dev ./
```

Open http://localhost:8788.

The local D1 instance lives at `.wrangler/state/v3/d1/`; the `--local` flag routes queries to it instead of Cloudflare's edge. Apply the schema *before* the first request — the `wrangler pages dev` server uses its own in-memory D1 instance and won't see schema changes made to a different D1 binding.

## Deploy

1. `npx wrangler login`
2. `npx wrangler d1 create go-link-shortener-db` — copy the `database_id` from the output into `wrangler.toml`.
3. `npx wrangler d1 execute go-link-shortener-db --remote --file=./schema.sql`
4. `npx wrangler pages deploy ./`
5. In the Cloudflare dashboard: **Pages → go-link-shortener → Custom domains → Set up a custom domain** → enter `go.yourdomain.com`.

Subsequent deploys: just `npx wrangler pages deploy ./` (or `npm run deploy`).

## Reserved-word blocklist

Reserved short codes live in [`functions/reserved.json`](functions/reserved.json). Edit the array, commit, and re-deploy. The list exists to keep internal paths (`/api`), future product surfaces (`/dashboard`, `/settings`), and common filenames (`/favicon.ico`, `/robots.txt`) from being claimed as short codes. Two structural rules also apply and live in the middleware:

**Why `about` is not in the list:** the project ships an `about.html` page. Cloudflare Pages auto-serves it at the clean URL `/about` (via the pretty-URL rewrite). If `about` were in the blocklist, the rewrite would 308 to `/about` and the middleware would 400 it. The middleware explicitly serves `/about` and `/stats` from their `.html` siblings so the clean URLs work; `about` is not available as a short code as a result.

## Why 302, not 301

Browsers cache `301 Moved Permanently` aggressively and stop hitting the server for that URL — so click counts would drift downward as caches propagate. `302 Found` is explicitly temporary; the browser re-requests the short URL every time, the redirect handler increments `clicks`, and the count stays accurate. For a link shortener whose primary user-visible metric is click count, `302` is the correct choice.

## Cost estimate

D1 free tier: 5M reads/day, 100k writes/day. Pages Functions free tier: 100k requests/day. Rate-limit table adds ~1 read + 1 write per `/api/create` request — it is **not** charged for redirects.

| Redirects/month | D1 reads (redirects) | D1 writes (redirects) | Cost |
|----------------|----------------------|------------------------|------|
| 0              | 0                    | 0                      | $0   |
| 1,000          | 1k                   | 1k                     | $0   |
| 100,000        | 100k                 | 100k                   | $0   |
| 1,000,000      | 1M (well under cap)  | 1M (well under cap)    | $0   |

All four rows sit comfortably inside the free tier; you'd need to push well past 3M redirects/month before writes become a concern.

## v2 candidates

- **Accounts / API keys** — currently anyone can shorten via `/api/create`. Token-gated creation would enable private teams and quotas.
- **Link expiry (TTL)** — auto-archive or 410 links after a chosen date.
- **QR code generation** — render a PNG/SVG alongside the short URL on `/+`.
- **Click analytics** — referrer, country (from `cf-ipcountry`), device class.
- **Webhooks on click** — POST to a user-supplied URL with click metadata.
- **Custom domains per user** — `go.alice.com` pointing at a user's links (route via Workers, not Pages).
- **Bulk import** — paste a CSV, get back a CSV of short URLs.

## Things that will break first

1. **`rate_limits` table bloat** — the cleanup `DELETE` runs in `waitUntil` on every create, so the table stays bounded; at >100 creates/sec the per-request `DELETE` starts to contend with inserts. Fix: move cleanup to a Cron Trigger (Workers free tier includes 5M cron invocations/month).
2. **D1 storage cap** — free tier caps at ~5GB total, ~10M rows per database. At 200 bytes/row that's ~500MB of links — a long way off, but worth knowing. Fix: archive links older than N months to R2.
3. **Pages Functions 100k requests/day** — once you cross it on a free plan, requests 500. Fix: upgrade to Workers Paid ($5/mo for 10M requests, no cold starts).
4. **Cold starts on rare short codes** — Workers/Pages Functions evict rarely-used isolates; the first click on a 6-month-old link pays a cold-start cost (~50–200ms). Fix: Workers Paid (no eviction) or pre-warm with a Cron Trigger.
5. **D1 writes are serialized globally** — for a single-instance write workload this is fine; if you ever shard, plan around it.
6. **Custom-code collisions at scale** — random 6-char codes give ~50B possibilities; the 6-char space is not the bottleneck. Custom-code races are handled by the `PRIMARY KEY` constraint (the loser of the race gets a 409).

## Color palette

- Background: `zinc-50` (light) / `zinc-950` (dark)
- Text: `zinc-900` (light) / `zinc-100` (dark)
- Accent: **indigo-500** (`#6366f1`) — calm, modern, works in both color schemes

## File tree


```
.
├── index.html              # the form
├── about.html              # 1-paragraph landing
├── stats.html              # standalone stats page template
├── favicon.svg             # link icon
├── functions/
│   ├── [code].ts           # GET /{code}  → 302 redirect + click increment
│   ├── [code]/+.ts         # GET /{code}/+ → stats page
│   ├── _middleware.ts      # reserved-word blocklist, project page proxy
│   ├── api/
│   │   ├── create.ts       # POST /api/create
│   │   └── stats/[code].ts # GET  /api/stats/{code}
│   ├── lib/validate.ts     # shared validation logic
│   ├── reserved.json       # reserved short codes
│   └── env.d.ts            # Env type augmentation
├── tests/validate.test.ts  # validation tests (no framework)
├── schema.sql              # D1 schema (idempotent — safe to re-run)
├── wrangler.toml
├── tsconfig.json
├── package.json
└── README.md
```

## Pages pretty-URL behavior

Cloudflare Pages automatically rewrites `/about.html` → `/about` and `/stats.html` → `/stats` with a `308 Permanent Redirect`. This is intentional Cloudflare behavior and is browser-transparent: a user clicking the form's "About" link follows one 308 and lands on a 200 with the page content. To disable pretty URLs in production, set `pages_build_output_dir` in `wrangler.toml` or use a `_redirects` file with explicit rules.
