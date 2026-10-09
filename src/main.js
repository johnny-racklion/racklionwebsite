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
import { gpuRequestFromSearch, normalizeGpuRequest } from './gpu-pricing.js';
import { renderGpuResults } from './gpu-pricing-render.js';

const app = document.querySelector('#app');
const consultEndpoint = import.meta.env.VITE_CONSULT_ENDPOINT;
const subscribeEndpoint = import.meta.env.VITE_SUBSCRIBE_ENDPOINT;
const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
// Stable page-load timestamp for the anti-bot timing check. Using a fixed
// value (not per-render) means legitimate users always clear the min-time
// threshold, while instant bot POSTs still fail — and unrelated re-renders
// never reset the clock.
const pageLoadedAt = Date.now();
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
  leadStatus: '',
  gpuRequest: gpuRequestFromSearch(window.location.search),
  gpuQuote: new URLSearchParams(window.location.search).get('intent') === 'gpu-reservation'
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
    turnstileSiteKey,
    gpuRequest: state.gpuRequest,
    gpuQuote: state.gpuQuote
  };

  app.innerHTML = renderPage(state.view, ctx);
  applyHead(state.view);
  createIcons({ icons });
  document.querySelectorAll('input[name="rendered_at"]').forEach((el) => {
    el.value = String(pageLoadedAt);
  });
  renderTurnstile();
}

// Explicitly render Turnstile widgets. The forms are injected after an async
// data fetch and re-injected on client-side navigation, so Cloudflare's
// implicit auto-render (which only scans elements present when its script
// runs) is unreliable here. We render each fresh `.cf-turnstile` once; the
// `data-rendered` guard prevents double-rendering the same element. If the
// Turnstile script has not loaded yet, its `onload=onloadTurnstile` callback
// runs this again once it is ready.
function renderTurnstile() {
  if (!window.turnstile || !turnstileSiteKey) return;
  document.querySelectorAll('.cf-turnstile:not([data-rendered])').forEach((el) => {
    el.dataset.rendered = '1';
    window.turnstile.render(el, { sitekey: turnstileSiteKey });
  });
}
window.onloadTurnstile = renderTurnstile;

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
    message: `${String(formData.get('message') || '').trim()}\n\nReady-for-service (RFS) date: ${formData.get('rfs_unsure') ? 'Not sure yet' : String(formData.get('rfs_date') || 'Not specified')}`,
    source: state.gpuQuote ? 'racklion-gpu-reservation' : 'racklion-contact',
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

  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const status = form.closest('.consultation-panel').querySelector('[role="status"]');
  function showStatus(message, kind, focus = false) {
    state.leadStatus = message;
    status.textContent = message;
    status.className = `form-status is-visible contact-status ${kind}`;
    status.setAttribute('tabindex', '-1');
    if (focus) {
      status.focus({ preventScroll: true });
      status.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  button.disabled = true;
  button.textContent = 'Sending…';
  form.setAttribute('aria-busy', 'true');
  showStatus('Sending your message. Please wait…', 'is-sending');
  try {
    const response = await fetch(consultEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      const messages = {
        email_failed: 'Your message was saved, but we could not send the email notification. You do not need to submit it again. For urgent inquiries, email johnny@racklion.com.',
        verification: 'Your security check expired or could not be completed. Complete the check below, then send again.',
        rate_limited: 'Too many attempts. Please wait 10 minutes before sending again.',
        timing: 'Please wait a few seconds before sending your message.'
      };
      throw new Error(messages[result.error] || 'Your message was not sent. Check your details and try again, or email johnny@racklion.com.');
    }
    state.gpuQuote = false;
    form.reset();
    form.hidden = true;
    showStatus('Message sent. Thank you for getting in touch — we’ll reply to your email.', 'is-success', true);
  } catch (error) {
    showStatus(error.name === 'TimeoutError' || error.name === 'TypeError'
      ? 'We could not confirm delivery. Your message is still below. Check your connection or email johnny@racklion.com.'
      : error.message, 'is-error', true);
    if (window.turnstile && turnstileSiteKey) window.turnstile.reset();
    button.disabled = false;
    button.textContent = 'Send message';
  } finally {
    form.setAttribute('aria-busy', 'false');
  }
}

function syncGpuLocation() {
  state.gpuRequest = gpuRequestFromSearch(window.location.search);
  state.gpuQuote = new URLSearchParams(window.location.search).get('intent') === 'gpu-reservation';
}

function updateGpuCalculator() {
  const countInput = document.querySelector('#gpu-count');
  if (!countInput) return;
  if (!countInput.checkValidity() || !countInput.value) {
    document.querySelector('#gpu-results').dataset.requestKey = '';
    document.querySelector('#gpu-results').innerHTML = '<p>Enter a whole number from 1 to 10,000 GPUs to see your estimate.</p>';
    return;
  }
  state.gpuRequest = normalizeGpuRequest({
    gpu: document.querySelector('#gpu-model').value,
    count: countInput.value,
    months: document.querySelector('#gpu-term').value
  });
  const results = document.querySelector('#gpu-results');
  const requestKey = JSON.stringify(state.gpuRequest);
  // A blur/change after typing must not replace the link being clicked.
  if (results.dataset.requestKey === requestKey) return;
  results.innerHTML = renderGpuResults(state.gpuRequest);
  results.dataset.requestKey = requestKey;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(state.gpuRequest)) url.searchParams.set(key, value);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

app.addEventListener('input', (event) => {
  if (event.target?.matches('[data-gpu-input]')) updateGpuCalculator();
  if (event.target?.id === 'search') {
    state.query = event.target.value;
    renderApp();
    const search = document.querySelector('#search');
    search?.focus();
    search?.setSelectionRange(state.query.length, state.query.length);
  }
});

app.addEventListener('change', (event) => {
  if (event.target?.matches('[data-gpu-input]')) updateGpuCalculator();
  const target = event.target;
  if (!target?.matches('[data-pref-topic]')) return;

  if (target.checked) state.selectedTopics.add(target.dataset.prefTopic);
  else state.selectedTopics.delete(target.dataset.prefTopic);
  persistTopics();
  // Do NOT re-render here: the browser already reflects the checkbox state,
  // and a full renderApp() would destroy the form's entered email, the
  // Turnstile token, and the timing stamp — silently breaking a real submit.
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
  const url = new URL(link.href);
  if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
    window.history.pushState({}, '', url.pathname + url.search + url.hash);
    state.view = viewFromPath(url.pathname);
    syncGpuLocation();
    renderApp();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (url.hash) {
    const target = document.getElementById(url.hash.slice(1));
    if (target?.tagName === 'DETAILS') target.open = true;
    target?.scrollIntoView();
  }
});

window.addEventListener('popstate', () => {
  state.view = viewFromPath(window.location.pathname);
  syncGpuLocation();
  renderApp();
});

loadDigest();

// Keep an explicit planning option for buyers who do not have an RFS date yet.
document.addEventListener('change', (event) => {
  if (event.target.name !== 'rfs_unsure') return;
  const date = event.target.form.elements.rfs_date;
  date.required = !event.target.checked;
  date.disabled = event.target.checked;
});
