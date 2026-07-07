// src/routes.js
// Pure route model shared by the browser app, the prerender script, and the
// sitemap generator. No browser globals — safe to import in Node.

export const SITE_URL = 'https://www.racklion.com';

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
