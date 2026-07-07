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
