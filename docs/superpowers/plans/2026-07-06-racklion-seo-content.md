# Racklion SEO / AI-Search + Content Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Racklion crawlable by AI answer-engines and traditional search, and complete the cloud-exit funnel by adding the missing "source capacity" (GPUs / power / space) and FAQ content.

**Architecture:** The site is a vanilla Vite SPA that renders every page as HTML strings, but only in the browser — so crawlers see an empty `<div>`. We extract the render functions into a pure, isomorphic module (no browser globals) that both the browser app and a Node build-time prerender script can call. The prerender script emits one real, text-complete HTML file per route with per-page `<title>`/meta/OpenGraph/JSON-LD injected. Routing moves from hash (`#/consulting`) to real paths (`/consulting`) so each page is a distinct indexable URL. No headless browser and no new runtime dependency are introduced.

**Tech Stack:** Vite 8, vanilla ES modules, Node 22 (`node --test`, `node:fs`), lucide (icons, browser-only), GitHub Actions (existing daily scrape).

## Global Constraints

- **Production origin:** `SITE_URL = 'https://racklion.com'` — used verbatim in canonicals, sitemap, JSON-LD, robots, llms.txt. **Confirm the real domain before Task 1** and change this one constant if it differs.
- **No new runtime dependencies.** Prerender uses Node built-ins only. Tests use `node --test` (built-in). Do not add Playwright/Puppeteer/JSDOM.
- **Isomorphic purity:** any file imported by both the browser and Node (`src/routes.js`, `src/seo.js`, `src/render.js`) must not reference `window`, `document`, `localStorage`, `location`, `fetch`, or import CSS. Browser-only state is passed in as function arguments.
- **Client stays authoritative for live data.** Prerendered HTML is a crawlable snapshot; on load, `main.js` re-renders `#app` from the live `/data/newsletter-intel.json` fetch. Never remove the runtime fetch.
- **Escaping:** all interpolated text uses the existing `escapeHtml` (body) or `escapeAttr` (attributes). No raw user/data strings in HTML.
- **Commit style:** frequent, one deliverable per commit, conventional-commit prefixes (`feat:`, `refactor:`, `chore:`).

---

## File Structure

**New files:**
- `src/routes.js` — pure route model: `SITE_URL`, `ROUTES`, `viewFromPath`, `pathForView`, `normalizePath`. Imported by browser, prerender, sitemap.
- `src/seo.js` — pure SEO builders: per-view `<title>`/description, canonical, OpenGraph/Twitter tags, JSON-LD (`Organization`, `Service`, `FAQPage`), and `FAQ_ENTRIES` (single source of truth for FAQ copy).
- `src/render.js` — pure, isomorphic view renderers extracted from `main.js` (header + all page views). Takes an explicit state object; no browser globals.
- `scripts/prerender.mjs` — post-build: reads `dist/index.html` template + live JSON, writes one HTML file per route with injected head + body.
- `scripts/gen-sitemap.mjs` — writes `dist/sitemap.xml` from `ROUTES`.
- `scripts/verify-build.mjs` — asserts prerendered output is text-complete and SEO tags are present; non-zero exit on failure (the build gate).
- `public/robots.txt` — allows all + explicitly names AI crawlers; points to sitemap.
- `public/llms.txt` — plain-text site summary for AI crawlers.
- `test/routes.test.mjs`, `test/seo.test.mjs`, `test/render.test.mjs` — `node --test` unit tests for the pure modules.

**Modified files:**
- `index.html` — sensible default `<title>`/description (dev/fallback); `#app` stays empty (prerender fills it).
- `src/main.js` — use `viewFromPath` instead of `getViewFromHash`; import views from `render.js`; convert links `#/x` → `/x`; add click interception + `popstate`; set `document.title`/meta per view via `seo.js`.
- `package.json` — `build` chain (vite → prerender → sitemap → verify), `test`, `prerender` scripts.

---

## Phase 1 — Crawlability (rendering + SEO)

### Task 1: Pure route model

**Files:**
- Create: `src/routes.js`
- Create: `test/routes.test.mjs`

**Interfaces:**
- Produces: `SITE_URL: string`, `ROUTES: Array<{path,view,label}>`, `normalizePath(pathname:string):string`, `viewFromPath(pathname:string):string`, `pathForView(view:string):string`.

- [ ] **Step 1: Write the failing test**

