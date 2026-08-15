// Multi-provider historical image sourcing with fallback chain + de-duplication.
//
// Each asset declares a `query` and an ordered `providers` list. The script tries
// each provider until one returns a usable public-domain/openly-licensed image that
// has NOT already been used by another scene. Real source + license go in the manifest.
//
// Keyless providers: wikimedia, met, artic, loc. Optional: europeana (needs EUROPEANA_KEY).
//
// Adapt only the `assets` array below. Run: node scripts/source-assets.mjs

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// Wikimedia returns 403 for generic User-Agents AND for any UA containing "example.com".
// Use your real domain/email. Keep the "Name/version (contact)" shape.
const UA = 'HistoryVideoBot/1.0 (contact: replace-with-your-domain-or-email)';
const IMAGE_DIR = 'public/images';
const MANIFEST = `${IMAGE_DIR}/asset-manifest.json`;
const DEFAULT_ORDER = ['wikimedia', 'met', 'artic', 'loc'];
// Disqualify obviously wrong hits (PDF magazine pages render as thumbnails). Add per-project
// terms as needed, e.g. a wrong-person name that keeps matching.
const REJECT = /\.pdf/i;

// ─── Adapt this ──────────────────────────────────────────────────────────────
// authenticity: AUTHENTIC_PHOTO | HISTORICAL_ARTWORK | STATUE | MODERN_RECONSTRUCTION
// Prefer artifact/map queries over bare person names for concept beats.
const assets = [
  {
    file: 'scene-01-left-tran-hung-dao.jpg',
    scene: 1,
    subject: 'Trần Hưng Đạo',
    authenticity: 'STATUE',
    query: 'Tran Hung Dao statue Vietnam',
    providers: ['wikimedia', 'met', 'artic'],
  },
  {
    file: 'scene-09-right-ban-liang-coin.jpg',
    scene: 9,
    subject: 'Tiền Bán Lượng nhà Tần',
    authenticity: 'AUTHENTIC_PHOTO',
    query: 'Ban Liang coin Qin dynasty',
    providers: ['met', 'artic', 'wikimedia'],
  },
];
// ─────────────────────────────────────────────────────────────────────────────

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchJson = async (url) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return JSON.parse(text);
    } catch {
      // retry
    }
    await wait(attempt * 1500);
  }
  return null;
};

// Each adapter returns candidate list: { imageUrl, sourceUrl, license, credit }.
const adapters = {
  async wikimedia({ query }) {
    const params = new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: query,
      gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo',
      iiprop: 'url|extmetadata', iiurlwidth: '1400', format: 'json', origin: '*',
    });
    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    const pages = Object.values(data?.query?.pages ?? {});
    return pages.map((page) => {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      return info && {
        imageUrl: info.thumburl ?? info.url,
        sourceUrl: info.descriptionurl,
        license: meta.LicenseShortName?.value ?? 'See source page',
        credit: (meta.Artist?.value ?? meta.Credit?.value ?? '').replace(/<[^>]+>/g, '').trim(),
      };
    }).filter(Boolean);
  },

  async met({ query }) {
    const search = await fetchJson(
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`,
    );
    const ids = (search?.objectIDs ?? []).slice(0, 8);
    const candidates = [];
    for (const id of ids) {
      const obj = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      if (obj?.isPublicDomain && (obj.primaryImage || obj.primaryImageSmall)) {
        candidates.push({
          imageUrl: obj.primaryImage || obj.primaryImageSmall,
          sourceUrl: obj.objectURL,
          license: 'Public domain (CC0)',
          credit: obj.artistDisplayName || obj.department || 'The Met',
        });
      }
      await wait(300);
    }
    return candidates;
  },

  async artic({ query }) {
    const data = await fetchJson(
      `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=10&fields=id,title,image_id,is_public_domain,artist_display`,
    );
    const iiif = data?.config?.iiif_url;
    if (!iiif) return [];
    return (data.data ?? [])
      .filter((art) => art.is_public_domain && art.image_id)
      .map((art) => ({
        imageUrl: `${iiif}/${art.image_id}/full/1400,/0/default.jpg`,
        sourceUrl: `https://www.artic.edu/artworks/${art.id}`,
        license: 'Public domain (CC0)',
        credit: (art.artist_display ?? 'Art Institute of Chicago').replace(/\n/g, ' '),
      }));
  },

  async loc({ query }) {
    const data = await fetchJson(`https://www.loc.gov/search/?q=${encodeURIComponent(query)}&fo=json&c=10`);
    return (data?.results ?? [])
      .map((item) => {
        const images = Array.isArray(item.image_url) ? item.image_url : [];
        return images.length && {
          imageUrl: images[images.length - 1],
          sourceUrl: item.id ?? item.url,
          license: item.rights ?? 'See Library of Congress rights',
          credit: 'Library of Congress',
        };
      })
      .filter(Boolean);
  },

  async europeana({ query }) {
    const key = process.env.EUROPEANA_KEY;
    if (!key) return [];
    const data = await fetchJson(
      `https://api.europeana.eu/record/v2/search.json?wskey=${key}&query=${encodeURIComponent(query)}&rows=10&media=true&reusability=open`,
    );
    return (data?.items ?? [])
      .map((item) => {
        const url = item.edmIsShownBy?.[0] ?? item.edmPreview?.[0];
        return url && {
          imageUrl: url,
          sourceUrl: item.guid,
          license: item.rights?.[0] ?? 'See Europeana rights',
          credit: item.dataProvider?.[0] ?? 'Europeana',
        };
      })
      .filter(Boolean);
  },
};

const download = async (url, path) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
      return;
    }
    if (res.status === 429 || res.status === 503) {
      await wait(attempt * 4000); // back off on rate limit
      continue;
    }
    throw new Error(`download ${res.status}: ${url}`);
  }
  throw new Error(`download gave up (rate limited): ${url}`);
};

mkdirSync(IMAGE_DIR, { recursive: true });
const usedUrls = new Set();
const manifest = [];
const failures = [];

for (const asset of assets) {
  const order = asset.providers ?? DEFAULT_ORDER;
  let picked = null;
  let providerName = null;
  for (const name of order) {
    const candidates = await adapters[name]?.(asset).catch(() => []);
    picked = (candidates ?? []).find(
      (c) => c.imageUrl && !usedUrls.has(c.imageUrl) && !REJECT.test(c.imageUrl) && !REJECT.test(c.sourceUrl ?? ''),
    );
    if (picked) { providerName = name; break; }
    await wait(500);
  }

  if (!picked) {
    failures.push(asset.file);
    process.stdout.write(`✗ NO SOURCE for ${asset.file} — tried ${order.join(', ')}\n`);
    continue;
  }

  const path = `${IMAGE_DIR}/${asset.file}`;
  if (!existsSync(path)) await download(picked.imageUrl, path);
  usedUrls.add(picked.imageUrl);
  manifest.push({
    id: asset.file.replace(/\.[^.]+$/, ''),
    scene: asset.scene,
    type: asset.authenticity.toLowerCase(),
    subject: asset.subject,
    source: providerName,
    sourceUrl: picked.sourceUrl,
    license: picked.license,
    credit: picked.credit,
    authenticity: asset.authenticity,
  });
  process.stdout.write(`✓ ${asset.file} ← ${providerName}\n`);
  await wait(700);
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
const sources = new Set(manifest.map((m) => m.source));
process.stdout.write(`\nSourced ${manifest.length}/${assets.length} across ${sources.size} providers: ${[...sources].join(', ')}\n`);
if (failures.length) process.stdout.write(`Unsourced (generate or re-query): ${failures.join(', ')}\n`);
