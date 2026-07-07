# Lead Capture, Subscription & Anti-Abuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture consultation leads and newsletter subscribers into a Supabase store Racklion owns, with layered anti-bot defense, newsletter double opt-in, and instant lead notifications to `consult@racklion.com`.

**Architecture:** A dependency-free, isomorphic core module (Node 22 + Deno, Web-standard globals only) holds all validation, anti-bot, token, and formatting logic and is unit-tested with `node --test`. Three Supabase Edge Functions (Deno) are thin adapters around that core, doing the network/DB I/O. The browser forms add a honeypot, a submit-timing stamp, and a Cloudflare Turnstile token; all enforcement happens server-side. Row-Level Security with no anon policies means only the functions (service role) can write.

**Tech Stack:** Vite (existing frontend), Node 22 `node --test`, Supabase Postgres + Edge Functions (Deno), Cloudflare Turnstile, Resend (transactional email), `pg_cron`.

## Global Constraints

- **System of record:** Supabase Postgres. Racklion owns the data.
- **Domain:** `racklion.com`; this is also the value of `SITE_URL` in `src/routes.js`.
- **Lead notification target:** single group address `consult@racklion.com` (recipients managed in Google Workspace, never in code).
- **Email provider:** Resend, for both lead notifications and opt-in confirmations.
- **Anti-bot:** honeypot field `company_url` + submit-timing (min 2500 ms) + Cloudflare Turnstile (verified server-side) + Postgres rate limiting (≤5/10 min per IP for consult; ≤3/hour per email for subscribe).
- **Newsletter:** double opt-in (`pending` → `confirmed`); confirm token 32 random bytes, base64url; pending rows expire after 72h and are purged by `pg_cron`.
- **Consultation leads:** single opt-in (no confirmation email to the lead).
- **Secrets never reach the browser:** `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY` are server-only. Only `VITE_*` values (endpoint URLs, Turnstile **site** key) are public.
- **`src/render.js` stays pure/isomorphic** (no `window`/`document`/`localStorage`/`Date.now()`/CSS import). Time-sensitive values (`rendered_at`) and env values (Turnstile site key) are passed in via the `state`/ctx object; `main.js` supplies them.
- **No new frontend build dependencies.** Tests use `node --test`.
- **Turnstile test keys for local/dev** (Cloudflare-provided, always-pass): site key `1x00000000000000000000AA`, secret key `1x0000000000000000000000000000000AA`. Real keys are set at provisioning.

---

## File Structure

**New (backend):**
- `supabase/functions/_shared/core.mjs` — pure logic (validation, honeypot, timing, token, expiry, rate-limit predicate, email/URL formatting). Node- and Deno-importable. **The only backend file with unit tests.**
- `supabase/functions/_shared/http.ts` — CORS + JSON `Response` helpers (Deno).
- `supabase/functions/_shared/turnstile.ts` — `verifyTurnstile()` (Deno, network).
- `supabase/functions/_shared/email.ts` — `sendEmail()` via Resend (Deno, network).
- `supabase/functions/_shared/db.ts` — Supabase service-role client factory (Deno).
- `supabase/functions/consult/index.ts` — consultation lead handler.
- `supabase/functions/subscribe/index.ts` — newsletter signup handler.
- `supabase/functions/confirm/index.ts` — double opt-in confirmation handler.
- `supabase/migrations/20260707000000_lead_capture.sql` — tables, RLS, indexes.
- `supabase/migrations/20260707000100_pending_purge_cron.sql` — `pg_cron` purge job.
- `test/lead-core.test.mjs` — `node --test` for `core.mjs`.

**Modified (frontend):**
- `src/render.js` — add honeypot, `rendered_at` hidden input, Turnstile widget container to both forms (values injected via ctx).
- `src/main.js` — supply `turnstileSiteKey` + stamp `rendered_at` after render; read Turnstile token; rename endpoint env vars; handle subscribe `pending` UI state.
- `src/styles.css` — visually hide the honeypot field.
- `index.html` — load the Turnstile script.
- `.env.example` — new env var names.
- `README.md` — document the capture backend + local dev with test keys.

---

## Task 1: Pure core module + unit tests

**Files:**
- Create: `supabase/functions/_shared/core.mjs`
- Create: `test/lead-core.test.mjs`

