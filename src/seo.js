// src/seo.js
// Pure, isomorphic SEO metadata + JSON-LD builders. No browser globals.
import { SITE_URL, ROUTES } from './routes.js';

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

const META = {
  'gpu-pricing': {
    title: 'GPU Hourly Pricing & Reserved Capacity Savings | Racklion',
    description: 'Compare B300, B200, H200, H100, A100 and L40S GPU-hour prices. Explore potential savings of 30% or more with reserved capacity and request a tailored quote.'
  },
  home: {
    title: 'GPU Hourly Pricing & Reserved Capacity Savings | Racklion',
    description: 'Compare B300, B200, H200, H100, A100 and L40S GPU-hour prices. Explore potential savings of 30% or more with reserved capacity and request a tailored quote.'
  },
  signals: {
    title: 'On-Prem Signal — Daily AI Infrastructure & Cloud-Pressure News | Racklion',
    description: 'A daily brief on GPU capacity, cloud costs, data centers, power, and resilience to inform infrastructure and sourcing decisions.'
  },
  source: {
    title: 'Source GPUs, Power & Data-Center Space | Racklion',
    description: 'Source B300, B200, H200 and H100 GPU capacity, servers, colocation and power. Compare providers, reservation terms and ready-for-service dates.'
  },
  consulting: {
    title: 'Cloud Cost & GPU Capacity Consulting | Racklion',
    description: 'Reduce cloud waste, evaluate commitments and plan GPU capacity. Racklion helps align cloud, reserved compute and owned infrastructure with your workload.'
  },
  about: {
    title: 'About Racklion — Infrastructure Decisions Made With Evidence',
    description: 'Racklion helps teams improve cloud economics and source GPU capacity, colocation and infrastructure around their workload, budget and timeline.'
  },
  faq: {
    title: 'GPU Reservations & Cloud Cost FAQ | Racklion',
    description: 'Answers on GPU reservations, dedicated versus shared capacity, RFS dates, pricing and cloud savings that can free budget for AI workloads.'
  },
  subscribe: {
    title: 'Subscribe to the Daily On-Prem Signal | Racklion',
    description: 'Choose the infrastructure news that matters to you: GPUs, cloud costs, data centers, power, storage and networking.'
  }
};

export const FAQ_ENTRIES = [
  {
    "q": "Can cloud savings help fund more GPU capacity?",
    "a": "Yes. Reducing idle resources, right-sizing workloads and matching commitments to steady usage can free budget for GPU capacity. GPUs can run in public cloud, specialist GPU clouds, colocation or your own environment. We assess the combined budget and workload rather than assuming everything should move out of the cloud."
  },
  {
    "q": "When does reserving GPUs make sense?",
    "a": "A reservation can offer a lower rate and more predictable costs when you know the GPU configuration, usage and term you need. Compare total committed spend with realistic utilization: unused reserved hours can still be billable. For short or uncertain workloads, on-demand capacity may be a better fit."
  },
  {
    "q": "Does a GPU reservation guarantee the hardware and start date?",
    "a": "Do not assume a pricing commitment alone guarantees physical capacity. Ask the provider to specify the GPU model and count, memory, region, tenancy, reservation term and ready-for-service date in the offer. Confirm availability and acceptance criteria before signing."
  },
  {
    "q": "What is the difference between dedicated and shared GPU capacity?",
    "a": "Dedicated may refer to an entire GPU, server or cluster; it does not automatically mean the network or storage is dedicated too. Shared offers may divide GPU resources or place multiple tenants on a host. Ask what is exclusive, what is shared and how isolation and performance are enforced."
  },
  {
    "q": "How do I confirm I am getting the GPU configuration I ordered?",
    "a": "Record the exact accelerator model, GPU count and memory, plus CPU, RAM, storage and interconnect requirements in the order. Agree on a hardware inventory check and workload acceptance test at handover, including how substitutions or failures will be handled."
  },
  {
    "q": "What does RFS mean, and why do you ask for it?",
    "a": "RFS means ready for service: the date you need the capacity or infrastructure usable. It helps us compare options against your timeline. Your requested date is a planning requirement, not a confirmed delivery promise; provider availability and acceptance terms still need agreement."
  },
  {
    "q": "What affects the total cost of reserved GPU capacity?",
    "a": "GPU model and quantity, term, region, tenancy, interconnect, storage, network transfer, support and payment terms all affect the offer. Compare the full committed cost and included services, not only the advertised GPU-hour rate. Ask about cancellation, renewal and unused-capacity charges."
  },
  {
    "q": "Are the savings on this site a guaranteed quote?",
    "a": "No. The calculator illustrates a 30% reduction from the selected published on-demand averages. Actual savings and availability depend on your requirements and the offer we can source. Reserving can provide price predictability, but market prices can move in either direction."
  },
  {
    "q": "Do we need to leave the cloud to work with Racklion?",
    "a": "No. We can help evaluate cloud spending, source reserved GPU capacity or plan a hybrid environment. Cloud repatriation means moving selected workloads back to owned or colocated infrastructure; it is one option, not a requirement. The goal is to put your budget where it serves the workload best."
  }
];

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function metaForView(view) {
  return META[view] || META.home;
}

export function canonicalForView(view) {
  const route = ROUTES.find((r) => r.view === (view === 'gpu-pricing' ? 'home' : view));
  const path = route ? route.path : '/';
  return path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Racklion',
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/favicon.svg`,
    description: 'Cloud cost advisory and infrastructure sourcing: reserved GPUs, servers, power, colocation, and data-center space.'
  };
}

export function serviceJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'GPU capacity sourcing and cloud cost advisory',
    provider: { '@type': 'Organization', name: 'Racklion', url: `${SITE_URL}/` },
    areaServed: 'Global',
    description: 'Optimize cloud spending and source GPU capacity, colocation, power, and data-center space around workload requirements.'
  };
}

export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ENTRIES.map((e) => ({
      '@type': 'Question',
      name: e.q,
      acceptedAnswer: { '@type': 'Answer', text: e.a }
    }))
  };
}

export function jsonLdForView(view) {
  const blocks = [organizationJsonLd()];
  if (view === 'home' || view === 'source' || view === 'consulting') blocks.push(serviceJsonLd());
  if (view === 'faq') blocks.push(faqJsonLd());
  return blocks;
}

export function headTagsForView(view) {
  const meta = metaForView(view);
  const canonical = canonicalForView(view);
  const image = DEFAULT_OG_IMAGE;
  const jsonLd = jsonLdForView(view)
    .map((block) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`)
    .join('\n    ');
  return [
    `<title>${escapeAttr(meta.title)}</title>`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Racklion" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Racklion: Cloud savings. GPU capacity. Room to grow." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    jsonLd
  ].join('\n    ');
}
