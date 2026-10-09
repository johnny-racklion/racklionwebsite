// src/render.js
// Pure, isomorphic view renderers. NO browser globals (window/document/
// localStorage/location/fetch), NO CSS import, NO lucide import. Emits
// `<i data-lucide="...">` placeholder strings only; the browser swaps them
// to SVGs after mount. Browser-only state is passed in via a `state` object.
import { FAQ_ENTRIES } from './seo.js';
import { renderGpuPreview, renderGpuPricingPage } from './gpu-pricing-render.js';
import { gpuQuoteMessage } from './gpu-pricing.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderBotFields(state) {
  return `
    <div class="hp-field" aria-hidden="true">
      <label>Company URL<input type="text" name="company_url" tabindex="-1" autocomplete="off" /></label>
    </div>
    <input type="hidden" name="rendered_at" value="" />
    <div class="cf-turnstile" data-sitekey="${escapeHtml(state.turnstileSiteKey || '')}"></div>
  `;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '#';
    return url.href;
  } catch {
    return '#';
  }
}

function faviconUrl(homepage) {
  try {
    const url = new URL(homepage);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
  } catch {
    return '';
  }
}

const topicLabels = {
  'ai-infrastructure': 'AI infrastructure',
  'cloud-cost': 'cloud cost',
  'cloud-risk': 'cloud risk',
  'data-centers': 'data centers',
  'power-cooling': 'power and cooling',
  'private-cloud': 'private cloud'
};

function topicLabel(topic) {
  return topicLabels[topic] || String(topic).replace(/-/g, ' ');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown age';

  const diffHours = Math.round((date.getTime() - Date.now()) / 36e5);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour');
  return formatter.format(Math.round(diffHours / 24), 'day');
}

function pressureLabel(value) {
  if (value >= 86) return 'High';
  if (value >= 68) return 'Building';
  return 'Watch';
}

function getTopics(state) {
  const topics = state.data?.topics?.map((topic) => topic.name) || [];
  const itemTopics = state.data?.items?.flatMap((item) => item.tags) || [];
  return [...new Set([...topics, ...itemTopics])].sort((a, b) =>
    topicLabel(a).localeCompare(topicLabel(b))
  );
}