**Interfaces:**
- Produces:
  - `PRESSURE_VALUES: string[]`
  - `checkHoneypot(payload): {ok:boolean}`
  - `checkTiming(payload, now:number, minMs=2500): {ok:boolean}`
  - `validateConsult(payload): {ok, errors, value:{name,email,message,pressure,company,source}}`
  - `validateSubscribe(payload): {ok, errors, value:{email,topics,source}}`
  - `generateToken(bytes=32): string` (base64url)
  - `isExpired(expiresAtIso:string, now:number): boolean`
  - `overRateLimit(recentCount:number, limit:number): boolean`
  - `buildConfirmUrl(baseUrl:string, token:string): string`
  - `formatLeadEmail(lead): {subject:string, text:string}`

- [ ] **Step 1: Write the failing test**

```js
// test/lead-core.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESSURE_VALUES, checkHoneypot, checkTiming, validateConsult, validateSubscribe,
  generateToken, isExpired, overRateLimit, buildConfirmUrl, formatLeadEmail
} from '../supabase/functions/_shared/core.mjs';

test('honeypot: empty passes, filled fails', () => {
  assert.equal(checkHoneypot({ company_url: '' }).ok, true);
  assert.equal(checkHoneypot({}).ok, true);
  assert.equal(checkHoneypot({ company_url: 'http://x' }).ok, false);
});

test('timing: too fast fails, slow enough passes, missing fails', () => {
  const now = 1_000_000;
  assert.equal(checkTiming({ rendered_at: now - 1000 }, now).ok, false);
  assert.equal(checkTiming({ rendered_at: now - 3000 }, now).ok, true);
  assert.equal(checkTiming({}, now).ok, false);
});

test('validateConsult: valid payload', () => {
  const r = validateConsult({ name: 'Jo', email: 'jo@co.com', message: 'hi', pressure: 'cloud-cost' });
  assert.equal(r.ok, true);
  assert.equal(r.value.source, 'racklion-consulting-inquiry');
});

test('validateConsult: bad email + missing fields + bad pressure', () => {
  const r = validateConsult({ name: '', email: 'nope', message: '', pressure: 'wat' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'message', 'name', 'pressure']);
});

test('validateSubscribe: lowercases email, defaults topics/source', () => {
  const r = validateSubscribe({ email: 'A@B.com' });
  assert.equal(r.ok, true);
  assert.equal(r.value.email, 'a@b.com');
  assert.deepEqual(r.value.topics, []);
  assert.equal(r.value.source, 'racklion-on-prem-signal');
});

test('generateToken: urlsafe, right-ish length, unique', () => {
  const a = generateToken();
  const b = generateToken();
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 40);
  assert.notEqual(a, b);
});

test('isExpired', () => {
  const now = Date.parse('2026-07-07T12:00:00Z');
  assert.equal(isExpired('2026-07-07T11:00:00Z', now), true);
  assert.equal(isExpired('2026-07-07T13:00:00Z', now), false);
  assert.equal(isExpired('garbage', now), true);
});

test('overRateLimit', () => {
  assert.equal(overRateLimit(5, 5), true);
  assert.equal(overRateLimit(4, 5), false);
});

test('buildConfirmUrl strips trailing slash and encodes token', () => {
  assert.equal(buildConfirmUrl('https://racklion.com/', 'a b'), 'https://racklion.com/confirm?token=a%20b');
});

test('formatLeadEmail includes name, email, message', () => {
  const m = formatLeadEmail({ name: 'Jo', company: 'Co', email: 'jo@co.com', pressure: 'cloud-cost', message: 'need racks' });
  assert.match(m.subject, /Jo/);
  assert.match(m.text, /jo@co\.com/);
  assert.match(m.text, /need racks/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lead-core.test.mjs`
Expected: FAIL — `Cannot find module '../supabase/functions/_shared/core.mjs'`.

- [ ] **Step 3: Write the core module**

