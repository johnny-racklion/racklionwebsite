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
import { renderPage, escapeHtml, getTopics } from './render.js';
import { metaForView, canonicalForView } from './seo.js';
import { viewFromPath } from './routes.js';

const app = document.querySelector('#app');
const consultEndpoint = import.meta.env.VITE_CONSULT_ENDPOINT;
const subscribeEndpoint = import.meta.env.VITE_SUBSCRIBE_ENDPOINT;
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const savedTopicsKey = 'racklion-onprem-topics';
const savedSubscriberKey = 'racklion-onprem-demo-subscriber';
const savedLeadKey = 'racklion-consulting-demo-lead';

const state = {
  data: null,
  error: '',
  query: '',
  topic: 'all',
  sort: 'newest',
  view: viewFromPath(window.location.pathname),
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

function normalizeSelectedTopics() {
  const validTopics = new Set(getTopics(state));
  const normalized = [...state.selectedTopics].filter((topic) => validTopics.has(topic));
  if (normalized.length !== state.selectedTopics.size) {
    state.selectedTopics = new Set(normalized);
    persistTopics();
  }
}

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
    demoSubscriber: localStorage.getItem(savedSubscriberKey),
    turnstileSiteKey
  };

  app.innerHTML = renderPage(state.view, ctx);
  applyHead(state.view);
  createIcons({ icons });
  document.querySelectorAll('input[name="rendered_at"]').forEach((el) => {
    el.value = String(Date.now());
  });
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
    subscribedAt: new Date().toISOString(),
    company_url: String(formData.get('company_url') || ''),
    rendered_at: Number(formData.get('rendered_at') || 0),
    turnstile_token: String(formData.get('cf-turnstile-response') || '')
  };

  state.selectedTopics = new Set(topics);
  persistTopics();

  if (!subscribeEndpoint) {
    localStorage.setItem(savedSubscriberKey, JSON.stringify(payload));
    state.subscriberStatus =
      'Preview signup saved locally. Add VITE_SUBSCRIBE_ENDPOINT to connect a newsletter provider.';
    renderApp();
    return;
  }

  try {
    const response = await fetch(subscribeEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.subscriberStatus = 'Almost there — check your email to confirm your subscription.';
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
    company_url: String(formData.get('company_url') || ''),
    rendered_at: Number(formData.get('rendered_at') || 0),
    turnstile_token: String(formData.get('cf-turnstile-response') || '')
  };

  if (!consultEndpoint) {
    localStorage.setItem(savedLeadKey, JSON.stringify(payload));
    state.leadStatus =
      'Preview inquiry saved locally. Add VITE_CONSULT_ENDPOINT to send consultation requests to a CRM, webhook, or backend.';
    form.reset();
    renderApp();
    return;
  }

  try {
    const response = await fetch(consultEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.leadStatus = 'Consultation request sent.';
    form.reset();
  } catch (error) {
    state.leadStatus = 'Consultation request failed. Please try again.';
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

loadDigest();
