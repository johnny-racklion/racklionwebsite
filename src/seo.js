// src/seo.js
// Pure, isomorphic SEO metadata + JSON-LD builders. No browser globals.
import { SITE_URL, ROUTES } from './routes.js';

const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png`;

const META = {
  home: {
    title: 'Racklion — Cloud Exit, On-Prem & AI Infrastructure Sourcing',
    description: 'Racklion helps teams leave rented cloud: cloud-exit economics, on-prem readiness, and sourcing GPUs, power, and data-center space.'
  },
  signals: {
    title: 'On-Prem Signal — Daily AI Infrastructure & Cloud-Pressure News | Racklion',
    description: 'A daily brief on GPU scarcity, cloud cost, outages, power, and sovereignty — scored by how hard each story pushes workloads back on-prem.'
  },
  source: {
    title: 'Source GPUs, Power & Data-Center Space | Racklion',
    description: 'Stop renting. Racklion sources GPU capacity (H100/H200/GB200), colocation, power, and data-center space so you can own the stack behind your AI workloads.'
  },
  consulting: {
    title: 'Cloud-Exit & On-Prem Consulting | Racklion',
    description: 'Pressure-test the cloud-versus-own decision: exit math, on-prem readiness, hybrid architecture, and resilience — before you commit budget.'
  },
  about: {
    title: 'About Racklion — Infrastructure Decisions Made With Evidence',
    description: 'Racklion tracks the pressure building beneath modern workloads and helps teams decide whether to keep renting cloud or own their infrastructure.'
  },
  faq: {
    title: 'AI Infrastructure & Cloud-Exit FAQ | Racklion',
    description: 'Answers on renting versus owning GPUs, sourcing H200 capacity, colocation versus cloud cost, cloud repatriation, and data-center power.'
  },
  subscribe: {
    title: 'Subscribe to the Daily On-Prem Signal | Racklion',
    description: 'One concise daily brief on the infrastructure news that changes the cloud-versus-owning-it decision.'
  }
};

export const FAQ_ENTRIES = [
  {
    q: 'Is it cheaper to own GPUs or rent them from the cloud?',
    a: 'For steady, high-utilization AI workloads, owning or colocating GPUs usually beats on-demand cloud within 12–24 months once you account for egress, reserved-instance lock-in, and premium managed-service margins. Racklion models your specific utilization before you commit.'
  },
  {
    q: 'How do I source H100, H200, or GB200 capacity?',
    a: 'Supply is allocation-constrained and moves through OEMs, integrators, and colocation partners rather than a public price list. Racklion sources allocation, negotiates terms, and lines up the power and space to run it.'
  },
  {
    q: 'What is cloud repatriation and when does it make sense?',
    a: 'Cloud repatriation is moving workloads from rented public cloud back to owned or colocated infrastructure. It makes sense when spend grows faster than workload value, when data gravity and egress dominate the bill, or when latency, sovereignty, or vendor concentration become risks.'
  },
  {
    q: 'Do I have to build my own data center to leave the cloud?',
    a: 'No. Most teams start with colocation — you own or lease the servers and GPUs and rent space, power, and cooling in an existing data center. Racklion sources the colo, the hardware, and the power so you get ownership economics without building a facility.'
  },
  {
    q: 'How much power and cooling do modern GPU racks need?',
    a: 'Dense AI racks now draw 40–130 kW each, well beyond legacy 5–10 kW designs, which is why power and cooling — not chips — is often the real constraint. Racklion sources data-center space with the power envelope and liquid-cooling readiness your hardware requires.'
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
  const route = ROUTES.find((r) => r.view === view);
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
    description: 'Cloud-exit advisory and infrastructure sourcing: GPUs, power, colocation, and data-center space.'
  };
}

export function serviceJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Infrastructure sourcing and cloud-exit advisory',
    provider: { '@type': 'Organization', name: 'Racklion', url: `${SITE_URL}/` },
    areaServed: 'Global',
    description: 'Source GPU capacity, colocation, power, and data-center space, and pressure-test the cloud-versus-own decision.'
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
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    jsonLd
  ].join('\n    ');
}
