import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const sourcesPath = path.join(projectRoot, 'data', 'sources.json');
const outputPath =
  process.env.DIGEST_OUTPUT ||
  path.join(projectRoot, 'public', 'data', 'newsletter-intel.json');

const dryRun = process.argv.includes('--dry-run');
const windowHours = Number(process.env.SCRAPE_WINDOW_HOURS || 168);
const maxArticleAgeDays = Number(process.env.MAX_ARTICLE_AGE_DAYS || 30);
const maxItemsPerSource = Number(process.env.MAX_ITEMS_PER_SOURCE || 12);
const maxDigestItems = Number(process.env.MAX_DIGEST_ITEMS || 40);
const userAgent =
  process.env.SCRAPER_USER_AGENT ||
  'RacklionOnPremSignal/0.1 (+https://example.com; infrastructure newsletter bot)';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  textNodeName: '#text',
  trimValues: true,
  processEntities: true
});

const topicTaxonomy = {
  'data-centers': [
    'data center',
    'datacenter',
    'colo',
    'colocation',
    'hyperscale',
    'facility',
    'campus',
    'rack',
    'availability zone',
    'cloud region'
  ],
  'ai-infrastructure': [
    'ai infrastructure',
    'gpu',
    'accelerator',
    'inference',
    'training',
    'model serving',
    'nvidia',
    'h100',
    'h200',
    'b200',
    'gb200'
  ],
  'cloud-cost': [
    'cloud cost',
    'finops',
    'egress',
    'pricing',
    'bill',
    'spend',
    'reserved instance',
    'capacity reservation',
    'committed use'
  ],
  'cloud-risk': [
    'outage',
    'downtime',
    'incident',
    'latency',
    'lock-in',
    'lock in',
    'sovereign',
    'compliance',
    'resilience',
    'availability'
  ],
  'power-cooling': [
    'power',
    'cooling',
    'liquid cooling',
    'energy',
    'grid',
    'nuclear',
    'electricity',
    'thermal',
    'water',
    'ups'
  ],
  'private-cloud': [
    'on-prem',
    'on prem',
    'private cloud',
    'hybrid cloud',
    'bare metal',
    'self-hosted',
    'self hosted',
    'openstack',
    'vmware',
    'proxmox',
    'kubernetes'
  ],
  servers: ['server', 'servers', 'cpu', 'epyc', 'xeon', 'arm', 'rack-scale', 'motherboard'],
  storage: ['storage', 'ssd', 'nvme', 'nas', 'san', 'object storage', 'backup', 'data protection'],
  networking: ['networking', 'ethernet', 'infiniband', 'switch', 'router', 'fiber', 'edge', 'cdn'],
  chips: ['chip', 'chips', 'semiconductor', 'hbm', 'asic', 'accelerator', 'fabric', 'pcie'],
  security: ['security', 'breach', 'vulnerability', 'zero trust', 'ransomware', 'encryption']
};

const infrastructureKeywords = [
  ...new Set(Object.values(topicTaxonomy).flat()),
  'infrastructure',
  'compute',
  'cluster',
  'capacity',
  'deployment',
  'virtualization',
  'container',
  'database',
  'disaster recovery'
];

const pressureKeywords = [
  'capacity',
  'shortage',
  'demand',
  'cost',
  'pricing',
  'egress',
  'latency',
  'outage',
  'downtime',
  'compliance',
  'sovereign',
  'lock-in',
  'lock in',
  'gpu',
  'power',
  'cooling',
  'energy',
  'security',
  'private cloud',
  'hybrid cloud',
  'on-prem',
  'bare metal'
];

