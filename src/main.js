import './styles.css';
import {
  Activity,
  Bell,
  Check,
  Clock,
  ClipboardCheck,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Gauge,
  HardDrive,
  Mail,
  Newspaper,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  Zap
} from 'lucide';
import { createIcons } from 'lucide';

const app = document.querySelector('#app');
const newsletterEndpoint = import.meta.env.VITE_NEWSLETTER_ENDPOINT;
const leadEndpoint = import.meta.env.VITE_LEAD_ENDPOINT;
const savedTopicsKey = 'racklion-onprem-topics';
const savedSubscriberKey = 'racklion-onprem-demo-subscriber';
const savedLeadKey = 'racklion-consulting-demo-lead';

const state = {
  data: null,
  error: '',
  query: '',
  topic: 'all',
  sort: 'pressure',
  view: getViewFromHash(),
  selectedTopics: new Set(readSavedTopics()),
  subscriberStatus: '',
  leadStatus: ''
};

const icons = {
  Activity,
  Bell,
  Check,
  Clock,
  ClipboardCheck,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Gauge,
  HardDrive,
  Mail,
  Newspaper,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Send,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  Zap
};

const topicLabels = {
  'ai-infrastructure': 'AI infrastructure',
  'cloud-cost': 'cloud cost',
  'cloud-risk': 'cloud risk',
  'data-centers': 'data centers',
  'power-cooling': 'power and cooling',
  'private-cloud': 'private cloud'
};

function readSavedTopics() {
  try {
    return JSON.parse(localStorage.getItem(savedTopicsKey) || '[]');
  } catch {
    return [];
  }
}

function persistTopics() {
  localStorage.setItem(savedTopicsKey, JSON.stringify([...state.selectedTopics]));
}