function filteredItems(state) {
  const items = [...(state.data?.items || [])];
  const query = state.query.trim().toLowerCase();

  return items
    .filter((item) => {
      const matchesTopic = state.topic === 'all' || item.tags?.includes(state.topic);
      if (!matchesTopic) return false;
      if (!query) return true;

      const haystack = [
        item.title,
        item.summary,
        item.source,
        item.category,
        item.onPremAngle,
        ...(item.tags || [])
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (state.sort === 'newest') {
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      }
      if (state.sort === 'source') {
        return a.source.localeCompare(b.source) || b.score - a.score;
      }
      return (b.pressure || b.score) - (a.pressure || a.score) || b.score - a.score;
    });
}

function selectedIssueItems(state) {
  const selected = [...state.selectedTopics];
  const items = state.data?.items || [];
  const scoped = selected.length
    ? items.filter((item) => item.tags?.some((tag) => state.selectedTopics.has(tag)))
    : items;
  return scoped.slice(0, 5);
}

function topTopic(state) {
  return state.data?.topics?.[0]?.name ? topicLabel(state.data.topics[0].name) : 'infrastructure';
}

function renderSiteHeader(view) {
  const links = [['home', 'GPU pricing'], ['signals', 'The signal'], ['source', 'Source capacity'], ['consulting', 'Consulting'], ['about', 'About']];
  return `
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header">
      <a class="brand" href="/" aria-label="Racklion home">
        <img src="/assets/racklion-logo-mark.png" alt="" width="42" height="42" />
        <span>racklion<span class="brand-period">.</span></span>
      </a>
      <nav aria-label="Primary navigation">
        ${links.map(([page, label]) => `<a href="${page === 'home' ? '/' : `/${page}`}" ${(view === 'gpu-pricing' ? 'home' : view) === page ? 'aria-current="page" class="is-active"' : ''}>${label}</a>`).join('')}
        <a class="nav-subscribe" href="#consultation">Contact us <span aria-hidden="true">↗</span></a>
      </nav>
    </header>
  `;
}

function renderRackDrawing() {
  return `<figure class="rack-figure">
    <div class="figure-heading"><span>BEHIND EVERY WORKLOAD</span><span>FIG. 01</span></div>
    <svg class="rack-drawing" viewBox="0 0 500 380" role="img" aria-labelledby="rack-title">
      <title id="rack-title">An architectural drawing of three server racks: compute, power, and space.</title>
      <defs><pattern id="vents" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0v6" stroke="currentColor" stroke-width="1" opacity=".25"/></pattern></defs>
      <g fill="none" stroke="currentColor" stroke-width="1">
        <path d="M26 322H476M46 345H457M46 340v10M457 340v10" opacity=".35"/>
        ${[0, 1, 2].map((rack) => `<g transform="translate(${49 + rack * 137} 54)">
          <path d="M0 20L24 0H138V247L114 267H0Z" fill="var(--paper)"/>
          <path d="M114 20L138 0M0 20H114V267M114 267L138 247"/>
          <path d="M7 28H107V253H7Z" fill="url(#vents)"/>
          ${Array.from({length: 8}, (_, row) => `<g transform="translate(13 ${35 + row * 26})"><rect width="88" height="20" fill="${rack === 1 && row < 4 ? 'var(--accent)' : 'var(--paper)'}"/><path d="M8 6H58M8 10H58M8 14H58" opacity=".5"/><circle cx="77" cy="10" r="2" fill="currentColor"/></g>`).join('')}
          <path d="M5 267v7h12v-7M97 267v7h12v-7"/>
        </g>`).join('')}
      </g>
      <g fill="currentColor" font-family="monospace" font-size="10" letter-spacing="2"><text x="53" y="370">01 / COMPUTE</text><text x="194" y="370">02 / POWER</text><text x="332" y="370">03 / SPACE</text></g>
    </svg>
    <figcaption>The hardware. The power. The place to put it.</figcaption>
  </figure>`;
}

function renderHero() {
  return `
    <section class="hero" aria-label="Infrastructure advisory and sourcing">
      <div class="hero-content">
        <span class="eyebrow"><span class="accent-square" aria-hidden="true"></span> Infrastructure, in the real world</span>
        <h1>The cloud has a<br>physical <em>address.</em></h1>
        <p>GPUs. Power. Space. Someone owns the infrastructure behind your cloud bill. We help you decide when it should be you.</p>
        <div class="hero-actions">
          <a class="primary-action" href="#consultation">Let’s talk infrastructure <span aria-hidden="true">↗</span></a>
          <a class="text-link" href="/source">Explore sourcing <span aria-hidden="true">→</span></a>
        </div>
      </div>
      ${renderRackDrawing()}
    </section>`;
}

function renderFooter() {
  return `<footer class="site-footer">
    <div><a class="footer-brand" href="/">racklion.</a><p>Infrastructure decisions. Grounded in reality.</p></div>
    <nav aria-label="Footer navigation"><a href="/">GPU pricing</a><a href="/signals">The signal</a><a href="#consultation">Talk to us</a><a href="/faq">FAQ</a><a href="/subscribe">Subscribe ↗</a></nav>
    <div class="footer-note"><span>Racklion / Infrastructure advisory & sourcing</span><span>Compute. Power. Space.</span></div>
  </footer>`;
}

function renderConsultingSection() {
  const services = [
    [
      'gauge',
      'Cloud exit math',
      'Model egress, reserved spend, utilization, managed-service dependency, and the real total cost of staying put.'
    ],
    [
      'server',
      'On-prem readiness',
      'Evaluate workload fit, hardware shape, colocation options, storage, networking, operations, and migration risk.'
    ],
    [
      'settings',
      'Hybrid architecture',
      'Design the split between public cloud, private cloud, edge, and owned infrastructure without creating a fragile mess.'
    ],
    [
      'shield-check',
      'Resilience and control',
      'Pressure-test outage exposure, data locality, compliance, vendor concentration, and recovery assumptions.'
    ]
  ];

  return `
    <section class="consulting-section compact-consulting" id="consulting">
      <div class="consulting-copy">
        <span class="eyebrow">Racklion Consulting</span>
        <h2>Make the cloud-versus-on-prem call with a clearer model.</h2>
        <p>
          Racklion helps teams pressure-test workload economics, infrastructure risk, and practical paths before they commit budget or complexity.
        </p>
      </div>
      <div class="service-grid">
        ${services
          .map(
            ([icon, title, copy]) => `
              <article>
                <i data-lucide="${icon}"></i>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(copy)}</p>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function renderPressureDrivers() {
  const drivers = [
    ['zap', 'Power and cooling', 'Grid pressure, liquid cooling, dense racks, and data-center capacity constraints.'],
    ['cpu', 'AI compute', 'GPU supply, inference demand, accelerators, and model-serving economics.'],
    ['gauge', 'Cloud pressure', 'Cost, egress, latency, outages, lock-in, compliance, and regional availability.'],
    ['hard-drive', 'Private stack', 'Servers, storage, networking, hybrid cloud, and self-hosted operations.']
  ];

  return `
    <section class="driver-strip" aria-label="Signals Racklion watches">
      ${drivers
        .map(
          ([icon, title, copy]) => `
            <article>
              <i data-lucide="${icon}"></i>
              <h2>${escapeHtml(title)}</h2>
              <p>${escapeHtml(copy)}</p>
            </article>
          `
        )
        .join('')}
    </section>
  `;
}

function renderConsultationForm(state) {
  const savedLead = state.savedLead;
  return `
    <section class="consultation-panel primary-lead-panel" id="consultation">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Contact us</span>
          <h2>How can we help?</h2>
        </div>
      </div>
      <p>Tell us what you need. We’ll help you work through the details.</p>
      <form id="lead-form">
        <div class="form-grid">
          <label>
            <span>Name</span>
            <input name="name" type="text" placeholder="Your name" autocomplete="name" required />
          </label>
          <label>
            <span>Email</span>
            <input name="email" type="email" placeholder="you@example.com" autocomplete="email" required />
          </label>
        </div>
        <div class="rfs-fields">
          <label><span>Ready-for-service (RFS) date</span><input name="rfs_date" type="date" required aria-describedby="rfs-help" /></label>
          <label class="rfs-unsure"><input name="rfs_unsure" type="checkbox" /> <span>Not sure yet</span></label>
          <p id="rfs-help">When do you need your capacity or infrastructure ready to use?</p>
        </div>
        <label>
          <span>What do you need?</span>
          <textarea name="message" rows="5" placeholder="GPU model, quantity, location, or timing—share what you know. It’s fine if you’re still figuring it out." required>${state.gpuQuote ? escapeHtml(gpuQuoteMessage(state.gpuRequest)) : ''}</textarea>
        </label>
        ${renderBotFields(state)}
        <button class="form-action" type="submit">
          <i data-lucide="send"></i>
          <span>Send message</span>
        </button>
      </form>
      <p role="status" class="form-status ${state.leadStatus || savedLead ? 'is-visible' : ''}">
        ${escapeHtml(state.leadStatus || (savedLead ? 'Latest preview inquiry is saved in this browser.' : ''))}
      </p>
    </section>
  `;
}

function renderTopicButton(state, topic) {
  const isActive = state.topic === topic;
  return `
    <button class="topic-pill ${isActive ? 'is-active' : ''}" data-topic="${escapeHtml(topic)}" type="button">
      ${escapeHtml(topicLabel(topic))}
    </button>
  `;
}

function renderToolbar(state, items) {
  return `
    <section class="toolbar" aria-label="Signal controls">
      <div class="topic-row">
        <button class="topic-pill ${state.topic === 'all' ? 'is-active' : ''}" data-topic="all" type="button">
          all signals
        </button>
        ${getTopics(state).map((topic) => renderTopicButton(state, topic)).join('')}
      </div>
      <div class="tool-row">
        <label class="search-box">
          <i data-lucide="search"></i>
          <input aria-label="Search signals" id="search" value="${escapeHtml(state.query)}" placeholder="Search cost, GPUs, outages, power..." />
        </label>
        <div class="segmented" role="group" aria-label="Sort signals">
          ${[
            ['newest', 'Newest'],
            ['pressure', 'Constraints'],
            ['source', 'Source']
          ]
            .map(
              ([value, label]) => `
                <button class="${state.sort === value ? 'is-active' : ''}" data-sort="${value}" type="button">
                  ${escapeHtml(label)}
                </button>
              `
            )
            .join('')}
        </div>
        <div class="result-count">
          <i data-lucide="sliders-horizontal"></i>
          <span>${escapeHtml(items.length)} shown</span>
        </div>
      </div>
    </section>
  `;
}

function renderArticle(item) {
  const favicon = faviconUrl(item.sourceHomepage);
  const pressure = item.pressure || item.score || 0;
  const tags = (item.tags || [])
    .map(
      (tag) =>
        `<button class="tag" data-topic="${escapeHtml(tag)}" type="button">${escapeHtml(topicLabel(tag))}</button>`
    )
    .join('');

  return `
    <article class="signal-card">
      <div class="signal-meta">
        <div class="signal-source">
          ${favicon ? `<img src="${favicon}" alt="" loading="lazy" />` : '<span class="source-dot"></span>'}
          <div>
            <span>${escapeHtml(item.source)}</span>
            <small>${escapeHtml(item.category)} · ${escapeHtml(relativeTime(item.publishedAt))}</small>
          </div>
        </div>
        <div class="pressure-meter" aria-label="On-prem pull ${escapeHtml(pressure)}">
          <span>${escapeHtml(pressureLabel(pressure))}</span>
          <strong>${escapeHtml(pressure)}</strong>
        </div>
      </div>
      <div class="angle">

        <span>${escapeHtml(item.onPremAngle || 'Build-versus-rent signal')}</span>
      </div>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.summary)}</p>
      <div class="why">
        <strong>Why it matters</strong>
        <span>${escapeHtml(item.whyUseful)}</span>
      </div>
      <div class="signal-footer">
        <div class="tags">${tags}</div>
        <a href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">
          <span>Source</span>
          <i data-lucide="external-link"></i>
        </a>
      </div>
    </article>
  `;
}

function renderIssuePreview(state) {
  const items = selectedIssueItems(state);
  const subject = state.data?.recommendedSubject || 'Is cloud pushing you back on-prem?';
  const selectedTopics = [...state.selectedTopics].map(topicLabel);

  return `
    <section class="brief-panel">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Tomorrow's Brief</span>
          <h2>${escapeHtml(subject)}</h2>
        </div>
        <button class="icon-button" data-action="copy-subject" type="button" aria-label="Copy subject line">
          <i data-lucide="newspaper"></i>
        </button>
      </div>
      <p>
        ${selectedTopics.length
          ? `Tuned for ${escapeHtml(selectedTopics.join(', '))}.`
          : 'Tuned for cloud buyers, infrastructure operators, and technical leaders.'}
      </p>
      <ol class="preview-list">
        ${items
          .map(
            (item) => `
              <li>
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.onPremAngle || item.source)} · ${escapeHtml(formatDate(item.publishedAt))}</span>
              </li>
            `
          )
          .join('')}
      </ol>
    </section>
  `;
}

