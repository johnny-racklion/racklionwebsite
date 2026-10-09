// scripts/verify-build.mjs
// Fails the build if prerender did not produce crawlable, SEO-complete output.
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const checks = [
  ['gpu-pricing/index.html', ['B300', 'gpu-calculator', '30%', 'pricing-sources', 'rel="canonical"']],
  ['index.html',            ['Racklion', 'B300', 'gpu-calculator', 'pricing-sources', 'application/ld+json', 'rel="canonical"']],
  ['source/index.html',     ['Source', 'GPU', 'colocation', 'application/ld+json']],
  ['consulting/index.html', ['Cloud cost planning', 'rel="canonical"', 'og:title']],
  ['faq/index.html',        ['FAQPage', 'repatriation']],
  ['about/index.html',      ['About Racklion']],
  ['signals/index.html',    ['On-Prem Signal']],
  ['subscribe/index.html',  ['Subscribe']],
  ['sitemap.xml',           ['<loc>https://www.racklion.com/source</loc>']],
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

// Catch missing share images and duplicate canonical sitemap entries before deployment.
try {
  const image = await readFile(join(distDir, 'og-default.png'));
  if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || image.readUInt32BE(16) !== 1200 || image.readUInt32BE(20) !== 630) {
    throw new Error('Expected a 1200 x 630 PNG social image');
  }
  const sitemap = await readFile(join(distDir, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  if (new Set(urls).size !== urls.length || urls.includes('https://www.racklion.com/gpu-pricing')) {
    throw new Error('Sitemap must contain unique canonical URLs');
  }
} catch (error) {
  console.error(`FAIL: SEO assets: ${error.message}`);
  failed++;
}

if (failed) { console.error(`\n${failed} verification check(s) failed.`); process.exit(1); }
console.log('Build verification passed.');