```js
// supabase/functions/_shared/core.mjs
// Pure, isomorphic lead-capture logic. Node 22 + Deno. No platform or network
// imports; only Web-standard globals (crypto.getRandomValues, btoa, Date.parse).
// Time is always passed in as `now` (ms) so behavior is deterministic and testable.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PRESSURE_VALUES = ['cloud-cost', 'ai-compute', 'resilience', 'sovereignty', 'private-cloud'];

export function checkHoneypot(payload) {
  return { ok: !payload || !String(payload.company_url ?? '').trim() };
}

export function checkTiming(payload, now, minMs = 2500) {
  const t = Number(payload?.rendered_at);
  if (!Number.isFinite(t)) return { ok: false };
  return { ok: now - t >= minMs };
}

export function validateConsult(payload) {
  const errors = {};
  const name = String(payload?.name ?? '').trim();
  const email = String(payload?.email ?? '').trim();
  const message = String(payload?.message ?? '').trim();
  const pressure = String(payload?.pressure ?? '').trim();
  if (name.length < 1) errors.name = 'required';
  if (!EMAIL_RE.test(email)) errors.email = 'invalid';
  if (message.length < 1) errors.message = 'required';
  if (pressure && !PRESSURE_VALUES.includes(pressure)) errors.pressure = 'invalid';
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      name,
      email,
      message,
      pressure,
      company: String(payload?.company ?? '').trim(),
      source: String(payload?.source ?? 'racklion-consulting-inquiry')
    }
  };
}

export function validateSubscribe(payload) {
  const errors = {};
  const email = String(payload?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) errors.email = 'invalid';
  const topics = Array.isArray(payload?.topics) ? payload.topics.map((t) => String(t)) : [];
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { email, topics, source: String(payload?.source ?? 'racklion-on-prem-signal') }
  };
}

export function generateToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isExpired(expiresAtIso, now) {
  const t = Date.parse(expiresAtIso);
  return !Number.isFinite(t) || now >= t;
}

export function overRateLimit(recentCount, limit) {
  return recentCount >= limit;
}

export function buildConfirmUrl(baseUrl, token) {
  const base = String(baseUrl).replace(/\/+$/, '');
  return `${base}/confirm?token=${encodeURIComponent(token)}`;
}

export function formatLeadEmail(lead) {
  const text = [
    `New consultation request from ${lead.name}${lead.company ? ` (${lead.company})` : ''}`,
    '',
    `Email:    ${lead.email}`,
    `Pressure: ${lead.pressure || '—'}`,
    '',
    lead.message
  ].join('\n');
  return {
    subject: `Racklion consult: ${lead.name}${lead.company ? ` · ${lead.company}` : ''}`,
    text
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lead-core.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/core.mjs test/lead-core.test.mjs
git commit -m "feat: pure isomorphic lead-capture core with unit tests"
```

---

## Task 2: Database migrations

**Files:**
- Create: `supabase/migrations/20260707000000_lead_capture.sql`
- Create: `supabase/migrations/20260707000100_pending_purge_cron.sql`

**Interfaces:**
- Produces tables `public.consultation_leads` and `public.newsletter_subscribers` with the columns the handlers in Task 4 insert/select, RLS enabled with no anon/authenticated policies, a unique index on `lower(email)` for subscribers, and a `confirm_token` index.

> These are applied against the live project in Task 7 (needs the linked Supabase project). Verification here is a careful read plus, if the Supabase CLI + Docker are available locally, `supabase db reset` against the local stack. Do not block on Docker.

- [ ] **Step 1: Write the schema migration**

```sql
-- supabase/migrations/20260707000000_lead_capture.sql

create table if not exists public.consultation_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  pressure text,
  message text not null,
  source text,
  created_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  consent_at timestamptz
);

alter table public.consultation_leads enable row level security;
-- Intentionally NO policies: anon/authenticated cannot read or write.
-- Only the service role (used by the edge functions) bypasses RLS.

create index if not exists consultation_leads_created_at_idx
  on public.consultation_leads (created_at);
create index if not exists consultation_leads_ip_created_idx
  on public.consultation_leads (ip, created_at);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  topics text[] not null default '{}',
  source text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'unsubscribed')),
  confirm_token text,
  confirm_expires_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  ip inet
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (lower(email));
create index if not exists newsletter_subscribers_token_idx
  on public.newsletter_subscribers (confirm_token);
create index if not exists newsletter_subscribers_created_at_idx
  on public.newsletter_subscribers (created_at);

alter table public.newsletter_subscribers enable row level security;
-- Intentionally NO policies (server-role only), same as above.
```

- [ ] **Step 2: Write the purge-cron migration**

```sql
-- supabase/migrations/20260707000100_pending_purge_cron.sql
create extension if not exists pg_cron;

select cron.schedule(
  'purge-pending-subscribers',
  '0 * * * *',
  $$delete from public.newsletter_subscribers
      where status = 'pending' and confirm_expires_at < now()$$
);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: lead capture schema + pending-subscriber purge cron"
```

---

