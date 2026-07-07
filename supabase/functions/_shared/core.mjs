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