```js
// test/routes.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/routes.test.mjs`
Expected: FAIL — `Cannot find module '../src/routes.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/routes.js
// Pure route model shared by the browser app, the prerender script, and the
// sitemap generator. No browser globals — safe to import in Node.

export const SITE_URL = 'https://racklion.com';

export const ROUTES = [
  { path: '/',           view: 'home',       label: 'Home' },
  { path: '/signals',    view: 'signals',    label: 'Signals' },
  { path: '/source',     view: 'source',     label: 'Source Capacity' },
  { path: '/consulting', view: 'consulting', label: 'Consulting' },
  { path: '/about',      view: 'about',      label: 'About' },
  { path: '/faq',        view: 'faq',        label: 'FAQ' },
  { path: '/subscribe',  view: 'subscribe',  label: 'Subscribe' }
];

const VIEW_BY_PATH = new Map(ROUTES.map((r) => [r.path, r.view]));

export function normalizePath(pathname) {
  if (!pathname) return '/';
  const stripped = pathname.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
}

export function viewFromPath(pathname) {
  return VIEW_BY_PATH.get(normalizePath(pathname)) || 'home';
}

export function pathForView(view) {
  const match = ROUTES.find((r) => r.view === view);
  return match ? match.path : '/';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/routes.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/routes.js test/routes.test.mjs
git commit -m "feat: add pure path-based route model"
```

---

### Task 2: Pure SEO module (meta, OpenGraph, JSON-LD, FAQ source of truth)

**Files:**
- Create: `src/seo.js`
- Create: `test/seo.test.mjs`

**Interfaces:**
- Consumes: `SITE_URL`, `ROUTES` from `src/routes.js`.
- Produces: `metaForView(view):{title,description}`, `canonicalForView(view):string`, `headTagsForView(view):string` (full head HTML fragment), `jsonLdForView(view):object[]`, `FAQ_ENTRIES:Array<{q,a}>`, `faqJsonLd():object`.

- [ ] **Step 1: Write the failing test**

```js
// test/seo.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/seo.test.mjs`
Expected: FAIL — `Cannot find module '../src/seo.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/seo.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/seo.js test/seo.test.mjs
git commit -m "feat: add pure SEO meta and JSON-LD builders"
```

---

### Task 3: Extract isomorphic render layer

Move the view-rendering functions out of `src/main.js` into `src/render.js` and make them pure (state passed in, no browser globals). `main.js` keeps event handling, data fetch, and its module `state`, and calls into `render.js`.

**Files:**
- Create: `src/render.js`
- Create: `test/render.test.mjs`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `topicLabel`, `FAQ_ENTRIES` (from `seo.js`), route helpers as needed.
- Produces: `renderPage(view:string, ctx):string` where
  `ctx = { data, query, topic, sort, selectedTopics:Set, subscriberStatus, leadStatus, savedLead, demoSubscriber }`.
  `renderPage` returns the full inner-HTML of `#app` (site header + the view), identical markup to what the browser produces today.

- [ ] **Step 1: Write the failing test**

```js
// test/render.test.mjs
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

test('renderPage(faq) renders every FAQ question', () => {
  const html = renderPage('faq', ctx);
  assert.match(html, /repatriation/);
});

test('renderPage never references undefined browser globals (no throw)', () => {
  for (const v of ['home','signals','source','consulting','about','faq','subscribe']) {
    assert.doesNotThrow(() => renderPage(v, ctx), v);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.mjs`
Expected: FAIL — `Cannot find module '../src/render.js'`.

- [ ] **Step 3: Create `src/render.js` by moving the render functions**

Move these functions verbatim from `src/main.js` into `src/render.js`, applying the exact edits listed below. Keep their bodies otherwise unchanged.

Functions to move (current `main.js` lines): `escapeHtml`, `safeUrl`, `faviconUrl`, `topicLabel` + `topicLabels`, `formatDate`, `relativeTime`, `pressureLabel`, `renderSiteHeader`, `renderHeroStat`, `renderHero`, `renderConsultingSection`, `renderPressureDrivers`, `renderConsultationForm`, `renderTopicButton`, `renderToolbar`, `renderArticle`, `renderIssuePreview`, `renderSubscribeForm`, `renderSourceList`, `renderSourceHealth`, `renderDigestIntro`, `renderHomeSignal`, `renderHome`, `renderSignalsPage`, `renderAboutPage`, `renderConsultingPage`, `renderSubscribePage`, and the data-derived helpers `getTopics`, `filteredItems`, `selectedIssueItems`, `topTopic`.

Apply these signature changes so nothing reads module state or browser globals:

- Every function that read the module `state` now takes `state` (the `ctx`) as its **first parameter** and reads `state.data`, `state.query`, `state.topic`, `state.sort`, `state.selectedTopics`, `state.view`. Example — `filteredItems()` becomes `filteredItems(state)`; internal `state.data?.items` stays as written.
- `renderSiteHeader()` → `renderSiteHeader(view)`; replace the four `state.view === '...'` checks with `view === '...'`.
- `renderConsultationForm()` → `renderConsultationForm(savedLead)`; delete the `localStorage.getItem(savedLeadKey)` line and use the `savedLead` parameter.
- `renderSubscribeForm()` → `renderSubscribeForm(state, demoSubscriber)`; delete the `localStorage.getItem(savedSubscriberKey)` line and use the `demoSubscriber` parameter. Keep `getTopics(state)` for the checkbox list and `state.selectedTopics.has(topic)`.
- `renderToolbar(items)` → `renderToolbar(state, items)`; `getTopics()` → `getTopics(state)`, `state.topic`/`state.query`/`state.sort` read from the passed `state`.
- Thread `state` through page renderers: `renderHome(state, items)`, `renderSignalsPage(state, items)` (which calls `renderToolbar(state, items)`, `renderIssuePreview(state)`, `renderSourceHealth(state)`), `renderConsultingPage(state)` (calls `renderConsultationForm(state.savedLead)` and `renderConsultingSection()`), `renderSubscribePage(state)` (calls `renderSubscribeForm(state, state.demoSubscriber)` and `renderIssuePreview(state)`), `renderAboutPage()` (no state needed).
- `renderIssuePreview()` → `renderIssuePreview(state)`; `selectedIssueItems()` → `selectedIssueItems(state)`.
- `renderSourceHealth()` → `renderSourceHealth(state)`; `renderSourceList()` → `renderSourceList(state)`.
- Import shared copy: `import { FAQ_ENTRIES } from './seo.js';` (used by the new FAQ renderer in Task 10). No CSS import, no lucide import (icons remain `<i data-lucide="...">` placeholders).

Add the isomorphic entry point at the bottom of `src/render.js`:

```js
export function renderPage(view, state) {
  const items = filteredItems(state);
  const views = {
    home: renderHome(state, items),
    signals: renderSignalsPage(state, items),
    source: renderSourcePage(state),      // added in Task 10
    consulting: renderConsultingPage(state),
    about: renderAboutPage(),
    faq: renderFaqPage(),                  // added in Task 10
    subscribe: renderSubscribePage(state)
  };
  return `${renderSiteHeader(view)}${views[view] || views.home}`;
}
```

> `renderSourcePage`/`renderFaqPage` are added in Task 10. For this task, temporarily map `source` and `faq` to `renderHome(state, items)` so the module is valid and the Task 3 tests for those views still find "GPU"/"repatriation"? No — instead, land Task 3 with `source`/`faq` **omitted** from the `views` map (they fall back to `home`), and mark the two Task-3 test cases for `source`/`faq` as `{ skip: true }` until Task 10. Re-enable them in Task 10.

Correction to keep steps honest: in **Step 1** above, add `{ skip: true }` to the `renderPage(source)` and `renderPage(faq)` tests, e.g. `test('renderPage(source) ...', { skip: 'until Task 10' }, () => {...})`. Task 10 removes the skips.

- [ ] **Step 4: Rewire `src/main.js` to consume `render.js`**

In `src/main.js`:
- Delete the moved function definitions (they now live in `render.js`).
- Add: `import { renderPage } from './render.js';` and `import { headTagsForView } from './seo.js';` and `import { viewFromPath, pathForView } from './routes.js';`
- Keep `import './styles.css';` and the lucide imports (`createIcons`, icon set) in `main.js` — the browser still swaps icons.
- Replace `getViewFromHash` with: `function currentView() { return viewFromPath(window.location.pathname); }` and set `state.view = currentView();` at init.
- In `renderApp`, build the `ctx` from module state and set head + body:

```js
function renderApp() {
  if (state.error) { /* unchanged error branch */ }
  if (!state.data) { /* unchanged loading branch */ }

  const ctx = {
    data: state.data,
    query: state.query,
    topic: state.topic,
    sort: state.sort,
    view: state.view,
    selectedTopics: state.selectedTopics,
    subscriberStatus: state.subscriberStatus,
    leadStatus: state.leadStatus,
    savedLead: localStorage.getItem(savedLeadKey),
    demoSubscriber: localStorage.getItem(savedSubscriberKey)
  };
  document.title = require_title(state.view);      // see below
  app.innerHTML = renderPage(state.view, ctx);
  applyHead(state.view);
  createIcons({ icons });
}
```