## Task 3: Shared Deno adapters

**Files:**
- Create: `supabase/functions/_shared/http.ts`
- Create: `supabase/functions/_shared/turnstile.ts`
- Create: `supabase/functions/_shared/email.ts`
- Create: `supabase/functions/_shared/db.ts`

**Interfaces:**
- Produces:
  - `json(body, status, origin): Response` and `preflight(origin): Response` (`http.ts`)
  - `verifyTurnstile(token, secret, remoteip?): Promise<boolean>` (`turnstile.ts`)
  - `sendEmail({apiKey, from, to, replyTo?, subject, text}): Promise<void>` (`email.ts`)
  - `serviceClient(url, serviceKey)` → Supabase client (`db.ts`)

> Deno files; not unit-tested in Node (network/Deno APIs). Verification is `deno check` if Deno is installed locally, otherwise at deploy in Task 7.

- [ ] **Step 1: Write `http.ts`**

```ts
// supabase/functions/_shared/http.ts
function cors(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin'
  };
}

export function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin) }
  });
}

export function preflight(origin: string): Response {
  return new Response(null, { status: 204, headers: cors(origin) });
}
```

- [ ] **Step 2: Write `turnstile.ts`**

```ts
// supabase/functions/_shared/turnstile.ts
export async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  remoteip?: string
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body
  });
  const data = await res.json().catch(() => ({ success: false }));
  return data?.success === true;
}
```

- [ ] **Step 3: Write `email.ts`**

```ts
// supabase/functions/_shared/email.ts
export async function sendEmail(opts: {
  apiKey: string;
  from: string;
  to: string | string[];
  replyTo?: string;
  subject: string;
  text: string;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: opts.from,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      reply_to: opts.replyTo,
      subject: opts.subject,
      text: opts.text
    })
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${await res.text().catch(() => '')}`);
  }
}
```

- [ ] **Step 4: Write `db.ts`**

```ts
// supabase/functions/_shared/db.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export function serviceClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/http.ts supabase/functions/_shared/turnstile.ts supabase/functions/_shared/email.ts supabase/functions/_shared/db.ts
git commit -m "feat: shared Deno adapters for http, turnstile, resend, supabase"
```

---

## Task 4: Edge function handlers

**Files:**
- Create: `supabase/functions/consult/index.ts`
- Create: `supabase/functions/subscribe/index.ts`
- Create: `supabase/functions/confirm/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 3.
- Produces: three HTTP endpoints. `POST /consult` → `{ok:true}`; `POST /subscribe` → `{ok:true, pending:true}`; `GET /confirm?token=` → 302 redirect to `${CONFIRM_BASE_URL}/subscribed`.

> Deno; verified at deploy (Task 7). Env vars read: `ALLOWED_ORIGIN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM`, `CONSULT_NOTIFY_TO`, `CONFIRM_BASE_URL`.

- [ ] **Step 1: Write `consult/index.ts`**

```ts
// supabase/functions/consult/index.ts
import { validateConsult, checkHoneypot, checkTiming, formatLeadEmail, overRateLimit } from '../_shared/core.mjs';
import { json, preflight } from '../_shared/http.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { sendEmail } from '../_shared/email.ts';
import { serviceClient } from '../_shared/db.ts';

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://racklion.com';

function clientIp(req: Request): string | null {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(origin);
  if (req.method !== 'POST') return json({ ok: false }, 405, origin);

  const now = Date.now();
  const payload = await req.json().catch(() => null);
  if (!payload) return json({ ok: false, error: 'bad_request' }, 400, origin);

  // Silent accept-drop for honeypot/timing so bots get no signal.
  if (!checkHoneypot(payload).ok || !checkTiming(payload, now).ok) return json({ ok: true }, 200, origin);

  const ip = clientIp(req);
  const passed = await verifyTurnstile(payload.turnstile_token, Deno.env.get('TURNSTILE_SECRET_KEY')!, ip ?? undefined);
  if (!passed) return json({ ok: false, error: 'verification' }, 400, origin);

  const { ok, errors, value } = validateConsult(payload);
  if (!ok) return json({ ok: false, errors }, 400, origin);

  const supabase = serviceClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (ip) {
    const since = new Date(now - 10 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('consultation_leads')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if (overRateLimit(count ?? 0, 5)) return json({ ok: false, error: 'rate_limited' }, 429, origin);
  }

  const { error } = await supabase.from('consultation_leads').insert({
    name: value.name,
    email: value.email,
    company: value.company || null,
    pressure: value.pressure || null,
    message: value.message,
    source: value.source,
    ip,
    user_agent: req.headers.get('user-agent'),
    consent_at: new Date(now).toISOString()
  });
  if (error) return json({ ok: false, error: 'server' }, 500, origin);

  // Row is durable; a notification failure must not look like data loss.
  try {
    const mail = formatLeadEmail(value);
    await sendEmail({
      apiKey: Deno.env.get('RESEND_API_KEY')!,
      from: Deno.env.get('NOTIFY_FROM') ?? 'notifications@racklion.com',
      to: Deno.env.get('CONSULT_NOTIFY_TO') ?? 'consult@racklion.com',
      replyTo: value.email,
      subject: mail.subject,
      text: mail.text
    });
  } catch (e) {
    console.error('lead notify failed', e);
  }

  return json({ ok: true }, 200, origin);
});
```

