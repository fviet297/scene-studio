// Source a real image for every `kind: "search"` scene in src/scene-plan.json across
// multiple public-domain repositories, with URL de-duplication so no image repeats.
// Downloads to the canonical file public/images/scene-NN.jpg and records provenance in
// the manifest. AI scenes are handled by generate-visuals.mjs, not here.
//
// All search scenes:  node scripts/source-assets.mjs
// Some scenes:        node scripts/source-assets.mjs 3 9

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const UA = 'HistoryVideoBot/1.0 ()';
const IMAGE_DIR = 'public/images';
const MANIFEST = `${IMAGE_DIR}/asset-manifest.json`;
const PLAN = 'src/scene-plan.json';
const ORDER = ['wikimedia', 'met', 'artic', 'loc'];
const REJECT = /\.pdf|barcode|logo/i;

if (!existsSync(PLAN)) { process.stderr.write(`No ${PLAN}. Run: node scripts/parse-scene-plan.mjs\n`); process.exit(1); }
const { scenes } = JSON.parse(readFileSync(PLAN, 'utf8'));
const only = process.argv.slice(2).map(Number).filter(Number.isFinite);
const targets = scenes.filter((s) => s.image.kind === 'search' && (!only.length || only.includes(s.scene)));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (url) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return JSON.parse(text);
    } catch { /* retry */ }
    await wait(attempt * 1500);
  }
  return null;
};

const adapters = {
  async wikimedia({ query }) {
    const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1400', format: 'json', origin: '*' });
    const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    return Object.values(data?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((page) => {
      const info = page.imageinfo?.[0]; const meta = info?.extmetadata ?? {};
      return info && { imageUrl: info.thumburl ?? info.url, sourceUrl: info.descriptionurl, license: meta.LicenseShortName?.value ?? 'See source page', credit: (meta.Artist?.value ?? meta.Credit?.value ?? '').replace(/<[^>]+>/g, '').trim() };
    }).filter(Boolean);
  },
  async met({ query }) {
    const search = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`);
    const out = [];
    for (const id of (search?.objectIDs ?? []).slice(0, 8)) {
      const obj = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      if (obj?.isPublicDomain && (obj.primaryImage || obj.primaryImageSmall)) out.push({ imageUrl: obj.primaryImage || obj.primaryImageSmall, sourceUrl: obj.objectURL, license: 'Public domain (CC0)', credit: obj.artistDisplayName || obj.department || 'The Met' });
      await wait(250);
    }
    return out;
  },
  async artic({ query }) {
    const data = await fetchJson(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=10&fields=id,title,image_id,is_public_domain,artist_display`);
    const iiif = data?.config?.iiif_url;
    return !iiif ? [] : (data.data ?? []).filter((a) => a.is_public_domain && a.image_id).map((a) => ({ imageUrl: `${iiif}/${a.image_id}/full/1400,/0/default.jpg`, sourceUrl: `https://www.artic.edu/artworks/${a.id}`, license: 'Public domain (CC0)', credit: (a.artist_display ?? 'Art Institute of Chicago').replace(/\n/g, ' ') }));
  },
  async loc({ query }) {
    const data = await fetchJson(`https://www.loc.gov/search/?q=${encodeURIComponent(query)}&fo=json&c=10`);
    return (data?.results ?? []).map((item) => { const imgs = Array.isArray(item.image_url) ? item.image_url : []; return imgs.length && { imageUrl: imgs[imgs.length - 1], sourceUrl: item.id ?? item.url, license: item.rights ?? 'See LoC rights', credit: 'Library of Congress' }; }).filter(Boolean);
  },
};

const download = async (url, path) => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) { writeFileSync(path, Buffer.from(await res.arrayBuffer())); return; }
    if (res.status === 429 || res.status === 503) { await wait(attempt * 4000); continue; }
    throw new Error(`download ${res.status}`);
  }
  throw new Error('download gave up (rate limited)');
};

mkdirSync(IMAGE_DIR, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
const usedUrls = new Set(manifest.map((m) => m.sourceUrl).filter(Boolean));
const upsert = (e) => { const i = manifest.findIndex((m) => m.id === e.id); if (i >= 0) manifest[i] = e; else manifest.push(e); };
const failures = [];

for (const s of targets) {
  let picked = null; let provider = null;
  for (const name of ORDER) {
    const candidates = await adapters[name]?.(s.image).catch(() => []);
    picked = (candidates ?? []).find((c) => c.imageUrl && !usedUrls.has(c.sourceUrl) && !REJECT.test(c.imageUrl) && !REJECT.test(c.sourceUrl ?? ''));
    if (picked) { provider = name; break; }
    await wait(400);
  }
  if (!picked) { failures.push(s.scene); process.stdout.write(`✗ scene ${s.scene}: no source for "${s.image.query}"\n`); continue; }

  const file = `scene-${String(s.scene).padStart(2, '0')}.jpg`;
  try { await download(picked.imageUrl, `${IMAGE_DIR}/${file}`); }
  catch (e) { failures.push(s.scene); process.stdout.write(`✗ scene ${s.scene}: ${e.message}\n`); continue; }
  usedUrls.add(picked.sourceUrl);
  upsert({ id: file.replace(/\.[^.]+$/, ''), scene: s.scene, type: 'searched', subject: s.image.query, source: provider, sourceUrl: picked.sourceUrl, license: picked.license, credit: picked.credit, authenticity: 'HISTORICAL_ARTWORK' });
  process.stdout.write(`✓ ${file} ← ${provider} (${s.image.query})\n`);
  await wait(600);
}

manifest.sort((a, b) => a.scene - b.scene || a.id.localeCompare(b.id));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`\nSourced ${targets.length - failures.length}/${targets.length} search scenes.${failures.length ? ` Unsourced: ${failures.join(', ')}` : ''}\n`);
