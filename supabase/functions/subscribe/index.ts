// supabase/functions/subscribe/index.ts
import { validateSubscribe, checkHoneypot, checkTiming, generateToken, buildConfirmUrl } from '../_shared/core.mjs';
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

  // Already confirmed => silent success (no second email).
  const { data: existing } = await supabase
    .from('newsletter_subscribers')
    .select('status, confirm_sent_at')
    .eq('email', value.email)
    .maybeSingle();
  if (existing?.status === 'confirmed') return json({ ok: true, pending: false }, 200, origin);

  // Per-email cooldown: don't resend a confirmation more than once / 10 min.
  const COOLDOWN_MS = 10 * 60 * 1000;
  if (existing?.confirm_sent_at && now - Date.parse(existing.confirm_sent_at) < COOLDOWN_MS) {
    return json({ ok: true, pending: true }, 200, origin);
  }

  const token = generateToken();
  const expires = new Date(now + 72 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

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
        confirm_sent_at: nowIso,
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
