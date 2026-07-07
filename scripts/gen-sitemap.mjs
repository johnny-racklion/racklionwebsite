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