- [ ] **Step 2: Write `subscribe/index.ts`**

```ts
// supabase/functions/subscribe/index.ts
import { validateSubscribe, checkHoneypot, checkTiming, generateToken, buildConfirmUrl, overRateLimit } from '../_shared/core.mjs';
import { json, preflight } from '../_shared/http.ts';
import { verifyTurnstile } from '../_shared/turnstile.ts';
import { sendEmail } from '../_shared/email.ts';
import { serviceClient } from '../_shared/db.ts';

const origin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://racklion.com';

function clientIp(req: Request): string | null {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(origin);
  if (req.method !== 'POST') return json({ ok: false }, 405, origin);

  const now = Date.now();
  const payload = await req.json().catch(() => null);
  if (!payload) return json({ ok: false, error: 'bad_request' }, 400, origin);

  if (!checkHoneypot(payload).ok || !checkTiming(payload, now).ok) return json({ ok: true, pending: true }, 200, origin);

  const ip = clientIp(req);
  const passed = await verifyTurnstile(payload.turnstile_token, Deno.env.get('TURNSTILE_SECRET_KEY')!, ip ?? undefined);
  if (!passed) return json({ ok: false, error: 'verification' }, 400, origin);

  const { ok, errors, value } = validateSubscribe(payload);
  if (!ok) return json({ ok: false, errors }, 400, origin);

  const supabase = serviceClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Rate limit: max 3 signups/hour per email (covers retries + abuse).
  const since = new Date(now - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('newsletter_subscribers')
    .select('*', { count: 'exact', head: true })
    .eq('email', value.email)
    .gte('created_at', since);
  if (overRateLimit(count ?? 0, 3)) return json({ ok: false, error: 'rate_limited' }, 429, origin);

  // Already confirmed => silent success (no second email).
  const { data: existing } = await supabase
    .from('newsletter_subscribers')
    .select('status')
    .eq('email', value.email)
    .maybeSingle();
  if (existing?.status === 'confirmed') return json({ ok: true, pending: false }, 200, origin);

  const token = generateToken();
  const expires = new Date(now + 72 * 60 * 60 * 1000).toISOString();

  // Upsert on email: re-issue token for pending, create if new.
  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert(
      {
        email: value.email,
        topics: value.topics,
        source: value.source,
        status: 'pending',
        confirm_token: token,
        confirm_expires_at: expires,
        ip
      },
      { onConflict: 'email' }
    );
  if (error) return json({ ok: false, error: 'server' }, 500, origin);

  try {
    const confirmUrl = buildConfirmUrl(Deno.env.get('CONFIRM_BASE_URL') ?? 'https://racklion.com', token);
    await sendEmail({
      apiKey: Deno.env.get('RESEND_API_KEY')!,
      from: Deno.env.get('NOTIFY_FROM') ?? 'noreply@racklion.com',
      to: value.email,
      subject: 'Confirm your Racklion On-Prem Signal subscription',
      text: `Confirm your subscription to the daily On-Prem Signal:\n\n${confirmUrl}\n\nIf you did not request this, ignore this email.`
    });
  } catch (e) {
    console.error('confirm email failed', e);
  }

  return json({ ok: true, pending: true }, 200, origin);
});
```

> Note: the `upsert(..., { onConflict: 'email' })` relies on the unique index over `lower(email)`; since `validateSubscribe` already lowercases `email`, the stored value and the conflict target agree.

- [ ] **Step 3: Write `confirm/index.ts`**

