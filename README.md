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

## Configure Newsletter Signup

Create `.env.local` from `.env.example` and set:

```bash
VITE_NEWSLETTER_ENDPOINT=https://your-newsletter-endpoint.example/subscribe
VITE_LEAD_ENDPOINT=https://your-lead-endpoint.example/inquiry
```

The frontend sends this JSON payload:

```json
{
  "email": "reader@example.com",
  "topics": ["ai-infrastructure", "cloud-cost"],
  "source": "racklion-on-prem-signal",
  "subscribedAt": "2026-04-25T12:00:00.000Z"
}
```

Use a serverless function, webhook, or backend to connect a newsletter provider. Do not call provider APIs directly from the browser if they require secret keys.

The consultation form sends this JSON payload:

```json
{
  "name": "Reader Name",
  "email": "reader@company.com",
  "company": "Company",
  "pressure": "cloud-cost",
  "message": "We need to decide whether this workload should stay in cloud.",
  "source": "racklion-consulting-inquiry",
  "submittedAt": "2026-04-25T12:00:00.000Z"
}
```

## Daily Cron

The workflow at `.github/workflows/daily-intel.yml` runs every day at `11:15 UTC` and commits an updated digest when content changes.

To run it manually after pushing to GitHub:

1. Open the repository on GitHub.
2. Go to Actions.
3. Select `Daily on-prem signal`.
4. Click `Run workflow`.
