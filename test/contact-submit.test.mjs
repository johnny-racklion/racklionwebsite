import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('async function submitLead('), source.indexOf('\nfunction syncGpuLocation'));
function setup(response) {
  const status = { setAttribute() {}, focus() { this.focused = true; }, scrollIntoView() {} };
  const button = { disabled: false };
  const form = {
    querySelector: () => button,
    closest: () => ({ querySelector: () => status }),
    setAttribute() {}, reset() { this.wasReset = true; }
  };
  const context = vm.createContext({
    FormData: class { get(key) { return { name: 'Test', email: 'test@example.com', message: 'Test message', rendered_at: Date.now() - 5000 }[key]; } },
    state: {}, consultEndpoint: 'https://example.com/contact',
    fetch: async () => response, AbortSignal,
    window: {}, turnstileSiteKey: '',
  });
  vm.runInContext(handler, context);
  return { run: () => context.submitLead(form), form, status, button };
}
test('successful contact submission hides form and focuses visible confirmation', async () => {
  const view = setup({ ok: true, json: async () => ({ ok: true }) });
  await view.run();
  assert.equal(view.form.hidden, true);
  assert.equal(view.status.focused, true);
  assert.match(view.status.className, /is-visible.*is-success/);
  assert.match(view.status.textContent, /Message sent/);
});
test('email failure displays saved-message warning and preserves input', async () => {
  const view = setup({ ok: false, json: async () => ({ ok: false, error: 'email_failed' }) });
  await view.run();
  assert.equal(view.form.wasReset, undefined);
  assert.equal(view.button.disabled, false);
  assert.match(view.status.className, /is-visible.*is-error/);
  assert.match(view.status.textContent, /do not need to submit it again/);
});
test('HTTP 200 without confirmed success is never shown as delivered', async () => {
  const view = setup({ ok: true, json: async () => ({ ok: false }) });
  await view.run();
  assert.notEqual(view.form.hidden, true);
  assert.match(view.status.className, /is-error/);
});
