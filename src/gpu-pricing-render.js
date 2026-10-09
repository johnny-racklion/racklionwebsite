import { GPU_MODELS, gpuBenchmark, gpuEstimate, gpuQuoteUrl, normalizeGpuRequest, usd, pricingDate } from './gpu-pricing.js';

function pricingTable() {
  return `<div class="gpu-table-wrap" tabindex="0" role="region" aria-label="GPU hourly price comparison">
    <table class="gpu-table"><caption class="sr-only">Selected providers’ average on-demand prices and an illustrative 30% reduction, USD per GPU-hour.</caption>
      <thead><tr><th scope="col">NVIDIA GPU</th><th scope="col">Average on-demand</th><th scope="col">At 30% lower</th><th scope="col">Listed range</th><th scope="col"><span class="sr-only">Explore</span></th></tr></thead>
      <tbody>${GPU_MODELS.map(gpu => {
        const b = gpuBenchmark(gpu);
        return `<tr><th scope="row"><a href="/?gpu=${gpu.id}#gpu-calculator">${gpu.name}</a><small>${gpu.variant}</small></th>
          <td>${usd(b.average)}<small>${b.providers} providers</small></td><td class="gpu-target">${usd(b.average * .7)}<small>Illustrative / GPU-hr</small></td>
          <td class="gpu-range">${usd(b.low)}–${usd(b.high)}</td><td><a class="gpu-row-link" href="/?gpu=${gpu.id}#gpu-calculator" aria-label="Explore ${gpu.name} savings">↗</a></td></tr>`;
      }).join('')}</tbody></table></div>`;
}

export function renderGpuPreview() {
  return `<section class="gpu-preview" aria-label="GPU price watch">
    <div class="section-heading journal-heading"><div><span class="eyebrow">GPU price watch</span><h2>Know the rate.<br>Find a better one.</h2></div><a class="text-link" href="/">Compare GPU costs <span aria-hidden="true">↗</span></a></div>
    <div class="gpu-preview-intro"><p>Potential savings of <strong>30%+</strong> with reserved capacity. Explore published GPU-hour prices, then let Racklion source a deal around your workload.</p><span class="eyebrow">B300 / B200 / H200 / H100 / A100 / L40S</span></div>
    ${pricingTable()}
    <p class="pricing-note">USD per GPU-hour. Selected-provider averages checked ${pricingDate()}. The 30% comparison is illustrative; actual reserved rates are quoted for your requirements. <a href="/#pricing-sources">Sources & methodology</a></p>
  </section>`;
}

export function renderGpuResults(input) {
  const e = gpuEstimate(input);
  return `<span class="eyebrow">Your capacity, at a better rate</span>
    <h2>${e.count.toLocaleString('en-US')} × ${e.gpu.name}<span>${e.months}-month reservation</span></h2>
    <dl class="gpu-costs"><div><dt>Average on-demand / month</dt><dd>${usd(e.monthly, 0)}</dd></div><div><dt>At 30% lower / month</dt><dd>${usd(e.reservedMonthly, 0)}</dd></div></dl>
    <div class="gpu-saving"><span>Potential savings over ${e.months} month${e.months === 1 ? '' : 's'}</span><strong>${usd(e.savings, 0)}</strong></div>
    <a class="primary-action" href="${gpuQuoteUrl({gpu: e.gpu.id, count: e.count, months: e.months})}">Find my reserved rate <span aria-hidden="true">↗</span></a>
    <p class="pricing-note">Illustrates a 30% reduction with continuous use at 730 hours/month. Reserved capacity is billed for the committed term. Actual rates depend on availability, configuration, and term; excludes additional storage, network fees, and taxes.</p>`;
}

export function renderGpuPricingPage(state) {
  const request = normalizeGpuRequest(state.gpuRequest);
  return `<main id="main-content" class="page-main gpu-pricing-page">
    <section class="gpu-pricing-hero"><div><span class="eyebrow">Racklion / GPU price watch</span><h1>Same ambition.<br>Less GPU spend.</h1><p>Compare published GPU-hour rates. Reserve the capacity you need. Put more of your budget into the work that matters.</p></div><div class="gpu-promise"><strong>30%<span>+</span></strong><p>Potential savings<br>with reserved capacity.</p><a href="#gpu-calculator">Explore your savings ↓</a></div></section>
    <section aria-label="GPU pricing benchmarks"><div class="issue-line"><span>Public on-demand rates / USD per GPU-hour</span><span>Checked ${pricingDate()}</span></div>${pricingTable()}<p class="pricing-note">Averages cover the selected providers below, not the entire market. The 30% column shows a savings scenario, not a bookable offer.</p></section>
    <section id="gpu-calculator" class="gpu-calculator" aria-labelledby="gpu-calculator-title"><div class="gpu-calculator-inputs"><span class="eyebrow">Put a number on it</span><h2 id="gpu-calculator-title">What could you save?</h2><p>Start with the GPU, the fleet size, and how long you need it.</p>
      <div class="gpu-fields"><label for="gpu-model">GPU model<select id="gpu-model" data-gpu-input="gpu">${GPU_MODELS.map(gpu => `<option value="${gpu.id}" ${gpu.id === request.gpu ? 'selected' : ''}>NVIDIA ${gpu.name} — ${gpu.variant}</option>`).join('')}</select></label>
      <label for="gpu-count">Number of GPUs<input id="gpu-count" data-gpu-input="count" type="number" min="1" max="10000" step="1" value="${request.count}" inputmode="numeric" /></label>
      <label for="gpu-term">Reservation term<select id="gpu-term" data-gpu-input="months">${[1, 3, 6, 12, 24, 36].map(months => `<option value="${months}" ${months === request.months ? 'selected' : ''}>${months} month${months === 1 ? '' : 's'}</option>`).join('')}</select></label></div>
      <p class="pricing-note">Need a larger cluster, a specific region, or a custom term? Include it in your request.</p></div>
      <div id="gpu-results" class="gpu-results" aria-live="polite" aria-atomic="true">${renderGpuResults(request)}</div></section>
    <details id="pricing-sources" class="pricing-sources"><summary>Where these prices come from <span aria-hidden="true">+</span></summary>
      <p>Manually checked ${pricingDate()}. Each average is the arithmetic mean of one published on-demand rate per selected provider, normalized per physical GPU-hour. This is a dated reference snapshot, not a live availability feed. Spot, reserved, serverless, fractional GPUs, and contact-sales listings are excluded.</p>
      <p>H100 and A100 rows use SXM models with 80 GB memory. B200 providers list 180–192 GB configurations. Included CPU, RAM, networking, region, node size, and minimum GPU count vary; these are price references, not identical offers. Nebius L40S uses its published starting price. Unused reserved hours still cost money.</p>
      <div class="gpu-source-grid">${GPU_MODELS.map(gpu => `<article><h3>NVIDIA ${gpu.name}</h3><ul>${gpu.rates.map(rate => `<li><a href="${rate.url}" target="_blank" rel="noreferrer">${rate.name} ↗</a><strong>${usd(rate.hourly)}/hr</strong><p>${rate.note}</p></li>`).join('')}</ul></article>`).join('')}</div>
    </details>
  </main>`;
}