function renderSubscribeForm(state, demoSubscriber) {
  const topics = getTopics(state);

  return `
    <section class="subscribe-panel" id="subscribe">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Subscribe</span>
          <h2>Get the daily on-prem signal</h2>
        </div>
      </div>
      <p>One concise brief on infrastructure news that changes the cloud-versus-owning-it decision.</p>
      <form id="subscribe-form">
        <label>
          <span>Email</span>
          <input name="email" type="email" placeholder="you@example.com" autocomplete="email" required />
        </label>
        <fieldset>
          <legend>Focus areas</legend>
          <div class="checkbox-grid">
            ${topics
              .map(
                (topic) => `
                  <label>
                    <input type="checkbox" name="topics" value="${escapeHtml(topic)}" data-pref-topic="${escapeHtml(topic)}" ${
                  state.selectedTopics.has(topic) ? 'checked' : ''
                } />
                    <span>${escapeHtml(topicLabel(topic))}</span>
                  </label>
                `
              )
              .join('')}
          </div>
        </fieldset>
        ${renderBotFields(state)}
        <button class="form-action" type="submit">
          <i data-lucide="send"></i>
          <span>Subscribe</span>
        </button>
      </form>
      <p role="status" class="form-status ${state.subscriberStatus ? 'is-visible' : ''}">
        ${escapeHtml(state.subscriberStatus || (demoSubscriber ? 'Latest preview signup is saved in this browser.' : ''))}
      </p>
    </section>
  `;
}

