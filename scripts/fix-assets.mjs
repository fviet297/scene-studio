// One-off: replace the six scene images that search returned wrong (black frame,
// wrong person, modern crowd photo, unrelated sculpture) with exact Commons files
// verified by title. Fetches by exact title (not search), patches the manifest,
// and removes the two files that were renamed. Run: node scripts/fix-assets.mjs

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const UA = 'HistoryVideoBot/1.0 ()';
const IMAGE_DIR = 'public/images';
const MANIFEST = `${IMAGE_DIR}/asset-manifest.json`;

const fixes = [
  { title: 'File:汉淮阴侯韩信.jpg', file: 'scene-01-right-han-tin.jpg', scene: 1, subject: 'Hàn Tín', authenticity: 'HISTORICAL_ARTWORK' },
  { title: 'File:安南國王阮光平圖.jpg', file: 'scene-03-left-nguyen-hue-portrait.jpg', scene: 3, subject: 'An Nam Quốc vương Nguyễn Quang Bình', authenticity: 'HISTORICAL_ARTWORK' },
  { title: 'File:Den tho quang trung.jpg', file: 'scene-07-left-den-quang-trung.jpg', scene: 7, subject: 'Đền thờ Quang Trung', authenticity: 'AUTHENTIC_PHOTO', removes: 'scene-07-left-phuong-hoang-trung-do' },
  { title: 'File:明人画韩信像轴.png', file: 'scene-07-right-han-xin-ming.png', scene: 7, subject: 'Hàn Tín – danh tướng', authenticity: 'HISTORICAL_ARTWORK', removes: 'scene-07-right-gaixia-battle' },
  { title: 'File:Tượng đài Quang Trung.jpg', file: 'scene-11-left-nguyen-hue-monument.jpg', scene: 11, subject: 'Tượng đài Quang Trung', authenticity: 'STATUE' },
  { title: 'File:韓信跨下受辱FUJI3009.JPG', file: 'scene-11-right-han-xin-statue.jpg', scene: 11, subject: 'Tượng Hàn Tín (Hoài Âm)', authenticity: 'STATUE' },
];

const fetchInfo = async (title) => {
  const params = new URLSearchParams({ action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1400', format: 'json', origin: '*' });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  const page = Object.values((await res.json()).query.pages)[0];
  const info = page.imageinfo?.[0];
  if (!info) throw new Error(`no imageinfo for ${title}`);
  return info;
};

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

for (const fix of fixes) {
  const info = await fetchInfo(fix.title);
  const meta = info.extmetadata ?? {};
  const img = await fetch(info.thumburl ?? info.url, { headers: { 'User-Agent': UA } });
  writeFileSync(`${IMAGE_DIR}/${fix.file}`, Buffer.from(await img.arrayBuffer()));

  if (fix.removes) {
    for (const ext of ['jpg', 'png', 'JPG', 'jpeg']) rmSync(`${IMAGE_DIR}/${fix.removes}.${ext}`, { force: true });
    const gone = manifest.findIndex((m) => m.id === fix.removes);
    if (gone >= 0) manifest.splice(gone, 1);
  }

  const id = fix.file.replace(/\.[^.]+$/, '');
  const entry = {
    id, scene: fix.scene, type: fix.authenticity.toLowerCase(), subject: fix.subject,
    source: 'wikimedia', sourceUrl: info.descriptionurl,
    license: meta.LicenseShortName?.value ?? 'See source page',
    credit: (meta.Artist?.value ?? meta.Credit?.value ?? '').replace(/<[^>]+>/g, '').trim(),
    authenticity: fix.authenticity,
  };
  const at = manifest.findIndex((m) => m.id === id);
  if (at >= 0) manifest[at] = entry;
  else manifest.push(entry);
  process.stdout.write(`✓ ${fix.file} ← ${fix.title}\n`);
}

manifest.sort((a, b) => a.scene - b.scene || a.id.localeCompare(b.id));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Patched ${fixes.length} assets; manifest ${manifest.length} entries.\n`);
