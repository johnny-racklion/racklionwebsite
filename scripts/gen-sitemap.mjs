// scripts/gen-sitemap.mjs
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '../src/routes.js';
import { canonicalForView } from '../src/seo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Omit lastmod until reliable page-level modification dates are available.
// A deployment date is not a content modification date.
const locations = [...new Set(ROUTES.map((route) => canonicalForView(route.view)))];

const urls = locations.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
await writeFile(join(root, 'dist', 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml written with ${locations.length} urls`);