function renderSourceList(state) {
  const sources = state.data?.sources || [];
  if (!sources.length) {
    return '<p class="muted">Sources will appear after the first scraper run.</p>';
  }

  return sources
    .map((source) => {
      const favicon = faviconUrl(source.homepage);
      return `
        <li>
          ${favicon ? `<img src="${favicon}" alt="" loading="lazy" />` : '<span class="source-dot"></span>'}
          <div>
            <span>${escapeHtml(source.name)}</span>
            <small>${escapeHtml(source.category)} · ${escapeHtml(source.itemCount)} kept</small>
          </div>
        </li>
      `;
    })
    .join('');
}

function renderSourceHealth(state) {
  const failures = state.data?.sourceFailures || [];
  const successCount = state.data?.sourcesSucceeded ?? state.data?.sources?.length ?? 0;
  const totalCount = state.data?.sourcesChecked ?? state.data?.sources?.length ?? 0;

  return `
    <section class="source-panel" id="sources">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Source Pulse</span>
          <h2>${escapeHtml(successCount)}/${escapeHtml(totalCount)} feeds refreshed</h2>
        </div>
        <i data-lucide="${failures.length ? 'x' : 'shield-check'}"></i>
      </div>
      <p>Last crawl: ${escapeHtml(formatDate(state.data?.generatedAt))}. Lookback: ${escapeHtml(state.data?.windowHours || 168)} hours. Max article age: ${escapeHtml(state.data?.maxArticleAgeDays || 30)} days.</p>
      <ul class="source-list">${renderSourceList(state)}</ul>
      ${
        failures.length
          ? `<ul class="failure-list">${failures
              .map(
                (failure) => `
                  <li>
                    <strong>${escapeHtml(failure.source)}</strong>
                    <span>${escapeHtml(failure.message)}</span>
                  </li>
                `
              )
              .join('')}</ul>`
          : '<p class="success-line"><i data-lucide="check"></i><span>All configured infrastructure sources responded.</span></p>'
      }
    </section>
  `;
}

