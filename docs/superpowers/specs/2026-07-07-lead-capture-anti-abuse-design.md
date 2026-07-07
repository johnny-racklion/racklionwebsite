# Lead Capture, Subscription & Anti-Abuse — Design Spec

**Date:** 2026-07-07
**Status:** Draft for review
**Depends on:** the SEO/content-funnel branch (`feat/seo-content-funnel`) — the consultation and subscribe forms live in `src/render.js`; the submit handlers (`submitLead`, `submitSubscription`) live in `src/main.js`.

## 1. Overview

Today the site's two forms — the **consultation lead** form and the **newsletter subscribe** form — POST JSON to unconfigured endpoints (`VITE_LEAD_ENDPOINT`, `VITE_NEWSLETTER_ENDPOINT`) and, when unset, only save to `localStorage`. There is no datastore, no notification, and no abuse protection.

This spec designs the backend behind those forms: a store Racklion owns, a capture endpoint, a layered anti-bot defense, newsletter double opt-in, and instant lead notifications.

### Goals
- Reliably capture consultation leads and newsletter subscribers into a store Racklion owns.
- Notify the sales team the moment a consultation lead arrives.
- Keep bots and junk off both the lead flow and the subscriber list without adding meaningful friction for real users.
- Keep the implementation portable (no host lock-in) and secrets out of the browser.

### Non-goals (explicitly deferred)
- Selecting/operating an ESP for **sending** the newsletter (deliverability, campaigns, unsubscribe UI at scale). This build only *collects and confirms* subscribers.
- Syncing contacts into **Koffey.ai**. The store is designed so this is an additive downstream step.
- A team-facing admin UI. Leads are read in Supabase / via the notification email; subscribers in Supabase.

## 2. Locked decisions

- **System of record:** Supabase Postgres (Racklion project). Racklion owns the data.
- **Domain:** `racklion.com` (also the value for `SITE_URL` in `src/routes.js`).
- **Lead notification target:** a single group address, `consult@racklion.com`, whose recipients are managed in Racklion's Google Workspace (not in code).
- **Transactional email provider:** Resend (free tier covers current volume) — used for both lead notifications and subscriber opt-in confirmations.
- **Anti-bot:** honeypot + submit-timing + Cloudflare Turnstile + server-side rate limiting.
- **Newsletter:** double opt-in (pending → confirmed).
- **Consultation leads:** single opt-in (no confirmation friction on a sales inquiry).
- **Secrets never in the browser:** `service_role` key, Turnstile secret, Resend key are server-only.

## 3. Architecture

```
Browser form ──POST──► Capture endpoint (Supabase Edge Function, Deno)
   │  honeypot,             │ 1. anti-bot gate (honeypot, timing, Turnstile verify)
   │  timing, Turnstile     │ 2. validate payload (server-side)
   │  token                 │ 3. rate-limit (Postgres, per IP + per email)
   │                        │ 4. write row (service role, RLS-bypassing)
   │                        │ 5a. lead  → Resend email to consult@racklion.com
   │                        │ 5b. sub   → Resend opt-in email w/ confirm link
   ▼                        ▼
 UI state              Supabase Postgres  ◄── GET /confirm?token=…  (double opt-in)
```

The **core logic** (validation, anti-bot checks, token generation/verification, rate-limit query building) is factored into a **pure, host-agnostic module** with no network or platform imports, so it is unit-testable and portable off Supabase Edge if ever needed. The edge functions are thin adapters around it.

### 3.1 Endpoints
Deployed as Supabase Edge Functions (Deno). Custom domain optional; default `https://<project>.functions.supabase.co/…`.

- `POST /consult` — consultation lead. Anti-bot + validate + rate-limit + insert + notify. Returns `{ ok: true }` on success.
- `POST /subscribe` — newsletter signup. Anti-bot + validate + rate-limit + upsert as `pending` + send confirmation email. Returns `{ ok: true, pending: true }`.
- `GET /confirm?token=…` — confirmation link target. Verifies token, sets `status = confirmed`, redirects to a `racklion.com/subscribed` thank-you page (or renders a minimal confirmation).

