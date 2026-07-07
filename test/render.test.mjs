import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPage } from '../src/render.js';

const data = {
  generatedAt: '2026-07-06T00:00:00.000Z',
  topics: [{ name: 'data-centers', count: 3 }],
  sources: [], items: [
    { title: 'GPU crunch deepens', summary: 'Supply tight.', source: 'Example',
      sourceHomepage: 'https://example.com', category: 'AI infrastructure',
      publishedAt: '2026-07-05T00:00:00.000Z', url: 'https://example.com/a',
      onPremAngle: 'Build-vs-rent', whyUseful: 'Cost pressure.', tags: ['ai-infrastructure'],
      pressure: 90, score: 90 }
  ]
};
const ctx = { data, query: '', topic: 'all', sort: 'pressure',
  selectedTopics: new Set(), subscriberStatus: '', leadStatus: '',
  savedLead: null, demoSubscriber: null };

test('renderPage(home) includes hero and brand', () => {
  const html = renderPage('home', ctx);
  assert.match(html, /Racklion/);
  assert.match(html, /On-Prem Signal/);
});

test('renderPage(signals) includes the item title', () => {
  assert.match(renderPage('signals', ctx), /GPU crunch deepens/);
});

test('renderPage(source) includes GPU sourcing copy', () => {
  const html = renderPage('source', ctx);
  assert.match(html, /GPU/);
  assert.match(html, /colocation|Colocation/);
});

test('renderPage(faq) renders FAQ content', () => {
  assert.match(renderPage('faq', ctx), /repatriation/);
});

test('renderPage never throws for any view', () => {
  for (const v of ['home','signals','source','consulting','about','faq','subscribe']) {
    assert.doesNotThrow(() => renderPage(v, ctx), v);
  }
});