function renderDigestIntro(items) {
  return `
    <section class="digest-intro" id="signals">
      <div>
        <span class="eyebrow">On-Prem Signal</span>
        <h1>What’s moving infrastructure.</h1>
        <p>
          Filter the brief by the pressure you care about: AI capacity, data centers, public-cloud risk,
          power constraints, private cloud, servers, storage, or networking.
        </p>
      </div>
      <div class="digest-count">
        <strong>${escapeHtml(items.length)}</strong>
        <span>matching signals</span>
      </div>
    </section>
  `;
}

function renderHomeSignal(item, index) {
  if (!item) return '';
  return `<a class="mini-signal" href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">
    <div class="story-kicker"><span>${escapeHtml(item.category || 'Infrastructure')}</span><span>0${index + 1} ↗</span></div>
    <h3>${escapeHtml(item.title)}</h3>
    ${index === 0 ? `<p class="story-summary">${escapeHtml(item.summary)}</p>` : ''}
    <p class="story-source">${escapeHtml(item.source)} <span> / ${escapeHtml(formatDate(item.publishedAt))}</span></p>
  </a>`;
}

function renderHome(state, items) {
  return `<main id="main-content" class="home-main">
    ${renderHero()}
    <section class="practice-strip" aria-label="How Racklion helps">
      <a href="/signals"><span class="practice-number">01</span><div><h2>Read the landscape</h2><p>The news behind infrastructure decisions.</p></div><span aria-hidden="true">↗</span></a>
      <a href="#consultation"><span class="practice-number">02</span><div><h2>Do the math</h2><p>Cloud, colo, or your own stack.</p></div><span aria-hidden="true">↗</span></a>
      <a href="/source"><span class="practice-number">03</span><div><h2>Put it on the floor</h2><p>Source the hardware, power, and space.</p></div><span aria-hidden="true">↗</span></a>
    </section>
    ${renderGpuPreview()}
    <section class="home-preview" aria-label="Latest infrastructure signals">
      <div class="section-heading journal-heading"><div><span class="eyebrow">The infrastructure journal</span><h2>On-Prem Signal<span class="brand-period">.</span></h2></div><a class="text-link" href="/signals">All signals <span aria-hidden="true">↗</span></a></div>
      <div class="issue-line"><span>Cloud economics / AI compute / Physical infrastructure</span><span>Latest brief · ${escapeHtml(formatDate(state.data?.generatedAt))}</span></div>
      <div class="mini-signal-grid">${items.slice(0, 3).map(renderHomeSignal).join('') || '<p>The next brief is on its way.</p>'}</div>
    </section>
    <section class="home-brief">
      <div><span class="eyebrow">A question worth asking</span><h2>Does this workload<br>still belong in the cloud?</h2></div>
      <div><p>The answer depends on utilization, cost, control, and the team running it. We work through those tradeoffs with you, then help source what comes next.</p><a class="text-link" href="#consultation">Bring us your workload <span aria-hidden="true">↗</span></a></div>
    </section>
    <section class="newsletter-band"><div><span class="eyebrow">Stay close to the ground</span><h2>The infrastructure brief.<br>In your inbox.</h2></div><div><p>A daily read on cloud costs, compute, and capacity.</p><a class="primary-action" href="/subscribe">Get On-Prem Signal <span aria-hidden="true">↗</span></a></div></section>
  </main>`;
}