const exclusionKeywords = [
  'wifi',
  'wi-fi',
  'access point',
  'wireless router',
  'movie',
  'trailer',
  'game',
  'gaming',
  'celebrity',
  'social network',
  'phone',
  'wearable',
  'streaming',
  'music',
  'tv show',
  'college kids',
  'dating app',
  'meme',
  'kaggle',
  'coding competition',
  'assisted coding',
  'old drivers',
  'ancient linux',
  'device support'
];

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map(textOf).find(Boolean) || '';
  }
  if (typeof value === 'object') {
    return (
      textOf(value['#cdata']) ||
      textOf(value['#text']) ||
      textOf(value['@_href']) ||
      ''
    );
  }
  return '';
}

function stripHtml(value) {
  return textOf(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) ? String.fromCodePoint(point) : ' ';
    })
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : ' ';
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactSummary(value, maxLength = 260) {
  const summary = stripHtml(value);
  if (summary.length <= maxLength) return summary;
  return `${summary.slice(0, maxLength - 1).trim()}...`;
}

function getAtomLink(entry) {
  const links = asArray(entry.link);
  const preferred =
    links.find((link) => link?.['@_rel'] === 'alternate') ||
    links.find((link) => !link?.['@_rel']) ||
    links[0];

  return textOf(preferred?.['@_href'] || preferred);
}

function getCategories(value) {
  return asArray(value)
    .flatMap((category) => {
      if (typeof category === 'object') {
        return [
          textOf(category['@_term']),
          textOf(category['@_label']),
          textOf(category['#text'])
        ];
      }
      return [textOf(category)];
    })
    .map((category) => category.trim().toLowerCase())
    .filter(Boolean);
}

function canonicalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function hashId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 14);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(haystack, keywords) {
  return keywords.filter((keyword) => {
    const normalized = String(keyword).toLowerCase();
    if (!normalized) return false;
    if (/^[a-z0-9-]+$/.test(normalized)) {
      return new RegExp(`\\b${escapeRegExp(normalized)}\\b`, 'i').test(haystack);
    }
    return haystack.includes(normalized);
  });
}

function normalizeTopicSlug(value) {
  const slug = String(value).toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '-');
  const aliases = {
    'data-centre': 'data-centers',
    'data-centres': 'data-centers',
    'data-center': 'data-centers',
    'ai-and-machine-learning': 'ai-infrastructure',
    'servers-and-hardware': 'servers',
    'storage-and-servers': 'storage',
    'network-and-edge': 'networking'
  };
  return aliases[slug] || slug;
}

function deriveTags(article, source) {
  const haystack = `${article.title} ${article.summary} ${article.category}`.toLowerCase();
  const matched = new Set();

  for (const [topic, words] of Object.entries(topicTaxonomy)) {
    if (keywordMatches(haystack, words).length) {
      matched.add(topic);
    }
  }

  for (const tag of source.tags || []) {
    const normalized = String(tag).toLowerCase();
    if (keywordMatches(haystack, [normalized]).length) {
      matched.add(normalized);
    }
  }

  if (!matched.size && source.category) {
    matched.add(normalizeTopicSlug(source.category));
  }

  return [...matched].slice(0, 5);
}

function classifySignal(item, source) {
  const haystack = `${item.title} ${item.summary} ${item.category} ${source.name}`.toLowerCase();
  const infrastructureHits = keywordMatches(haystack, infrastructureKeywords);
  const pressureHits = keywordMatches(haystack, pressureKeywords);
  const negativeHits = keywordMatches(haystack, exclusionKeywords);
  const keep =
    negativeHits.length === 0 &&
    (source.alwaysRelevant || infrastructureHits.length > 0 || pressureHits.length >= 2);

  let angle = 'Build-versus-rent signal';
  if (pressureHits.some((hit) => ['cost', 'pricing', 'egress', 'bill', 'spend'].includes(hit))) {
    angle = 'Cloud bill pressure';
  } else if (pressureHits.some((hit) => ['outage', 'downtime', 'latency', 'resilience'].includes(hit))) {
    angle = 'Resilience pressure';
  } else if (pressureHits.some((hit) => ['power', 'cooling', 'energy', 'capacity', 'shortage'].includes(hit))) {
    angle = 'Capacity pressure';
  } else if (infrastructureHits.some((hit) => ['gpu', 'accelerator', 'inference', 'training'].includes(hit))) {
    angle = 'AI compute pressure';
  } else if (infrastructureHits.some((hit) => ['private cloud', 'hybrid cloud', 'on-prem', 'bare metal'].includes(hit))) {
    angle = 'Private infrastructure signal';
  }

  return {
    keep,
    angle,
    pressure: Math.min(100, 42 + infrastructureHits.length * 8 + pressureHits.length * 10),
    infrastructureHits,
    pressureHits,
    negativeHits
  };
}

