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
