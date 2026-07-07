# Racklion On-Prem Signal

A consumer-facing newsletter site for daily data-center, AI infrastructure, and cloud-pressure news. The scraper is tuned for stories that make readers reconsider whether everything should stay in public cloud: GPU scarcity, cloud pricing, egress, outages, latency, sovereignty, power, cooling, storage, servers, networking, and private-cloud operations.

## What It Does

- Shows a public-facing live brief of infrastructure signals.
- Uses focused static-friendly views: home, signals, about, consulting, and subscribe.
- Positions Racklion consulting around cloud exit math, on-prem readiness, hybrid architecture, and resilience strategy.
- Filters news by data centers, AI infrastructure, cloud cost, cloud risk, power and cooling, private cloud, servers, storage, networking, and security.
- Scores each story by its "on-prem pull" instead of generic popularity.
- Lets subscribers choose focus areas for the newsletter.
- Captures consultation inquiries through a dedicated lead form.
- Runs a daily GitHub Actions cron job that refreshes `public/data/newsletter-intel.json`.

The scraper uses RSS and Atom feeds because they are more stable and respectful than brittle page-level HTML scraping.

## Local Setup

```bash
npm install
npm run scrape
npm run dev
```

Open the local URL Vite prints. By default it is `http://127.0.0.1:5173/`, but Vite will pick the next available port if that is busy.

## Configure Sources

Edit `data/sources.json` to add or remove infrastructure sources.

Each source supports:

- `name`: display name.
- `homepage`: source website, also used for the favicon.
- `feedUrl`: RSS or Atom feed URL.
- `category`: broad source category.
- `focus`: internal hint for the scraper.
- `alwaysRelevant`: use only for sources that are already infrastructure-specific.
- `weight`: ranking multiplier.
- `tags`: topical hints used for scoring and filtering.

Run a dry scrape before committing source changes:

```bash
npm run scrape:dry
```

## Lead capture & subscriptions

Consultation leads and newsletter signups are captured by three Supabase Edge
Functions (`supabase/functions/consult`, `subscribe`, `confirm`) backed by two
RLS-locked tables (`supabase/migrations`). All validation and anti-bot logic
lives in the pure, unit-tested module `supabase/functions/_shared/core.mjs`
(`npm test` runs it).

Anti-bot: honeypot field + submit timing + Cloudflare Turnstile + Postgres rate
limiting (per-IP for consult; a per-email confirmation cooldown for subscribe).
Newsletter uses double opt-in; consultation leads notify `consult@racklion.com`
via Resend. Secrets are server-only (see `.env.example`).

The frontend reads three public vars — `VITE_CONSULT_ENDPOINT`,
`VITE_SUBSCRIBE_ENDPOINT`, `VITE_TURNSTILE_SITE_KEY`. Server secrets are set
with `supabase secrets set` and never reach the browser.

Local dev uses Cloudflare's always-pass Turnstile test keys (site
`1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).

## Daily Cron

The workflow at `.github/workflows/daily-intel.yml` runs every day at `11:15 UTC` and commits an updated digest when content changes.

To run it manually after pushing to GitHub:

1. Open the repository on GitHub.
2. Go to Actions.
3. Select `Daily on-prem signal`.
4. Click `Run workflow`.

## Build & SEO

`npm run build` runs, in order:

1. `vite build` — bundles the app into `dist/`.
2. `node scripts/prerender.mjs` — writes a crawlable, text-complete HTML file per route (`/`, `/signals`, `/source`, `/consulting`, `/about`, `/faq`, `/subscribe`) with a per-page `<title>`, meta description, canonical, Open Graph/Twitter tags, and JSON-LD injected. This is what lets AI answer-engines and search crawlers (which do not run JavaScript) read the content.
3. `node scripts/gen-sitemap.mjs` — writes `dist/sitemap.xml` from the route model.
4. `node scripts/verify-build.mjs` — fails the build (non-zero exit) if any page is missing its content or SEO tags.

Routes and the production origin (`SITE_URL`) are defined once in `src/routes.js`. Per-page titles, descriptions, and JSON-LD live in `src/seo.js`. The view renderers are isomorphic (`src/render.js`) — shared by the browser app and the prerender step, so on-page and prerendered markup never drift.

`public/robots.txt` explicitly allows AI crawlers (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended) and points to the sitemap; `public/llms.txt` summarizes the site for them. `vercel.json` enables clean URLs and an SPA fallback for deep links.

Run the unit tests: `npm test` (`node --test`).