function getViewFromHash() {
  const hash = window.location.hash || '#/';
  const route = hash.split('?')[0].replace(/\/$/, '');
  const routes = {
    '#': 'home',
    '#/': 'home',
    '#/signals': 'signals',
    '#signals': 'signals',
    '#sources': 'signals',
    '#/about': 'about',
    '#about': 'about',
    '#/consulting': 'consulting',
    '#consulting': 'consulting',
    '#consultation': 'consulting',
    '#/subscribe': 'subscribe',
    '#subscribe': 'subscribe'
  };

  return routes[route] || 'home';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function getTopics() {
  const topics = state.data?.topics?.map((topic) => topic.name) || [];
  const itemTopics = state.data?.items?.flatMap((item) => item.tags) || [];
  return [...new Set([...topics, ...itemTopics])].sort((a, b) =>
    topicLabel(a).localeCompare(topicLabel(b))
  );
}

function normalizeSelectedTopics() {
  const validTopics = new Set(getTopics());
  const normalized = [...state.selectedTopics].filter((topic) => validTopics.has(topic));
  if (normalized.length !== state.selectedTopics.size) {
    state.selectedTopics = new Set(normalized);
    persistTopics();
  }
}

function filteredItems() {
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

function selectedIssueItems() {
  const selected = [...state.selectedTopics];
  const items = state.data?.items || [];
  const scoped = selected.length
    ? items.filter((item) => item.tags?.some((tag) => state.selectedTopics.has(tag)))
    : items;
  return scoped.slice(0, 5);
}

function topTopic() {
  return state.data?.topics?.[0]?.name ? topicLabel(state.data.topics[0].name) : 'infrastructure';
}

function pressureLabel(value) {
  if (value >= 86) return 'High';
  if (value >= 68) return 'Building';
  return 'Watch';
}

function renderSiteHeader() {
  return `
    <header class="site-header">
      <a class="brand" href="#/" aria-label="Racklion home">
        <span class="brand-mark"><i data-lucide="server"></i></span>
        <span>Racklion</span>
      </a>
      <nav aria-label="Primary navigation">
        <a class="${state.view === 'signals' ? 'is-active' : ''}" href="#/signals">Signals</a>
        <a class="${state.view === 'about' ? 'is-active' : ''}" href="#/about">About</a>
        <a class="${state.view === 'consulting' ? 'is-active' : ''}" href="#/consulting">Consulting</a>
        <a class="${state.view === 'subscribe' ? 'is-active' : ''}" href="#/subscribe">Subscribe</a>
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

function renderHero() {
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
          <a class="primary-action" href="#/consulting">
            <i data-lucide="clipboard-check"></i>
            <span>Discuss infrastructure strategy</span>
          </a>
          <a class="secondary-action" href="#/signals">
            <i data-lucide="trending-up"></i>
            <span>Read today</span>
          </a>
        </div>
        <div class="hero-stats" aria-label="Latest digest stats">
          ${renderHeroStat('flame', 'On-prem signals', items.length)}
          ${renderHeroStat('activity', 'Top pressure', topTopic())}
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

function renderConsultationForm() {
  const savedLead = localStorage.getItem(savedLeadKey);

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
        <button class="form-action" type="submit">
          <i data-lucide="send"></i>
          <span>Request consultation</span>
        </button>
      </form>
      <p class="form-status ${state.leadStatus ? 'is-visible' : ''}">
        ${escapeHtml(state.leadStatus || (savedLead ? 'Latest preview inquiry is saved in this browser.' : ''))}
      </p>
    </section>
  `;
}

function renderTopicButton(topic) {
  const isActive = state.topic === topic;
  return `
    <button class="topic-pill ${isActive ? 'is-active' : ''}" data-topic="${escapeHtml(topic)}" type="button">
      ${escapeHtml(topicLabel(topic))}
    </button>
  `;
}

function renderToolbar(items) {
  return `
    <section class="toolbar" aria-label="Signal controls">
      <div class="topic-row">
        <button class="topic-pill ${state.topic === 'all' ? 'is-active' : ''}" data-topic="all" type="button">
          all signals
        </button>
        ${getTopics().map(renderTopicButton).join('')}
      </div>
      <div class="tool-row">
        <label class="search-box">
          <i data-lucide="search"></i>
          <input id="search" value="${escapeHtml(state.query)}" placeholder="Search cost, GPUs, outages, power..." />
        </label>
        <div class="segmented" role="group" aria-label="Sort signals">
          ${[
            ['pressure', 'Pressure'],
            ['newest', 'Newest'],
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

function renderIssuePreview() {
  const items = selectedIssueItems();
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

function renderSubscribeForm() {
  const topics = getTopics();
  const demoSubscriber = localStorage.getItem(savedSubscriberKey);

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

function renderSourceList() {
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

function renderSourceHealth() {
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
      <ul class="source-list">${renderSourceList()}</ul>
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

function renderHome(items) {
  return `
    ${renderHero()}
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
          <a class="primary-action" href="#/consulting">
            <i data-lucide="clipboard-check"></i>
            <span>Discuss your workload</span>
          </a>
          <a class="secondary-inline" href="#/subscribe">
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
          <a class="text-link" href="#/signals">View all signals</a>
        </div>
        <div class="mini-signal-grid">
          ${items.slice(0, 3).map(renderHomeSignal).join('')}
        </div>
      </section>
      ${renderPressureDrivers()}
    </main>
  `;
}

function renderSignalsPage(items) {
  return `
    <main class="page-main page-view">
      ${renderDigestIntro(items)}
      ${renderToolbar(items)}
      <div class="content-grid">
        <section class="feed" aria-label="Infrastructure signals">
          ${items.length ? items.map(renderArticle).join('') : '<div class="empty-state">No on-prem signals match the current filters.</div>'}
        </section>
        <aside class="right-rail">
          ${renderIssuePreview()}
          ${renderSourceHealth()}
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
        <a class="primary-action" href="#/consulting">
          <i data-lucide="clipboard-check"></i>
          <span>Discuss infrastructure strategy</span>
        </a>
      </section>
    </main>
  `;
}

function renderConsultingPage() {
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
        ${renderConsultationForm()}
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

function renderSubscribePage() {
  return `
    <main class="page-main page-view">
      <section class="page-heading">
        <span class="eyebrow">Subscribe</span>
        <h1>Get the daily on-prem signal without the dashboard noise.</h1>
        <p>One concise infrastructure brief for cloud buyers, operators, and technical leaders.</p>
      </section>
      <div class="subscribe-layout">
        ${renderSubscribeForm()}
        ${renderIssuePreview()}
      </div>
    </main>
  `;
}

function renderApp() {
  if (state.error) {
    app.innerHTML = `
      <main class="error-state">
        <i data-lucide="x"></i>
        <h1>Signals could not load</h1>
        <p>${escapeHtml(state.error)}</p>
        <button class="form-action" data-action="reload" type="button">
          <i data-lucide="refresh-cw"></i>
          <span>Try again</span>
        </button>
      </main>
    `;
    createIcons({ icons });
    return;
  }

  if (!state.data) {
    app.innerHTML = `
      <main class="loading-state">
        <i data-lucide="server"></i>
        <p>Loading on-prem signals...</p>
      </main>
    `;
    createIcons({ icons });
    return;
  }

  const items = filteredItems();
  const views = {
    home: renderHome(items),
    signals: renderSignalsPage(items),
    about: renderAboutPage(),
    consulting: renderConsultingPage(),
    subscribe: renderSubscribePage()
  };

  app.innerHTML = `
    ${renderSiteHeader()}
    ${views[state.view] || views.home}
  `;

  createIcons({ icons });
}

async function loadDigest() {
  state.error = '';
  renderApp();

  try {
    const response = await fetch('/data/newsletter-intel.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    normalizeSelectedTopics();
  } catch (error) {
    state.error = `The generated digest file at /data/newsletter-intel.json is missing or invalid. Run npm run scrape and reload. ${error.message}`;
  }

  renderApp();
}

async function submitSubscription(form) {
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const topics = formData.getAll('topics').map(String);
  const payload = {
    email,
    topics,
    source: 'racklion-on-prem-signal',
    subscribedAt: new Date().toISOString()
  };

  state.selectedTopics = new Set(topics);
  persistTopics();

  if (!newsletterEndpoint) {
    localStorage.setItem(savedSubscriberKey, JSON.stringify(payload));
    state.subscriberStatus =
      'Preview signup saved locally. Add VITE_NEWSLETTER_ENDPOINT to connect a newsletter provider.';
    renderApp();
    return;
  }

  try {
    const response = await fetch(newsletterEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.subscriberStatus = 'Subscription saved.';
  } catch (error) {
    state.subscriberStatus = `Subscription failed: ${error.message}`;
  }

  renderApp();
}

async function submitLead(form) {
  const formData = new FormData(form);
  const payload = {
    name: String(formData.get('name') || '').trim(),
    email: String(formData.get('email') || '').trim(),
    company: String(formData.get('company') || '').trim(),
    pressure: String(formData.get('pressure') || '').trim(),
    message: String(formData.get('message') || '').trim(),
    source: 'racklion-consulting-inquiry',
    submittedAt: new Date().toISOString()
  };

  if (!leadEndpoint) {
    localStorage.setItem(savedLeadKey, JSON.stringify(payload));
    state.leadStatus =
      'Preview inquiry saved locally. Add VITE_LEAD_ENDPOINT to send consultation requests to a CRM, webhook, or backend.';
    form.reset();
    renderApp();
    return;
  }

  try {
    const response = await fetch(leadEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.leadStatus = 'Consultation request sent.';
    form.reset();
  } catch (error) {
    state.leadStatus = `Consultation request failed: ${error.message}`;
  }

  renderApp();
}

app.addEventListener('input', (event) => {
  if (event.target?.id === 'search') {
    state.query = event.target.value;
    renderApp();
    const search = document.querySelector('#search');
    search?.focus();
    search?.setSelectionRange(state.query.length, state.query.length);
  }
});

app.addEventListener('change', (event) => {
  const target = event.target;
  if (!target?.matches('[data-pref-topic]')) return;

  if (target.checked) state.selectedTopics.add(target.dataset.prefTopic);
  else state.selectedTopics.delete(target.dataset.prefTopic);
  persistTopics();
  renderApp();
});

app.addEventListener('submit', (event) => {
  if (event.target?.id === 'subscribe-form') {
    event.preventDefault();
    submitSubscription(event.target);
  }

  if (event.target?.id === 'lead-form') {
    event.preventDefault();
    submitLead(event.target);
  }
});

app.addEventListener('click', (event) => {
  const topicTarget = event.target.closest('[data-topic]');
  if (topicTarget) {
    state.topic = topicTarget.dataset.topic;
    renderApp();
    return;
  }

  const sortTarget = event.target.closest('[data-sort]');
  if (sortTarget) {
    state.sort = sortTarget.dataset.sort;
    renderApp();
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;

  if (actionTarget.dataset.action === 'reload') {
    loadDigest();
  }

  if (actionTarget.dataset.action === 'copy-subject') {
    navigator.clipboard?.writeText(state.data?.recommendedSubject || 'Is cloud pushing you back on-prem?');
    state.subscriberStatus = 'Subject line copied.';
    renderApp();
  }
});

window.addEventListener('hashchange', () => {
  state.view = getViewFromHash();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderApp();
});

loadDigest();