```ts
// supabase/functions/confirm/index.ts
import { isExpired } from '../_shared/core.mjs';
import { serviceClient } from '../_shared/db.ts';

const base = Deno.env.get('CONFIRM_BASE_URL') ?? 'https://racklion.com';

function redirect(path: string): Response {
  return new Response(null, { status: 302, headers: { Location: `${base.replace(/\/+$/, '')}${path}` } });
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const token = new URL(req.url).searchParams.get('token');
  if (!token) return redirect('/subscribe?confirm=invalid');

  const supabase = serviceClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: row } = await supabase
    .from('newsletter_subscribers')
    .select('id, status, confirm_expires_at')
    .eq('confirm_token', token)
    .maybeSingle();

  if (!row) return redirect('/subscribe?confirm=invalid');
  if (row.status === 'confirmed') return redirect('/subscribed');
  if (isExpired(row.confirm_expires_at, Date.now())) return redirect('/subscribe?confirm=expired');

  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirm_token: null })
    .eq('id', row.id);
  if (error) return redirect('/subscribe?confirm=error');

  return redirect('/subscribed');
});
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/consult/index.ts supabase/functions/subscribe/index.ts supabase/functions/confirm/index.ts
git commit -m "feat: consult, subscribe, and confirm edge function handlers"
```

---

## Task 5: Frontend — honeypot, timing, Turnstile, endpoint wiring, pending UI

**Files:**
- Modify: `src/render.js` (both forms; ctx-injected values)
- Modify: `src/main.js` (ctx, rendered_at stamping, token read, env rename, pending state)
- Modify: `src/styles.css` (hide honeypot)
- Modify: `index.html` (Turnstile script)
- Modify: `test/render.test.mjs` (assert honeypot + Turnstile present)

**Interfaces:**
- Consumes: the three endpoint URLs and the Turnstile site key via `import.meta.env`.
- ctx gains: `turnstileSiteKey: string`. `render.js` renders a honeypot input, a `rendered_at` hidden input (value filled by `main.js` post-render), and a Turnstile container in both `#lead-form` and `#subscribe-form`.

- [ ] **Step 1: Add the failing render assertions**

Add to `test/render.test.mjs`:

```js
test('consult and subscribe forms include honeypot + turnstile + rendered_at', () => {
  const c = { ...ctx, turnstileSiteKey: 'test-site-key' };
  const consulting = renderPage('consulting', c);
  assert.match(consulting, /name="company_url"/);
  assert.match(consulting, /class="cf-turnstile"/);
  assert.match(consulting, /data-sitekey="test-site-key"/);
  assert.match(consulting, /name="rendered_at"/);
  const subscribe = renderPage('subscribe', c);
  assert.match(subscribe, /name="company_url"/);
  assert.match(subscribe, /class="cf-turnstile"/);
  assert.match(subscribe, /name="rendered_at"/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/render.test.mjs`
Expected: FAIL — no `company_url` / `cf-turnstile` in output yet.

- [ ] **Step 3: Add a shared anti-bot fields helper in `render.js`**

Add near the top of `src/render.js` (after the imports):

```js
function renderBotFields(state) {
  return `
    <div class="hp-field" aria-hidden="true">
      <label>Company URL<input type="text" name="company_url" tabindex="-1" autocomplete="off" /></label>
    </div>
    <input type="hidden" name="rendered_at" value="" />
    <div class="cf-turnstile" data-sitekey="${escapeHtml(state.turnstileSiteKey || '')}"></div>
  `;
}
```

Then, inside `renderConsultationForm(...)`, insert `${renderBotFields(state)}` immediately before the submit `<button class="form-action" type="submit">`. It needs `state`, so change its signature to `renderConsultationForm(state)` and read `state.savedLead` internally (it currently takes `savedLead`); update its call site in `renderConsultingPage(state)` from `renderConsultationForm(state.savedLead)` to `renderConsultationForm(state)`.

Inside `renderSubscribeForm(state, demoSubscriber)`, insert `${renderBotFields(state)}` immediately before its submit button.

- [ ] **Step 4: Hide the honeypot in `src/styles.css`**

```css
.hp-field {
  position: absolute;
  left: -5000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
```

- [ ] **Step 5: Run render tests to verify pass**

Run: `node --test test/render.test.mjs`
Expected: PASS (existing + the new assertion).

- [ ] **Step 6: Load Turnstile in `index.html`**

