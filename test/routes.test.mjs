import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewFromPath, pathForView, normalizePath, ROUTES, SITE_URL } from '../src/routes.js';

test('viewFromPath maps known paths', () => {
  assert.equal(viewFromPath('/'), 'home');
  assert.equal(viewFromPath('/source'), 'source');
  assert.equal(viewFromPath('/consulting'), 'consulting');
  assert.equal(viewFromPath('/faq'), 'faq');
});

test('viewFromPath tolerates trailing slash and unknown paths', () => {
  assert.equal(viewFromPath('/source/'), 'source');
  assert.equal(viewFromPath('/nope'), 'home');
});

test('pathForView round-trips', () => {
  for (const r of ROUTES) assert.equal(pathForView(r.view), r.path);
});

test('normalizePath keeps root', () => {
  assert.equal(normalizePath('/'), '/');
  assert.equal(normalizePath('/x/'), '/x');
});

test('SITE_URL has no trailing slash', () => {
  assert.ok(!SITE_URL.endsWith('/'));
});