CORS: each function allows the `https://racklion.com` origin (and the preview origin) for `POST`/`GET` as appropriate.

## 4. Data model (Supabase Postgres)

Two tables. **RLS enabled on both, with no anon/public policies** — all writes go through the edge functions using the service role. The browser's anon key cannot read or write these tables. This is the single most important abuse control.

### `consultation_leads`
| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| name | text not null | |
| email | text not null | work email |
| company | text | |
| pressure | text | one of the form's pressure values |
| message | text not null | |
| source | text | e.g. `racklion-consulting-inquiry` |
| created_at | timestamptz default now() | |
| ip | inet | captured server-side |
| user_agent | text | |
| consent_at | timestamptz | set when submitted |

### `newsletter_subscribers`
| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| email | text not null **unique (citext or lower())** | dedupe key |
| topics | text[] | selected focus areas |
| source | text | e.g. `racklion-on-prem-signal` |
| status | text not null default `'pending'` | `pending` \| `confirmed` \| `unsubscribed` |
| confirm_token | text | random, single-use; null after confirm |
| confirm_expires_at | timestamptz | pending rows expire (e.g. 72h) |
| created_at | timestamptz default now() | |
| confirmed_at | timestamptz | |
| ip | inet | |

- Re-subscribing an existing `pending` email re-issues a token rather than creating a duplicate (upsert on email).
- Re-subscribing a `confirmed` email is a no-op success (no second confirmation email).
- A scheduled job (Supabase `pg_cron`, consistent with the platform-independence preference) purges `pending` rows past `confirm_expires_at`.

## 5. Anti-bot layer

Enforced entirely server-side; the browser is never trusted.

1. **Honeypot field** — a visually hidden input (e.g. `company_url`) present in both forms. Any non-empty value ⇒ silently accept-and-drop: return `200 { ok: true }` so bots get no signal, but write nothing.
2. **Submit timing** — the form embeds a `rendered_at` timestamp (or the server issues a nonce with a timestamp). Submissions faster than a threshold (~2.5s) are treated as bots ⇒ same silent drop.
3. **Cloudflare Turnstile** — invisible/managed widget. Frontend gets a token; the endpoint verifies it against Turnstile's `siteverify` with the secret key. Failure ⇒ `400`.
4. **Rate limiting (Postgres)** — before insert, count recent submissions from the same IP and same email within a window (e.g. ≤ 5 / 10 min / IP; ≤ 3 / hour / email). Over limit ⇒ `429`. Implemented as a small SQL count over the target table's `created_at` + `ip` (no external Redis, staying in Supabase).
5. **Double opt-in (newsletter only)** — even a bot that passes 1–4 cannot land on the real list without controlling the target inbox and clicking the confirm link.

## 6. Newsletter double opt-in flow

1. `POST /subscribe` validates, passes anti-bot, upserts row `status=pending` with a fresh random `confirm_token` (32+ bytes, URL-safe) and `confirm_expires_at = now() + 72h`.
2. Resend sends a confirmation email from a verified `racklion.com` sender (e.g. `noreply@racklion.com`) containing `https://racklion.com/confirm?token=…` (routed to the `/confirm` function, or a static page that calls it).
3. `GET /confirm?token=…` looks up the row by token; if found and unexpired, sets `status=confirmed`, `confirmed_at=now()`, clears `confirm_token`; redirects to a thank-you state. If missing/expired ⇒ friendly "link expired, resubscribe" page.
4. `pg_cron` purges expired `pending` rows.

## 7. Lead notification

On a successful `consultation_leads` insert, the `/consult` function calls Resend to send one email:
- **To:** `consult@racklion.com` (group; recipients managed in Google Workspace).
- **From:** a verified `racklion.com` sender (e.g. `notifications@racklion.com`).
- **Reply-To:** the lead's email, so a rep can reply directly.
- **Body:** name, company, work email, pressure, message, timestamp.

The Google Group must be configured to **accept mail from external/automated senders**, or the notification will bounce.

## 8. Frontend changes

