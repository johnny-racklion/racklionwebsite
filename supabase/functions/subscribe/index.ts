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