Replace the `document.title`/`require_title` sketch with a real head-sync helper in `main.js` (updates title + description + canonical for SPA navigations and JS-running crawlers):

```js
import { metaForView, canonicalForView } from './seo.js';

function applyHead(view) {
  const meta = metaForView(view);
  document.title = meta.title;
  setMeta('name', 'description', meta.description);
  setLink('canonical', canonicalForView(view));
}
function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', value);
}
function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) { el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el); }
  el.setAttribute('href', href);
}
```

(Remove the `require_title`/`headTagsForView` import lines from the sketch; `applyHead` covers runtime. `headTagsForView` is used by the prerender script, not the browser.)

- [ ] **Step 5: Convert routing from hash to real paths in `main.js`**

- Replace every link `href="#/signals"` → `href="/signals"`, `#/about` → `/about`, `#/consulting` → `/consulting`, `#/subscribe` → `/subscribe`, and brand `href="#/"` → `href="/"`. (These live inside the moved renderers; make the change in `render.js`.)
- Replace the `hashchange` listener with client-side navigation:

```js
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/"]');
  if (!link) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  if (link.target === '_blank' || link.hasAttribute('download')) return;
  event.preventDefault();
  const path = new URL(link.href).pathname;
  if (path !== window.location.pathname) {
    window.history.pushState({}, '', path);
    state.view = viewFromPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderApp();
  }
});

window.addEventListener('popstate', () => {
  state.view = viewFromPath(window.location.pathname);
  renderApp();
});
```

Delete the old `window.addEventListener('hashchange', ...)` block and `getViewFromHash`.

- [ ] **Step 6: Run unit tests + dev smoke check**

Run: `node --test`
Expected: PASS for `routes`, `seo`, and the non-skipped `render` tests.

Run: `npm run dev`, then in the browser open `/`, `/signals`, `/consulting`, `/about`, `/subscribe`. Expected: each path renders its page (full reload and in-app link clicks both work); the browser tab title changes per page; no console errors.

- [ ] **Step 7: Commit**

```bash
git add src/render.js src/main.js test/render.test.mjs
git commit -m "refactor: extract isomorphic render layer and switch to path routing"
```

---

### Task 4: Build-time prerender script

**Files:**
- Create: `scripts/prerender.mjs`
- Modify: `index.html` (default title/description; `#app` stays empty)
- Modify: `package.json` (add `prerender` script)

**Interfaces:**
- Consumes: `ROUTES` (routes.js), `headTagsForView` (seo.js), `renderPage` (render.js), built `dist/index.html`, live `dist/data/newsletter-intel.json`.
- Produces: `dist/<path>/index.html` for every route (root → `dist/index.html`).

- [ ] **Step 1: Set a clean default head in `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>Racklion — Cloud Exit, On-Prem & AI Infrastructure Sourcing</title>
    <meta
      name="description"
      content="Racklion helps teams leave rented cloud: cloud-exit economics, on-prem readiness, and sourcing GPUs, power, and data-center space."
    />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the prerender script**

```js
// scripts/prerender.mjs
// Post-build static prerender. Runs the isomorphic render layer in Node and
// writes one text-complete HTML file per route, with per-page head injected.
// No headless browser, no runtime dependency.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '../src/routes.js';
import { headTagsForView } from '../src/seo.js';
import { renderPage } from '../src/render.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

const template = await readFile(join(distDir, 'index.html'), 'utf8');
const data = JSON.parse(await readFile(join(distDir, 'data', 'newsletter-intel.json'), 'utf8'));

function ssrState(view) {
  return {
    data, view, query: '', topic: 'all', sort: 'pressure',
    selectedTopics: new Set(), subscriberStatus: '', leadStatus: '',
    savedLead: null, demoSubscriber: null
  };
}

function buildHtml(view) {
  const body = renderPage(view, ssrState(view));
  const head = headTagsForView(view);
  return template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/i, '')
    .replace(/<\/head>/i, `    ${head}\n  </head>`)
    .replace(/<div id="app">\s*<\/div>/i, `<div id="app">${body}</div>`);
}