Add inside `<head>` of `index.html`:

```html
    <!-- Cloudflare Turnstile loader. Note: SRI (integrity=) is intentionally
         omitted — Cloudflare updates this loader script and does not publish a
         stable hash for it; pinning one would break the widget on their next
         release. It is a first-party Cloudflare security script. -->
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
```

- [ ] **Step 7: Wire `main.js` — env rename, ctx, rendered_at, token, pending state**

In `src/main.js`:
- Rename the endpoint constants:
  ```js
  const consultEndpoint = import.meta.env.VITE_CONSULT_ENDPOINT;
  const subscribeEndpoint = import.meta.env.VITE_SUBSCRIBE_ENDPOINT;
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
  ```
  and replace all prior uses of `leadEndpoint`/`newsletterEndpoint` with `consultEndpoint`/`subscribeEndpoint`.
- Add `turnstileSiteKey` to the `ctx` object built in `renderApp`:
  ```js
  turnstileSiteKey,
  ```
- After `app.innerHTML = renderPage(...)` in `renderApp`, stamp the timing field(s):
  ```js
  document.querySelectorAll('input[name="rendered_at"]').forEach((el) => {
    el.value = String(Date.now());
  });
  ```
- In `submitLead(form)`, extend the payload built from the form with the anti-bot fields and drop the localStorage-only path when the endpoint exists:
  ```js
  const payload = {
    name: String(formData.get('name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    company: String(formData.get('company') || '').trim(),
    pressure: String(formData.get('pressure') || '').trim(),
    message: String(formData.get('message') || '').trim(),
    source: 'racklion-consulting-inquiry',
    company_url: String(formData.get('company_url') || ''),
    rendered_at: Number(formData.get('rendered_at') || 0),
    turnstile_token: String(formData.get('cf-turnstile-response') || '')
  };
  ```
  Replace the fetch target `leadEndpoint` with `consultEndpoint`. On a non-ok response, set `state.leadStatus = 'Consultation request failed. Please try again.'`. On ok, `state.leadStatus = 'Consultation request sent.'` and `form.reset()`.
- In `submitSubscription(form)`, likewise add `company_url`, `rendered_at`, `turnstile_token`, target `subscribeEndpoint`, and set the success message to the double-opt-in wording:
  ```js
  state.subscriberStatus = 'Almost there — check your email to confirm your subscription.';
  ```
  Keep the `localStorage` preview fallback only when `subscribeEndpoint` is unset (local dev).

- [ ] **Step 8: Verify build + tests**

Run: `node --test`
Expected: PASS (routes, seo, render, lead-core).
Run: `npm run build`
Expected: `Build verification passed.`

- [ ] **Step 9: Commit**

```bash
git add src/render.js src/main.js src/styles.css index.html test/render.test.mjs
git commit -m "feat: add honeypot, timing, Turnstile and endpoint wiring to forms"
```

---

## Task 6: Env template + docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update `.env.example`**

Replace the newsletter/lead endpoint lines with:

```bash
# Public (browser) — safe to expose
VITE_CONSULT_ENDPOINT=https://<project>.functions.supabase.co/consult
VITE_SUBSCRIBE_ENDPOINT=https://<project>.functions.supabase.co/subscribe
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA

# Server-only secrets (set with `supabase secrets set`, never in the browser):
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET_KEY, RESEND_API_KEY,
# NOTIFY_FROM, CONSULT_NOTIFY_TO=consult@racklion.com, CONFIRM_BASE_URL=https://racklion.com, ALLOWED_ORIGIN=https://racklion.com
```

- [ ] **Step 2: Add a README section**

Append to `README.md`:

```markdown
## Lead capture & subscriptions

Consultation leads and newsletter signups are captured by three Supabase Edge
Functions (`supabase/functions/consult`, `subscribe`, `confirm`) backed by two
RLS-locked tables (`supabase/migrations`). All validation and anti-bot logic
lives in the pure, unit-tested module `supabase/functions/_shared/core.mjs`
(`npm test` runs it).

Anti-bot: honeypot field + submit timing + Cloudflare Turnstile + Postgres rate
limiting. Newsletter uses double opt-in; consultation leads notify
`consult@racklion.com` via Resend. Secrets are server-only (see `.env.example`).

Local dev uses Cloudflare's always-pass Turnstile test keys (site
`1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`).
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: env template and lead-capture backend docs"
```

---

## Task 7: Provision & deploy (owner-driven)

