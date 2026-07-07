import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaForView, canonicalForView, headTagsForView, jsonLdForView, FAQ_ENTRIES } from '../src/seo.js';

test('every view has a title and description', () => {
  for (const v of ['home','signals','source','consulting','about','faq','subscribe']) {
    assert.ok(metaForView(v).title.length > 10, `${v} title`);
    assert.ok(metaForView(v).description.length > 30, `${v} description`);
  }
});

test('canonical for home ends with slash, others do not', () => {
  assert.ok(canonicalForView('home').endsWith('/'));
  assert.equal(canonicalForView('source'), 'https://racklion.com/source');
});

test('head fragment includes title, canonical, og and twitter tags', () => {
  const head = headTagsForView('source');
  assert.match(head, /<title>[^<]*Source[^<]*<\/title>/);
  assert.match(head, /rel="canonical" href="https:\/\/racklion\.com\/source"/);
  assert.match(head, /property="og:title"/);
  assert.match(head, /name="twitter:card"/);
});

test('faq view emits FAQPage JSON-LD from FAQ_ENTRIES', () => {
  const blocks = jsonLdForView('faq');
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq);
  assert.equal(faq.mainEntity.length, FAQ_ENTRIES.length);
});

test('home/source/consulting emit Service JSON-LD', () => {
  for (const v of ['home','source','consulting']) {
    assert.ok(jsonLdForView(v).some((b) => b['@type'] === 'Service'), v);
  }
});