function renderSignalsPage(state, items) {
  return `
    <main id="main-content" class="page-main page-view">
      ${renderDigestIntro(items)}
      ${renderToolbar(state, items)}
      <div class="content-grid">
        <section class="feed" aria-label="Infrastructure signals">
          ${items.length ? items.map(renderArticle).join('') : '<div class="empty-state">No on-prem signals match the current filters.</div>'}
        </section>
        <aside class="right-rail">
          ${renderIssuePreview(state)}
          ${renderSourceHealth(state)}
        </aside>
      </div>
    </main>
  `;
}

function renderAboutPage() {
  return `
    <main id="main-content" class="page-main page-view">
      <section class="about-hero">
        <span class="eyebrow">About Racklion</span>
        <h1>The workload comes first.</h1>
        <p>
          Racklion tracks the pressure building beneath modern workloads: data center capacity,
          AI compute demand, power constraints, cloud cost, resilience, and control.
        </p>
      </section>
      <section class="about-grid" aria-label="About Racklion">
        <article>
          <h2>What We Believe</h2>
          <p>Public cloud is useful. It is not inevitable. The right answer depends on workload economics, operating maturity, risk tolerance, and the physical constraints behind the stack.</p>
        </article>
        <article>
          <h2>What We Watch</h2>
          <p>Racklion watches infrastructure signals that change build-versus-rent decisions: GPUs, storage, networking, colocation, power, cooling, latency, outages, sovereignty, and vendor concentration.</p>
        </article>
        <article>
          <h2>How We Help</h2>
          <p>We help teams reason through cloud exit math, on-prem readiness, hybrid architecture, resilience posture, and practical migration paths before they commit budget or complexity.</p>
        </article>
      </section>
      <section class="about-cta">
        <div>
          <span class="eyebrow">Next Step</span>
          <h2>Bring the workload. We will help pressure-test the decision.</h2>
        </div>
        <a class="primary-action" href="#consultation">
          <i data-lucide="clipboard-check"></i>
          <span>Discuss infrastructure strategy</span>
        </a>
      </section>
    </main>
  `;
}

