// Asset audit: enforces diversity + integrity before render. Exits non-zero on hard errors.
//
// Checks:
//   ERROR  missing file referenced by manifest
//   ERROR  orphan reference (manifest entry with no file on disk)
//   WARN   same sourceUrl reused across scenes (repeated portrait/image)
//   WARN   one provider supplies > 60% of assets (single-source dependency)
//   WARN   same subject+type appears in > 2 scenes (visual monotony)
//   INFO   files on disk not in manifest (untracked)
//
// Run: node scripts/check-assets.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const IMAGE_DIR = 'public/images';
const MANIFEST = `${IMAGE_DIR}/asset-manifest.json`;
const SINGLE_SOURCE_LIMIT = 0.6;
const SUBJECT_REPEAT_LIMIT = 2;

if (!existsSync(MANIFEST)) {
  process.stderr.write(`No manifest at ${MANIFEST}\n`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const onDisk = new Set(readdirSync(IMAGE_DIR).filter((f) => /\.(jpe?g|png|svg|webp)$/i.test(f)));
const errors = [];
const warnings = [];
const infos = [];

// Integrity: every manifest id must map to a file.
for (const entry of manifest) {
  const match = [...onDisk].find((f) => f.replace(/\.[^.]+$/, '') === entry.id);
  if (!match) errors.push(`missing file for manifest id "${entry.id}" (scene ${entry.scene})`);
}

// Diversity: reused source images.
const bySource = new Map();
for (const entry of manifest) {
  if (!entry.sourceUrl) continue;
  const list = bySource.get(entry.sourceUrl) ?? [];
  list.push(entry.scene);
  bySource.set(entry.sourceUrl, list);
}
for (const [url, scenes] of bySource) {
  if (scenes.length > 1) warnings.push(`same image reused in scenes ${scenes.join(', ')} → ${url}`);
}

// Single-source dependency.
const providerCount = new Map();
for (const entry of manifest) providerCount.set(entry.source, (providerCount.get(entry.source) ?? 0) + 1);
for (const [source, count] of providerCount) {
  const ratio = count / manifest.length;
  if (ratio > SINGLE_SOURCE_LIMIT && manifest.length > 3) {
    warnings.push(`"${source}" supplies ${count}/${manifest.length} assets (${Math.round(ratio * 100)}%) — diversify sources`);
  }
}

// Subject monotony.
const bySubject = new Map();
for (const entry of manifest) {
  const key = `${entry.subject} · ${entry.type}`;
  const list = bySubject.get(key) ?? [];
  list.push(entry.scene);
  bySubject.set(key, list);
}
for (const [key, scenes] of bySubject) {
  if (scenes.length > SUBJECT_REPEAT_LIMIT) warnings.push(`"${key}" appears in ${scenes.length} scenes (${scenes.join(', ')}) — vary the visual`);
}

// Untracked files.
const trackedFiles = new Set(manifest.map((e) => [...onDisk].find((f) => f.replace(/\.[^.]+$/, '') === e.id)).filter(Boolean));
for (const file of onDisk) if (!trackedFiles.has(file)) infos.push(`untracked file: ${file}`);

const print = (label, list) => list.forEach((line) => process.stdout.write(`${label} ${line}\n`));
print('ERROR', errors);
print('WARN ', warnings);
print('INFO ', infos);
process.stdout.write(`\n${errors.length} errors, ${warnings.length} warnings, ${manifest.length} assets, ${providerCount.size} providers.\n`);
process.exit(errors.length ? 1 : 0);
