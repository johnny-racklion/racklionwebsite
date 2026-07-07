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
