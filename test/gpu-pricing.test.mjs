import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GPU_MODELS, gpuById, gpuBenchmark, gpuEstimate, gpuQuoteUrl, gpuQuoteMessage, gpuRequestFromSearch, normalizeGpuRequest } from '../src/gpu-pricing.js';
import { renderGpuPricingPage, renderGpuResults } from '../src/gpu-pricing-render.js';

test('B300 benchmark gives each published provider one vote', () => {
  const b = gpuBenchmark(gpuById('b300'));
  assert.equal(b.providers, 3);
  assert.ok(Math.abs(b.average - 8.263333333333334) < 1e-10);
  assert.equal(b.low, 7.4);
  assert.equal(b.high, 9.5);
  for (const gpu of GPU_MODELS) {
    assert.equal(new Set(gpu.rates.map(r => r.name)).size, gpu.rates.length);
    assert.ok(gpu.rates.every(r => r.hourly > 0 && r.url.startsWith('https://')));
  }
});
test('savings use continuous billed capacity across the selected term', () => {
  const e = gpuEstimate({gpu: 'a100-sxm', count: 16, months: 6});
  assert.ok(Math.abs(e.monthly - (1.60 + 1.59 + 2.79) / 3 * 16 * 730) < 1e-8);
  assert.ok(Math.abs(e.reservedMonthly + e.savings / 6 - e.monthly) < 1e-8);
  assert.ok(Math.abs(e.savings - e.monthly * 0.30 * 6) < 1e-8);
});
test('nondefault GPU, count, and term survive quote URLs and lead messages', () => {
  const request = {gpu: 'h100-sxm', count: 64, months: 24};
  const url = new URL(gpuQuoteUrl(request), 'https://www.racklion.com');
  assert.equal(url.pathname, '/');
  assert.equal(url.hash, '#consultation');
  assert.equal(url.searchParams.get('intent'), 'gpu-reservation');
  assert.deepEqual(gpuRequestFromSearch(url.search), request);
  assert.match(gpuQuoteMessage(request), /64 × NVIDIA H100.*24 months/);
  assert.match(renderGpuResults(request), /gpu=h100-sxm&amp;|gpu=h100-sxm&/);
});
test('query values cannot introduce unknown GPUs, unbounded counts, or HTML', () => {
  assert.deepEqual(normalizeGpuRequest({gpu:'<script>',count:Infinity,months:99}), {gpu:'b300',count:8,months:12});
  assert.equal(normalizeGpuRequest({count:-8}).count, 8);
  assert.equal(normalizeGpuRequest({count:1000000}).count, 10000);
  const html = renderGpuPricingPage({gpuRequest:{gpu:'<script>alert(1)</script>',count:'NaN',months:0}});
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('NaN'));
  assert.match(html, /B300/);
});