function renderConsultingPage(state) {
  return `
    <main id="main-content" class="page-main page-view">
      <section class="consulting-lead-hero">
        <div>
          <span class="eyebrow">Racklion Consulting</span>
          <h1>Before you move a workload, do the math.</h1>
          <p>Start with the workload. We will help pressure-test the economics, risk, and path forward.</p>
        </div>
      </section>
      <div class="lead-layout">
        ${renderConsultationForm(state)}
        <section class="consulting-aside">
          <span class="eyebrow">Good Fit</span>
          <h2>Start with the decision in front of you.</h2>
          <ul>
            <li>Cloud spend is growing faster than workload value.</li>
            <li>AI, storage, or data gravity is stressing public-cloud assumptions.</li>
            <li>Latency, outage exposure, sovereignty, or vendor concentration matters.</li>
            <li>You need a practical path before committing to racks, colo, or private cloud.</li>
          </ul>
        </section>
      </div>
      ${renderConsultingSection()}
    </main>
  `;
}

function renderSubscribePage(state) {
  return `
    <main id="main-content" class="page-main page-view">
      <section class="page-heading">
        <span class="eyebrow">Subscribe</span>
        <h1>A closer read on infrastructure.</h1>
        <p>One concise infrastructure brief for cloud buyers, operators, and technical leaders.</p>
      </section>
      <div class="subscribe-layout">
        ${renderSubscribeForm(state, state.demoSubscriber)}
        ${renderIssuePreview(state)}
      </div>
    </main>
  `;
}

function renderSourcePage(state) {
  const offerings = [
    ['cpu', 'GPU capacity', 'Source allocation for B300, B200, H200, H100, and other accelerators through OEMs, integrators, and colocation partners — with terms and lead times, not a waitlist.'],
    ['hard-drive', 'Colocation & space', 'Secure rack space and cages in vetted facilities so you own the servers and GPUs without building or leasing a data center.'],
    ['zap', 'Power & cooling', 'Match dense AI racks (40–130 kW) to facilities with the power envelope and liquid-cooling readiness they actually require.'],
    ['server', 'Servers & storage', 'Spec and source the compute, storage, and networking around the accelerators so the stack ships as one coherent build.']
  ];
  return `
    <main id="main-content" class="page-main page-view">
      <div class="source-contact-layout"><section class="page-heading">
        <span class="eyebrow">Source Capacity</span>
        <h1>The right hardware.
The right place to run it.</h1>
        <p>When owning infrastructure makes sense, we help you source it: GPU capacity, servers, colocation, power, and cooling, planned around your workload and timeline.</p>
        <div class="home-actions">
          <a class="primary-action" href="#consultation">
            <i data-lucide="clipboard-check"></i>
            <span>Start a sourcing conversation</span>
          </a>
          <a class="secondary-inline" href="/">
            <i data-lucide="newspaper"></i>
            <span>Compare GPU pricing</span>
          </a>
        </div>
      </section>
      ${renderConsultationForm(state)}</div>
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
        <a class="primary-action" href="#consultation">
          <i data-lucide="send"></i>
          <span>Tell us what you need to source</span>
        </a>
      </section>
    </main>
  `;
}

function renderFaqPage() {
  return `
    <main id="main-content" class="page-main page-view">
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
        <a class="primary-action" href="#consultation">
          <i data-lucide="clipboard-check"></i>
          <span>Tell us what you need</span>
        </a>
      </section>
    </main>
  `;
}

export function renderPage(view, state) {
  const items = filteredItems(state);
  const views = {
    home: renderGpuPricingPage(state),
    'gpu-pricing': renderGpuPricingPage(state),
    signals: renderSignalsPage(state, items),
    source: renderSourcePage(state),
    consulting: renderConsultingPage(state),
    about: renderAboutPage(),
    faq: renderFaqPage(),
    subscribe: renderSubscribePage(state)
  };
  const page = views[view] || views.home;
  const withContact = ['source', 'consulting'].includes(view) ? page
    : page.replace('</main>', `<div class="page-contact">${renderConsultationForm(state)}</div></main>`);
  return `${renderSiteHeader(view)}${withContact}${renderFooter()}`;
}

export { escapeHtml, getTopics, topicLabel };
