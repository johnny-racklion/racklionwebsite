// src/render.js
// Pure, isomorphic view renderers. NO browser globals (window/document/
// localStorage/location/fetch), NO CSS import, NO lucide import. Emits
// `<i data-lucide="...">` placeholder strings only; the browser swaps them
// to SVGs after mount. Browser-only state is passed in via a `state` object.
import { FAQ_ENTRIES } from './seo.js';

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
  return `
    <header class="site-header">
      <a class="brand" href="/" aria-label="Racklion home">
        <span class="brand-mark"><img src="/assets/racklion-logo-mark.png" alt="" /></span>
        <span>Racklion</span>
      </a>
      <nav aria-label="Primary navigation">
        <a class="${view === 'signals' ? 'is-active' : ''}" href="/signals">Signals</a>
        <a class="${view === 'source' ? 'is-active' : ''}" href="/source">Source</a>
        <a class="${view === 'consulting' ? 'is-active' : ''}" href="/consulting">Consulting</a>
        <a class="${view === 'about' ? 'is-active' : ''}" href="/about">About</a>
        <a class="${view === 'faq' ? 'is-active' : ''}" href="/faq">FAQ</a>
        <a class="${view === 'subscribe' ? 'is-active' : ''}" href="/subscribe">Subscribe</a>
      </nav>
    </header>
  `;
}