for (const route of ROUTES) {
  const html = buildHtml(route.view);
  const outPath = route.path === '/'
    ? join(distDir, 'index.html')
    : join(distDir, route.path.replace(/^\//, ''), 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
  console.log(`prerendered ${route.path} -> ${outPath.replace(root + '/', '')}`);
}
```

- [ ] **Step 3: Add the `prerender` script to `package.json`**

```json
"scripts": {
  "dev": "vite --host 127.0.0.1",
  "build": "vite build && node scripts/prerender.mjs",
  "prerender": "node scripts/prerender.mjs",
  "preview": "vite preview --host 127.0.0.1",
  "scrape": "node scripts/scrape-daily.mjs",
  "scrape:dry": "node scripts/scrape-daily.mjs --dry-run",
  "test": "node --test"
}
```

- [ ] **Step 4: Run the build and verify prerendered output**

Run: `npm run build`
Then: `grep -c "On-Prem Signal" dist/index.html` → Expected: ≥ 1 (content is now in the HTML, not just JS).
Then: `grep -o "<title>[^<]*</title>" dist/consulting/index.html` → Expected: the consulting-specific title.
Then: `grep -c "application/ld+json" dist/consulting/index.html` → Expected: ≥ 1.

- [ ] **Step 5: Commit**

```bash
git add scripts/prerender.mjs index.html package.json
git commit -m "feat: prerender each route to crawlable HTML at build time"
```

---

### Task 5: robots.txt + llms.txt

**Files:**
- Create: `public/robots.txt`
- Create: `public/llms.txt`

(`public/` files are copied verbatim to `dist/` by Vite.)

- [ ] **Step 1: Write `public/robots.txt`**

```text
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: https://racklion.com/sitemap.xml
```

- [ ] **Step 2: Write `public/llms.txt`**

```text
# Racklion

> Cloud-exit advisory and infrastructure sourcing. Racklion helps teams stop renting public cloud and instead source and own GPUs, power, colocation, and data-center space.

## What Racklion does
- Cloud-exit economics: model egress, reserved spend, utilization, and the true cost of staying in rented cloud.
- On-prem readiness, hybrid architecture, and resilience planning.
- Sourcing: GPU capacity (H100 / H200 / GB200), colocation, power, and data-center space.

## Key pages
- Source capacity: https://racklion.com/source
- Consulting: https://racklion.com/consulting
- FAQ: https://racklion.com/faq
- Daily On-Prem Signal (infrastructure news): https://racklion.com/signals
- About: https://racklion.com/about
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Then: `test -f dist/robots.txt && test -f dist/llms.txt && echo OK` → Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add public/robots.txt public/llms.txt
git commit -m "feat: add robots.txt (allowing AI crawlers) and llms.txt"
```

---

### Task 6: Sitemap generator

**Files:**
- Create: `scripts/gen-sitemap.mjs`
- Modify: `package.json` (chain into `build`)

**Interfaces:**
- Consumes: `ROUTES`, `SITE_URL` (routes.js).
- Produces: `dist/sitemap.xml`.

- [ ] **Step 1: Write the generator**

```js
// scripts/gen-sitemap.mjs
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, SITE_URL } from '../src/routes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);

const urls = ROUTES.map((r) => {
  const loc = r.path === '/' ? `${SITE_URL}/` : `${SITE_URL}${r.path}`;
  const changefreq = r.view === 'signals' ? 'daily' : 'weekly';
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n  </url>`;
}).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
await writeFile(join(root, 'dist', 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml written with ${ROUTES.length} urls`);
```

- [ ] **Step 2: Chain into build in `package.json`**

```json
"build": "vite build && node scripts/prerender.mjs && node scripts/gen-sitemap.mjs",
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Then: `grep -c "<loc>" dist/sitemap.xml` → Expected: `7`.

- [ ] **Step 4: Commit**

```bash
git add scripts/gen-sitemap.mjs package.json
git commit -m "feat: generate sitemap.xml from route model"
```

---

### Task 7: Build-verification gate

**Files:**
- Create: `scripts/verify-build.mjs`
- Modify: `package.json` (chain into `build`)

- [ ] **Step 1: Write the verifier**

```js
// scripts/verify-build.mjs
// Fails the build if prerender did not produce crawlable, SEO-complete output.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const checks = [
  ['index.html',            ['Racklion', 'On-Prem Signal', 'application/ld+json', 'rel="canonical"']],
  ['source/index.html',     ['Source', 'GPU', 'colocation', 'application/ld+json']],
  ['consulting/index.html', ['Cloud exit math', 'rel="canonical"', 'og:title']],
  ['faq/index.html',        ['FAQPage', 'repatriation']],
  ['about/index.html',      ['About Racklion']],
  ['signals/index.html',    ['On-Prem Signal']],
  ['subscribe/index.html',  ['Subscribe']],
  ['sitemap.xml',           ['<loc>https://racklion.com/source</loc>']],
  ['robots.txt',            ['GPTBot', 'Sitemap:']],
  ['llms.txt',              ['Racklion', '/source']]
];

let failed = 0;
for (const [file, needles] of checks) {
  let html = '';
  try { html = await readFile(join(distDir, file), 'utf8'); }
  catch { console.error(`MISSING: dist/${file}`); failed++; continue; }
  for (const needle of needles) {
    if (!html.includes(needle)) { console.error(`FAIL: dist/${file} missing "${needle}"`); failed++; }
  }
}

if (failed) { console.error(`\n${failed} verification check(s) failed.`); process.exit(1); }
console.log('Build verification passed.');
```

- [ ] **Step 2: Chain into build**

```json
"build": "vite build && node scripts/prerender.mjs && node scripts/gen-sitemap.mjs && node scripts/verify-build.mjs",
```

- [ ] **Step 3: Run**

Run: `npm run build`
Expected: ends with `Build verification passed.` and exit code 0.
(Note: the `source`/`faq`/`consulting` content checks fully pass only after Task 10; until then this task's checks for those files may fail — land Task 7 but expect the `source`/`faq` needles to go green in Task 10. Keep the failing needles; they are the gate that Task 10 must satisfy.)

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-build.mjs package.json
git commit -m "feat: add build verification gate for prerendered SEO output"
```

---

### Task 8: Host fallback for unknown routes

Static hosts serve `dist/<route>/index.html` for known routes automatically. Unknown paths need a fallback so a deep link doesn't 404 before the SPA can route.

**Files:**
- Create: `vercel.json` (if deploying on Vercel — confirmed as the session's platform)

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "cleanUrls": true,
  "trailingSlash": false,
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

> `cleanUrls` serves `/source` from `/source/index.html`. The rewrite is the last-resort fallback for paths without a prerendered file; the SPA then renders from `viewFromPath`. If the host is not Vercel, replace with the equivalent (`_redirects` for Netlify: `/*  /index.html  200`).

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add SPA fallback + clean URLs for static host"
```

---

## Phase 2 — Content funnel (execution + FAQ)

### Task 9: (reserved) — no-op placeholder removed

*(Numbering continues at Task 10; Phase 2 begins there.)*

---

### Task 10: "Source Capacity" page + FAQ page renderers

Complete the funnel: the page that says Racklion actually **sources GPUs, power, and space**, plus an extractable FAQ. Both use copy already defined in `seo.js` (`FAQ_ENTRIES`) so JSON-LD and on-page text never drift.

**Files:**
- Modify: `src/render.js` (add `renderSourcePage`, `renderFaqPage`; wire into `renderPage`)
- Modify: `test/render.test.mjs` (remove the `skip` flags from Task 3)

**Interfaces:**
- Consumes: `FAQ_ENTRIES` (already imported in `render.js`), existing `escapeHtml`.
- Produces: `renderSourcePage(state):string`, `renderFaqPage():string`, both mapped in `renderPage`.

- [ ] **Step 1: Remove the skips and run tests (red)**

Delete `{ skip: 'until Task 10' }` from the `renderPage(source)` and `renderPage(faq)` tests.
Run: `node --test test/render.test.mjs`
Expected: FAIL — `source`/`faq` fall back to home, missing "colocation"/"repatriation".

- [ ] **Step 2: Add `renderSourcePage` to `src/render.js`**

```js
function renderSourcePage(state) {
  const offerings = [
    ['cpu', 'GPU capacity', 'Source allocation for H100, H200, and GB200 class accelerators through OEMs, integrators, and colocation partners — with terms and lead times, not a waitlist.'],
    ['hard-drive', 'Colocation & space', 'Secure rack space and cages in vetted facilities so you own the servers and GPUs without building or leasing a data center.'],
    ['zap', 'Power & cooling', 'Match dense AI racks (40–130 kW) to facilities with the power envelope and liquid-cooling readiness they actually require.'],
    ['server', 'Servers & storage', 'Spec and source the compute, storage, and networking around the accelerators so the stack ships as one coherent build.']
  ];
  return `
    <main class="page-main page-view">
      <section class="page-heading">
        <span class="eyebrow">Source Capacity</span>
        <h1>Stop renting. Source and own the stack behind your AI workloads.</h1>
        <p>Most teams rent everything and own nothing. When utilization is steady, that is the most expensive way to run AI. Racklion sources the GPUs, power, colocation, and space so you get ownership economics without building a data center.</p>
        <div class="home-actions">
          <a class="primary-action" href="/consulting">
            <i data-lucide="clipboard-check"></i>
            <span>Start a sourcing conversation</span>
          </a>
          <a class="secondary-inline" href="/faq">
            <i data-lucide="newspaper"></i>
            <span>Read the sourcing FAQ</span>
          </a>
        </div>
      </section>
      <section class="driver-strip" aria-label="What Racklion sources">
        ${offerings.map(([icon, title, copy]) => `
          <article>
            <i data-lucide="${icon}"></i>
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(copy)}</p>
          </article>
        `).join('')}
      </section>
      <section class="about-cta">
        <div>
          <span class="eyebrow">How it works</span>
          <h2>Advise on the decision, then execute the sourcing.</h2>
          <p>We pressure-test the cloud-versus-own math first, then line up allocation, colocation, and power against your timeline.</p>
        </div>
        <a class="primary-action" href="/consulting">
          <i data-lucide="send"></i>
          <span>Tell us what you need to source</span>
        </a>
      </section>
    </main>
  `;
}
```

- [ ] **Step 3: Add `renderFaqPage` to `src/render.js`**

```js
function renderFaqPage() {
  return `
    <main class="page-main page-view">
      <section class="page-heading">
        <span class="eyebrow">FAQ</span>
        <h1>Renting versus owning GPUs, power, and space.</h1>
        <p>Straight answers to the questions teams ask before leaving rented cloud.</p>
      </section>
      <section class="about-grid" aria-label="Frequently asked questions">
        ${FAQ_ENTRIES.map((e) => `
          <article>
            <h2>${escapeHtml(e.q)}</h2>
            <p>${escapeHtml(e.a)}</p>
          </article>
        `).join('')}
      </section>
      <section class="about-cta">
        <div>
          <span class="eyebrow">Next Step</span>
          <h2>Have a workload in mind? Let us source it.</h2>
        </div>
        <a class="primary-action" href="/source">
          <i data-lucide="clipboard-check"></i>
          <span>Source capacity</span>
        </a>
      </section>
    </main>
  `;
}
```

- [ ] **Step 4: Wire both into `renderPage`**

In the `views` map inside `renderPage`, ensure:
```js
    source: renderSourcePage(state),
    faq: renderFaqPage(),
```

- [ ] **Step 5: Run tests + build gate**

Run: `node --test`
Expected: PASS (all render tests, no skips).
Run: `npm run build`
Expected: `Build verification passed.` — the Task 7 `source`/`faq` needles now go green.

- [ ] **Step 6: Commit**

```bash
git add src/render.js test/render.test.mjs
git commit -m "feat: add Source Capacity and FAQ pages completing the funnel"
```

---

### Task 11: Add Source + FAQ to nav and homepage funnel

**Files:**
- Modify: `src/render.js` (`renderSiteHeader`, `renderHome`)

**Interfaces:**
- Consumes: nothing new. Uses `view` param already threaded into `renderSiteHeader`.

- [ ] **Step 1: Add nav links in `renderSiteHeader`**

Inside the `<nav>` in `renderSiteHeader(view)`, add `Source` and `FAQ` links (order: Signals, Source, Consulting, About, FAQ, Subscribe):

```js
        <a class="${view === 'signals' ? 'is-active' : ''}" href="/signals">Signals</a>
        <a class="${view === 'source' ? 'is-active' : ''}" href="/source">Source</a>
        <a class="${view === 'consulting' ? 'is-active' : ''}" href="/consulting">Consulting</a>
        <a class="${view === 'about' ? 'is-active' : ''}" href="/about">About</a>
        <a class="${view === 'faq' ? 'is-active' : ''}" href="/faq">FAQ</a>
        <a class="${view === 'subscribe' ? 'is-active' : ''}" href="/subscribe">Subscribe</a>
```

- [ ] **Step 2: Surface the execution step on the homepage**

In `renderHome`, change the primary CTA copy/target in the `home-brief` block so the funnel points to sourcing as the payoff. Replace the existing `home-actions` block in `renderHome` with:

```js
        <div class="home-actions">
          <a class="primary-action" href="/source">
            <i data-lucide="server"></i>
            <span>Source GPUs, power &amp; space</span>
          </a>
          <a class="secondary-inline" href="/consulting">
            <i data-lucide="clipboard-check"></i>
            <span>Pressure-test the decision</span>
          </a>
        </div>
```

Also update the `home-brief` paragraph to name the whole funnel:

```js
          <p>
            Racklion pairs a daily infrastructure brief with advisory and sourcing: decide whether workloads
            should stay in rented cloud — then get the GPUs, power, colocation, and space to own the ones that shouldn't.
          </p>
```

- [ ] **Step 3: Build + smoke check**

Run: `npm run build`
Expected: `Build verification passed.`
Run: `npm run dev` → open `/`; confirm nav shows Source and FAQ, homepage CTA links to `/source`, both new pages render and are reachable by click and by direct URL.

- [ ] **Step 4: Commit**

```bash
git add src/render.js
git commit -m "feat: wire Source/FAQ into nav and point homepage funnel at sourcing"
```

---

### Task 12: Open Graph image

Social/AI cards reference `/og-default.png` (set in `seo.js`). Provide the asset so the reference resolves.

**Files:**
- Create: `public/og-default.png` (1200×630)

- [ ] **Step 1: Add the image**

Export a 1200×630 PNG with the Racklion wordmark + tagline "Cloud exit. On-prem. Infrastructure sourcing." Place at `public/og-default.png`. (If no brand asset exists yet, ship a simple dark card with the wordmark; replace later.)

- [ ] **Step 2: Build + verify**

Run: `npm run build`
Then: `test -f dist/og-default.png && echo OK` → Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add public/og-default.png
git commit -m "chore: add default Open Graph share image"
```

---

### Task 13: README + CI note

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new build pipeline**

Add a section:

```markdown
## Build & SEO

`npm run build` runs: `vite build` → `node scripts/prerender.mjs` (writes a
crawlable HTML file per route) → `node scripts/gen-sitemap.mjs` → `node
scripts/verify-build.mjs` (fails the build if any page is missing content or
SEO tags). Routes and the production origin (`SITE_URL`) live in `src/routes.js`.
`public/robots.txt` explicitly allows AI crawlers (GPTBot, ClaudeBot,
PerplexityBot, Google-Extended); `public/llms.txt` summarizes the site for them.

Run tests: `npm test` (`node --test`).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document prerender build pipeline and SEO files"
```

---

## Phase 3 — Interactive Telegram/Slack front end *(separate plan)*

This is an independent subsystem (a backend service + bot adapters) and should get its own plan at execution time. Spec outline to hand to `superpowers:brainstorming` → `writing-plans`:

- **Shared intake endpoint.** One provider-agnostic HTTP endpoint that accepts the exact lead payload the site already defines (`submitLead` in `main.js`: `{name,email,company,pressure,message,source,submittedAt}`) and writes to a CRM/webhook. The website form (`VITE_LEAD_ENDPOINT`) and both bots POST to it — no logic duplication. Keep it portable (host-agnostic function; align with the pg_cron/authenticated-endpoint pattern used elsewhere).
- **Telegram adapter.** Bot via Telegram Bot API webhook → conversational intake (workload, GPU count, region, timeline) → same endpoint. Qualifies and hands off.
- **Slack adapter.** Slack app (Events API / slash command) → same intake flow → same endpoint.
- **Optional RAG "ask Racklion" mode.** Answer sourcing questions from site content (`newsletter-intel.json` + FAQ + service copy). Decide provider posture: per the BYOM constraint, keep generation provider-agnostic; embeddings platform-managed.
- **Open decision:** standalone Racklion bot vs. first live deployment of Koffey.ai against this flow (dogfooding). Resolve during brainstorming before planning.

---

## Self-Review

**Spec coverage:**
- Traditional SEO — per-page URLs (Task 1,3), unique title/description (Task 2,3,4), robots.txt (5), sitemap.xml (6), JSON-LD (2,4), OpenGraph (2,4,12), canonical (2,3) ✅
- AI search — prerendered text so JS-blind crawlers see content (3,4), AI bots explicitly allowed (5), llms.txt (5), extractable FAQ Q&A + FAQPage schema (2,10) ✅
- Content funnel — missing execution/sourcing page (10), FAQ (10), nav + homepage funnel (11) ✅
- Bot — scoped as separate Phase 3 plan ✅

**Placeholder scan:** No "TBD"/"handle edge cases"/"write tests for the above". The one deliberate cross-task dependency (Task 3 skips `source`/`faq` tests until Task 10; Task 7 needles for those files go green in Task 10) is called out explicitly at both ends. og-default.png is a real asset step, not a placeholder.

**Type consistency:** `renderPage(view, state)` signature is identical in render.js, prerender.mjs, and render.test.mjs. `ctx`/`ssrState` fields match (`data, view, query, topic, sort, selectedTopics, subscriberStatus, leadStatus, savedLead, demoSubscriber`). `headTagsForView`/`metaForView`/`canonicalForView`/`jsonLdForView`/`FAQ_ENTRIES` names match between seo.js, its tests, prerender.mjs, and main.js. `viewFromPath`/`pathForView`/`ROUTES`/`SITE_URL` match across routes.js, main.js, prerender.mjs, gen-sitemap.mjs.