function scoreItem(item, source, now, signal) {
  const published = Date.parse(item.publishedAt);
  const ageHours = Number.isFinite(published)
    ? Math.max(0, (now.getTime() - published) / 36e5)
    : windowHours;

  const freshness = Math.max(8, 44 - ageHours * 0.45);
  const tagScore = item.tags.length * 7;
  const pressureScore = signal.pressureHits.length * 10;
  const infraScore = signal.infrastructureHits.length * 5;
  const titleBoost = /\b(outage|capacity|pricing|egress|gpu|data center|datacenter|private cloud|on-prem|bare metal|power|cooling|security|ai)\b/i.test(
    item.title
  )
    ? 10
    : 0;

  return Math.round((freshness + tagScore + pressureScore + infraScore + titleBoost + 18) * (source.weight || 1));
}

function whyUseful(item, signal) {
  const tags = new Set(item.tags);
  if (tags.has('cloud-cost')) {
    return 'A cost or pricing signal that can change the math between public cloud and owned infrastructure.';
  }
  if (tags.has('cloud-risk')) {
    return 'A risk, outage, latency, or compliance signal that can make controlled infrastructure more attractive.';
  }
  if (tags.has('ai-infrastructure')) {
    return 'AI compute demand is stressing capacity, GPU access, and deployment economics.';
  }
  if (tags.has('power-cooling')) {
    return 'Power and cooling constraints shape where dense compute can realistically live.';
  }
  if (tags.has('private-cloud')) {
    return 'A direct private-cloud or hybrid-cloud signal for teams reconsidering what should run on-prem.';
  }
  if (tags.has('data-centers')) {
    return 'A facility, capacity, or colocation signal tied to the physical layer behind cloud and AI.';
  }
  return `${signal.angle} for teams weighing cloud convenience against control, cost, and resilience.`;
}

function normalizeRssItem(item, source, now) {
  const title = stripHtml(item.title);
  const url = canonicalizeUrl(textOf(item.link) || textOf(item.guid));
  const publishedAt = textOf(item.pubDate || item['dc:date'] || item.date) || now.toISOString();
  const summary = compactSummary(item.description || item['content:encoded'] || item.summary);
  const category = getCategories(item.category)[0] || source.category || 'General';

  return normalizeArticle({ title, url, publishedAt, summary, category }, source, now);
}

function normalizeAtomEntry(entry, source, now) {
  const title = stripHtml(entry.title);
  const url = canonicalizeUrl(getAtomLink(entry) || textOf(entry.id));
  const publishedAt = textOf(entry.published || entry.updated) || now.toISOString();
  const summary = compactSummary(entry.summary || entry.content);
  const category = getCategories(entry.category)[0] || source.category || 'General';

  return normalizeArticle({ title, url, publishedAt, summary, category }, source, now);
}

function normalizeArticle(article, source, now) {
  if (!article.title || !article.url) return null;

  const published = Date.parse(article.publishedAt);
  const publishedAt = Number.isFinite(published) ? new Date(published).toISOString() : now.toISOString();
  const enriched = {
    id: hashId(`${article.url}|${article.title}`),
    title: article.title,
    url: article.url,
    source: source.name,
    sourceHomepage: source.homepage,
    category: article.category,
    publishedAt,
    summary: article.summary || 'No summary was provided by the source feed.',
    tags: [],
    score: 0,
    whyUseful: '',
    onPremAngle: '',
    pressure: 0
  };

  enriched.tags = deriveTags(enriched, source);
  const signal = classifySignal(enriched, source);
  if (!signal.keep) return null;

  enriched.score = scoreItem(enriched, source, now, signal);
  enriched.pressure = signal.pressure;
  enriched.onPremAngle = signal.angle;
  enriched.whyUseful = whyUseful(enriched, signal);

  return enriched;
}