function renderHeroStat(icon, label, value) {
  return `
    <div class="hero-stat">
      <i data-lucide="${icon}"></i>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderHero(state) {
  const items = state.data?.items || [];
  const sources = state.data?.sourcesSucceeded ?? state.data?.sources?.length ?? 0;

  return `
    <section class="hero" aria-label="On-Prem Signal">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <span class="eyebrow">Data center, AI compute, and cloud pressure</span>
        <h1>On-Prem Signal</h1>
        <p>
          Daily infrastructure news for people watching cloud bills, GPU scarcity, outages, latency,
          power limits, and sovereignty rules and thinking: it may be time for some on-prem.
        </p>
        <div class="hero-actions">
          <a class="primary-action" href="/consulting">
            <i data-lucide="clipboard-check"></i>
            <span>Discuss infrastructure strategy</span>
          </a>
          <a class="secondary-action" href="/signals">
            <i data-lucide="trending-up"></i>
            <span>Read today</span>
          </a>
        </div>
        <div class="hero-stats" aria-label="Latest digest stats">
          ${renderHeroStat('flame', 'On-prem signals', items.length)}
          ${renderHeroStat('activity', 'Top pressure', topTopic(state))}
          ${renderHeroStat('rss', 'Sources tracked', sources)}
        </div>
      </div>
    </section>
  `;
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
          <span class="eyebrow">Request Consultation</span>
          <h2>Tell us what you are trying to decide.</h2>
        </div>
      </div>
      <p>Use this for workload fit, cost pressure, colocation strategy, private cloud planning, or AI infrastructure review.</p>
      <form id="lead-form">
        <div class="form-grid">
          <label>
            <span>Name</span>
            <input name="name" type="text" placeholder="Your name" autocomplete="name" required />
          </label>
          <label>
            <span>Work email</span>
            <input name="email" type="email" placeholder="you@company.com" autocomplete="email" required />
          </label>
        </div>
        <div class="form-grid">
          <label>
            <span>Company</span>
            <input name="company" type="text" placeholder="Company" autocomplete="organization" />
          </label>
          <label>
            <span>Primary pressure</span>
            <select name="pressure" required>
              <option value="">Select one</option>
              <option value="cloud-cost">Cloud cost or egress</option>
              <option value="ai-compute">AI compute or GPU capacity</option>
              <option value="resilience">Outage, latency, or resilience</option>
              <option value="sovereignty">Compliance or data sovereignty</option>
              <option value="private-cloud">Private cloud or colocation planning</option>
            </select>
          </label>
        </div>
        <label>
          <span>What are you trying to decide?</span>
          <textarea name="message" rows="5" placeholder="Tell us about the workload, cloud concern, timeline, or infrastructure decision." required></textarea>
        </label>
        ${renderBotFields(state)}
        <button class="form-action" type="submit">
          <i data-lucide="send"></i>
          <span>Request consultation</span>
        </button>
      </form>
      <p class="form-status ${savedLead ? 'is-visible' : ''}">
        ${escapeHtml(savedLead ? 'Latest preview inquiry is saved in this browser.' : '')}
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
          <input id="search" value="${escapeHtml(state.query)}" placeholder="Search cost, GPUs, outages, power..." />
        </label>
        <div class="segmented" role="group" aria-label="Sort signals">
          ${[
            ['newest', 'Newest'],
            ['pressure', 'Constraints'],
            ['source', "News' Source"]
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
        <i data-lucide="sparkles"></i>
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
      <p class="form-status ${state.subscriberStatus ? 'is-visible' : ''}">
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
        <span class="eyebrow">Today</span>
        <h2>Signals that make cloud feel less inevitable</h2>
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

function renderHomeSignal(item) {
  if (!item) return '';

  return `
    <article class="mini-signal">
      <span>${escapeHtml(item.onPremAngle || item.source)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.source)} · ${escapeHtml(relativeTime(item.publishedAt))}</p>
    </article>
  `;
}

function renderHome(state, items) {
  return `
    ${renderHero(state)}
    <main class="page-main">
      <section class="home-brief">
        <div>
          <span class="eyebrow">Signal To Strategy</span>
          <h2>Use the daily brief to spot when cloud convenience starts costing control.</h2>
          <p>
            Racklion pairs infrastructure news with consulting for teams deciding whether workloads should stay in public cloud,
            move to colocation, or become part of a private stack.
          </p>
        </div>
        <div class="home-actions">
          <a class="primary-action" href="/consulting">
            <i data-lucide="clipboard-check"></i>
            <span>Discuss your workload</span>
          </a>
          <a class="secondary-inline" href="/subscribe">
            <i data-lucide="mail"></i>
            <span>Subscribe to the brief</span>
          </a>
        </div>
      </section>
      <section class="home-preview" aria-label="Latest infrastructure signals">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Latest Signals</span>
            <h2>Three reasons to ask harder infrastructure questions</h2>
          </div>
          <a class="text-link" href="/signals">View all signals</a>
        </div>
        <div class="mini-signal-grid">
          ${items.slice(0, 3).map(renderHomeSignal).join('')}
        </div>
      </section>
      ${renderPressureDrivers()}
    </main>
  `;
}

function renderSignalsPage(state, items) {
  return `
    <main class="page-main page-view">
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
    <main class="page-main page-view">
      <section class="about-hero">
        <span class="eyebrow">About Racklion</span>
        <h1>Infrastructure decisions should be made with evidence, not cloud default settings.</h1>
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
        <a class="primary-action" href="/consulting">
          <i data-lucide="clipboard-check"></i>
          <span>Discuss infrastructure strategy</span>
        </a>
      </section>
    </main>
  `;
}

function renderConsultingPage(state) {
  return `
    <main class="page-main page-view">
      <section class="consulting-lead-hero">
        <div>
          <span class="eyebrow">Racklion Consulting</span>
          <h1>Need a second set of eyes on the cloud-versus-on-prem decision?</h1>
          <p>Start with the workload. We will help pressure-test the economics, risk, and path forward.</p>
        </div>
      </section>
      <div class="lead-layout">
        ${renderConsultationForm(state)}
        <section class="consulting-aside">
          <span class="eyebrow">Good Fit</span>
          <h2>Useful when the decision has real blast radius.</h2>
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
    <main class="page-main page-view">
      <section class="page-heading">
        <span class="eyebrow">Subscribe</span>
        <h1>Get the daily on-prem signal without the dashboard noise.</h1>
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

export function renderPage(view, state) {
  const items = filteredItems(state);
  const views = {
    home: renderHome(state, items),
    signals: renderSignalsPage(state, items),
    source: renderSourcePage(state),
    consulting: renderConsultingPage(state),
    about: renderAboutPage(),
    faq: renderFaqPage(),
    subscribe: renderSubscribePage(state)
  };
  return `${renderSiteHeader(view)}${views[view] || views.home}`;
}

export { escapeHtml, getTopics, topicLabel };