In `src/render.js` (forms) and `src/main.js` (`submitLead`, `submitSubscription`):
- Add the **honeypot** field (hidden via CSS) to both forms.
- Stamp a **`rendered_at`** value when the form renders; include it in the payload.
- Add the **Turnstile** widget to both forms; include its token in the payload. (`VITE_TURNSTILE_SITE_KEY` is public.)
- Point `VITE_LEAD_ENDPOINT` / `VITE_NEWSLETTER_ENDPOINT` (rename to `VITE_CONSULT_ENDPOINT` / `VITE_SUBSCRIBE_ENDPOINT` for clarity) at the edge functions.
- Handle new UI states: subscribe now shows **"Check your email to confirm"** (pending), not "subscribed"; consult shows sent/error as today.
- Add a short **consent line** under the subscribe form; the server records `consent_at`.
- Keep the existing `localStorage` "preview" fallback only for local dev when endpoints are unset.

## 9. Secrets & environment

| name | scope | purpose |
|---|---|---|
| `VITE_CONSULT_ENDPOINT` | browser (public) | consult function URL |
| `VITE_SUBSCRIBE_ENDPOINT` | browser (public) | subscribe function URL |
| `VITE_TURNSTILE_SITE_KEY` | browser (public) | Turnstile widget |
| `SUPABASE_URL` | server | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server (**secret**) | RLS-bypassing writes |
| `TURNSTILE_SECRET_KEY` | server (**secret**) | Turnstile verify |
| `RESEND_API_KEY` | server (**secret**) | send email |
| `CONSULT_NOTIFY_TO` | server | `consult@racklion.com` |
| `CONFIRM_BASE_URL` | server | `https://racklion.com` |

Server secrets are set via `supabase secrets set` and never committed or exposed to the browser.

## 10. Error handling & edge cases

- **Honeypot / timing fail:** silent `200 { ok: true }`, no write (deny bots any signal).
- **Turnstile fail:** `400 { ok: false, error: 'verification' }`; UI asks to retry.
- **Validation fail:** `400` with field-level message; UI highlights.
- **Rate limited:** `429`; UI shows "please slow down / try again shortly."
- **DB or email failure:** `500`, logged; the row write and the email are ordered so a notification/confirmation failure does not lose the captured row (write first, then send; a send failure is logged and retried out of band, not surfaced as data loss).
- **Duplicate subscribe:** `pending` → re-issue token & resend; `confirmed` → silent success.
- **Confirm token missing/expired:** friendly resubscribe page.

## 11. Testing strategy

- **Unit (`node --test`, matching the repo):** the pure core module — payload validation, honeypot/timing checks, token generate/verify, rate-limit query construction, notification-body formatting. No network.
- **Integration:** edge-function handlers with Supabase and Resend mocked/stubbed — assert correct status codes for each anti-bot and validation branch, and that a valid submit writes the row and triggers the right email.
- **Manual smoke:** submit both forms in a preview deploy; confirm a lead email arrives at `consult@racklion.com`, a subscriber receives + can click the confirm link, and honeypot/timing/rate-limit paths reject.

## 12. Deployment & Supabase access

- Schema is versioned as SQL **migrations** in the repo; applied with `supabase db push`.
- Edge functions live in the repo; deployed with `supabase functions deploy`.
- Secrets set by the owner via `supabase secrets set` (values never handled by the assistant).
- Access path: owner runs `supabase login` + `supabase link --project-ref <ref>` (CLI), **or** connects the Supabase MCP for assistant-driven migration. Either way, the assistant authors code/migrations; the owner holds auth and secret values.
- `pg_cron` schedules the expired-pending purge.

## 13. Open items to confirm at review
- Turnstile vs. hCaptcha (spec assumes **Turnstile** — free, privacy-friendly). 
- Confirmation link UX: dedicated `/confirmed` page vs. inline function-rendered page (spec assumes a `racklion.com/subscribed` thank-you route).
- Whether to *also* send lead notifications to a Slack channel (spec leaves this as an optional add-on; default is email-only to the group).