**Requires the owner's Supabase project, secret values, and DNS.** The assistant provides commands; the owner holds all auth and secrets. Nothing here is committed code beyond a possible `supabase/config.toml` from `supabase init`.

- [ ] **Step 1: Third-party setup (owner)**
  - Create the `consult@racklion.com` Google Group; set posting to **allow external/automated senders**.
  - Cloudflare Turnstile: create a widget for `racklion.com`; note the **site** key and **secret** key.
  - Resend: add and verify the `racklion.com` sending domain (SPF/DKIM/DMARC DNS records); create an API key.

- [ ] **Step 2: Link the project**

```bash
supabase init            # if supabase/config.toml does not yet exist
supabase login
supabase link --project-ref <project-ref>
```

- [ ] **Step 3: Apply migrations**

```bash
supabase db push
```
Expected: both migrations apply; `consultation_leads` and `newsletter_subscribers` exist with RLS enabled and no policies.

- [ ] **Step 4: Set secrets**

```bash
supabase secrets set \
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  TURNSTILE_SECRET_KEY=... RESEND_API_KEY=... \
  NOTIFY_FROM=notifications@racklion.com \
  CONSULT_NOTIFY_TO=consult@racklion.com \
  CONFIRM_BASE_URL=https://racklion.com \
  ALLOWED_ORIGIN=https://racklion.com
```

- [ ] **Step 5: Deploy functions**

```bash
supabase functions deploy consult
supabase functions deploy subscribe
supabase functions deploy confirm
```

- [ ] **Step 6: Set frontend env + build**

Set `VITE_CONSULT_ENDPOINT`, `VITE_SUBSCRIBE_ENDPOINT`, `VITE_TURNSTILE_SITE_KEY` (real site key) in the host's environment, then redeploy the static site.

- [ ] **Step 7: End-to-end smoke**
  - Submit the consultation form → a row appears in `consultation_leads` and an email arrives at `consult@racklion.com` (reply-to = the lead).
  - Submit the subscribe form → a `pending` row appears; the confirmation email arrives; clicking the link flips the row to `confirmed` and lands on `/subscribed`.
  - Fill the honeypot (via devtools) → `200` but no row. Submit within 2.5s → no row. Submit ~10× fast from one IP → `429`.

---

## Self-Review

**Spec coverage:**
- §3 store / §4 data model → Task 2 (tables, RLS, indexes, unique lower(email)) ✅
- §3.1 endpoints → Task 4 (consult/subscribe/confirm) ✅
- §5 anti-bot (honeypot, timing, Turnstile, rate limit) → core (Task 1) + handlers (Task 4) + frontend (Task 5) ✅
- §6 double opt-in (token, expiry, confirm, purge) → Task 1 (token/expiry), Task 2 (cron), Task 4 (subscribe/confirm) ✅
- §7 lead notification to consult@racklion.com via Resend → Task 3 (email) + Task 4 (consult) ✅
- §8 frontend changes → Task 5 ✅
- §9 secrets/env → Task 6 + Task 7 ✅
- §10 error handling → Task 4 (status codes, write-before-send ordering) ✅
- §11 testing → Task 1 (core unit) + Task 5 (render) + Task 7 (smoke) ✅
- §12 deployment/access → Task 7 ✅

**Placeholder scan:** No "TBD"/"handle errors"/"similar to". `<project>`/`<project-ref>`/`...` in Task 7 are owner-supplied secret/value placeholders by design, not code gaps.

**Type consistency:** `checkHoneypot`/`checkTiming`/`validateConsult`/`validateSubscribe`/`generateToken`/`isExpired`/`overRateLimit`/`buildConfirmUrl`/`formatLeadEmail` signatures match between `core.mjs` (Task 1), its tests (Task 1), and the handlers (Task 4). Payload field names (`company_url`, `rendered_at`, `turnstile_token`) match between the frontend payloads (Task 5) and the handler reads (Task 4). Env var names match between `.env.example` (Task 6), handlers (Task 4), and provisioning (Task 7). Redirect paths (`/subscribed`, `/subscribe?confirm=…`) are consistent in `confirm/index.ts`.

**Note for implementers:** Tasks 1 and 5 have real `node --test` gates and a green `npm run build`. Tasks 2–4 are Deno/SQL authored code whose true verification is Task 7 (deploy + smoke) against the live project; review them for correctness at authoring time since there is no local red/green.
