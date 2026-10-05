// Curated public on-demand rate snapshot. Update rates, source notes, and the
// observation date together after checking the providers' linked price pages.
// One observation per provider/model; prices are USD per physical GPU-hour.
export const PRICING_AS_OF = '2026-10-05';
export const SAVINGS_SCENARIO = 0.30;
export const MONTHLY_HOURS = 730;
const providers = {
  hyperstack: { name: 'Hyperstack', url: 'https://www.hyperstack.cloud/gpu-pricing' },
  runpod: { name: 'Runpod', url: 'https://www.runpod.io/pricing' },
  nebius: { name: 'Nebius', url: 'https://nebius.com/prices' },
  lambda: { name: 'Lambda', url: 'https://lambda.ai/instances' }
};
const rate = (provider, hourly, note) => ({ ...providers[provider], hourly, note });
export const GPU_MODELS = [
  { id: 'b300', name: 'B300', variant: 'Blackwell Ultra', rates: [
    rate('hyperstack', 7.40, 'B300 on-demand; 288 GB listed.'),
    rate('runpod', 7.89, 'B300 Pod; 288 GB listed. Excludes serverless pricing.'),
    rate('nebius', 9.50, 'HGX B300; rate effective October 1, 2026.')
  ] },
  { id: 'b200', name: 'B200', variant: 'Blackwell', rates: [
    rate('hyperstack', 6.00, 'B200 on-demand; 192 GB listed.'),
    rate('runpod', 6.79, 'B200 Pod; 180 GB listed. Excludes serverless pricing.'),
    rate('nebius', 8.50, 'HGX B200; rate effective October 1, 2026.')
  ] },
  { id: 'h200', name: 'H200', variant: 'Hopper · 141 GB', rates: [
    rate('hyperstack', 3.99, 'H200 SXM on-demand.'),
    rate('runpod', 4.59, 'H200 Pod; not the separate cluster or serverless rate.'),
    rate('nebius', 5.40, 'HGX H200; rate effective October 1, 2026.')
  ] },
  { id: 'h100-sxm', name: 'H100', variant: 'SXM · 80 GB', rates: [
    rate('hyperstack', 3.20, 'H100 SXM; excludes PCIe and NVLink listings.'),
    rate('runpod', 3.49, 'H100 SXM Pod; excludes PCIe, NVL, and serverless listings.'),
    rate('nebius', 4.50, 'HGX H100; rate effective October 1, 2026.')
  ] },
  { id: 'a100-sxm', name: 'A100', variant: 'SXM · 80 GB', rates: [
    rate('hyperstack', 1.60, 'A100 SXM 80 GB; excludes PCIe and 40 GB models.'),
    rate('runpod', 1.59, 'A100 SXM 80 GB Pod; excludes serverless pricing.'),
    rate('lambda', 2.79, 'A100 SXM 80 GB; per-GPU rate on an 8-GPU instance ($22.32/node-hour).')
  ] },
  { id: 'l40s', name: 'L40S', variant: 'Ada · 48 GB', rates: [
    rate('runpod', 1.09, 'L40S Pod; excludes L40 and serverless listings.'),
    rate('nebius', 1.55, 'L40S with Intel CPU, starting rate; CPU/RAM configuration affects price.')
  ] }
];

export function gpuById(id) {
  return GPU_MODELS.find(gpu => gpu.id === id) || GPU_MODELS[0];
}
export function gpuBenchmark(gpu) {
  const values = gpu.rates.map(rate => rate.hourly);
  return { average: values.reduce((sum, value) => sum + value, 0) / values.length,
    low: Math.min(...values), high: Math.max(...values), providers: values.length };
}
export function normalizeGpuRequest(input = {}) {
  const raw = Number(input.count);
  const count = Number.isFinite(raw) && raw >= 1 ? Math.min(10000, Math.floor(raw)) : 8;
  const months = [1, 3, 6, 12, 24, 36].includes(Number(input.months)) ? Number(input.months) : 12;
  return { gpu: gpuById(input.gpu).id, count, months };
}
export function gpuRequestFromSearch(search = '') {
  const params = new URLSearchParams(search);
  return normalizeGpuRequest({gpu: params.get('gpu'), count: params.get('count'), months: params.get('months')});
}
export function gpuEstimate(input) {
  const request = normalizeGpuRequest(input);
  const gpu = gpuById(request.gpu);
  const benchmark = gpuBenchmark(gpu);
  const monthly = benchmark.average * request.count * MONTHLY_HOURS;
  return { ...request, gpu, benchmark, monthly, reservedMonthly: monthly * (1 - SAVINGS_SCENARIO),
    savings: monthly * SAVINGS_SCENARIO * request.months };
}
export function gpuQuoteUrl(input) {
  const request = normalizeGpuRequest(input);
  return `/consulting?${new URLSearchParams({ ...request, intent: 'gpu-reservation' })}`;
}
export function gpuQuoteMessage(input) {
  const { gpu, count, months } = gpuEstimate(input);
  return `I’m interested in reserved capacity for ${count} × NVIDIA ${gpu.name} (${gpu.variant}) over ${months} month${months === 1 ? '' : 's'}. Please help me explore pricing and availability.\n\nPreferred region:\nTarget start date:\nWorkload / interconnect requirements:`;
}
export function usd(value, decimals = 2) {
  return new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(value);
}
export function pricingDate() {
  return new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${PRICING_AS_OF}T00:00:00Z`));
}
