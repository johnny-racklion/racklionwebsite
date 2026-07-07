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