function extractItems(feed, source, now) {
  const rssItems = asArray(feed?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems.map((item) => normalizeRssItem(item, source, now)).filter(Boolean);
  }

  const atomEntries = asArray(feed?.feed?.entry);
  if (atomEntries.length) {
    return atomEntries.map((entry) => normalizeAtomEntry(entry, source, now)).filter(Boolean);
  }

  throw new Error('No RSS items or Atom entries were found');
}

async function fetchFeed(source, now) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(source.feedUrl, {
      headers: {
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
        'user-agent': userAgent
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const feed = parser.parse(xml);
    const cutoff = now.getTime() - windowHours * 36e5;
    const maxAgeCutoff = now.getTime() - maxArticleAgeDays * 864e5;
    const items = extractItems(feed, source, now).sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
    const freshEnough = items.filter((item) => Date.parse(item.publishedAt) >= maxAgeCutoff);
    const recent = freshEnough.filter((item) => Date.parse(item.publishedAt) >= cutoff);

    return {
      source,
      items: (recent.length ? recent : freshEnough).slice(0, maxItemsPerSource)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildTopics(items) {
  const counts = new Map();
  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 10);
}

function dedupeItems(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.url || item.title.toLowerCase();
    const existing = seen.get(key);
    if (!existing || item.score > existing.score) {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

function topicName(topic) {
  return String(topic)
    .replace('ai-infrastructure', 'AI infrastructure')
    .replace('cloud-cost', 'cloud cost')
    .replace('cloud-risk', 'cloud risk')
    .replace('data-centers', 'data centers')
    .replace('power-cooling', 'power and cooling')
    .replace('private-cloud', 'private cloud')
    .replace(/-/g, ' ');
}

function subjectLine(topics) {
  const top = topics.slice(0, 3).map((topic) => topicName(topic.name));
  if (!top.length) return 'Is cloud pushing you back on-prem?';
  return `On-prem signal: ${top.join(', ')}`;
}

async function main() {
  const now = new Date();
  const sources = JSON.parse(await readFile(sourcesPath, 'utf8'));
  const settled = await Promise.allSettled(sources.map((source) => fetchFeed(source, now)));

  const sourceFailures = [];
  const sourceRuns = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      sourceRuns.push(result.value);
    } else {
      const sourceIndex = settled.indexOf(result);
      sourceFailures.push({
        source: sources[sourceIndex]?.name || 'Unknown source',
        message: result.reason?.message || String(result.reason)
      });
    }
  }

  const items = dedupeItems(sourceRuns.flatMap((run) => run.items))
    .sort((a, b) => b.score - a.score || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, maxDigestItems);

  if (!items.length) {
    throw new Error('No digest items were collected. Check data/sources.json or network access.');
  }

  const topics = buildTopics(items);
  const digest = {
    generatedAt: now.toISOString(),
    windowHours,
    maxArticleAgeDays,
    sourcesChecked: sources.length,
    sourcesSucceeded: sourceRuns.length,
    sourceFailures,
    recommendedSubject: subjectLine(topics),
    topics,
    sources: sourceRuns.map((run) => ({
      id: run.source.id,
      name: run.source.name,
      homepage: run.source.homepage,
      category: run.source.category,
      itemCount: run.items.length
    })),
    items
  };

  if (dryRun) {
    console.log(JSON.stringify(digest, null, 2));
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(digest, null, 2)}\n`);
  console.log(
    `Wrote ${items.length} newsletter signals from ${sourceRuns.length}/${sources.length} sources to ${path.relative(projectRoot, outputPath)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
