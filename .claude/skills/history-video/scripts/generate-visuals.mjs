// AI image generation for concept/action beats that have no authentic source.
//
// USE for: army marching, battle dynamics, atmosphere, abstract "legacy", filler that
//   would otherwise force a repeated portrait.
// DO NOT use for: a real figure's face presented as authentic, territorial maps, or
//   artifacts (coins, weights) — source those for real. See references/ai-generation.md.
//
// Every output is labelled AI_RECONSTRUCTION and must be credited on screen as such.
// Requires FAL_KEY. Model via FAL_MODEL (default fal-ai/flux/dev).
// Run: FAL_KEY=... node scripts/generate-visuals.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FAL_KEY = process.env.FAL_KEY;
const MODEL = process.env.FAL_MODEL ?? 'fal-ai/flux/dev';
const IMAGE_DIR = 'public/images';
const MANIFEST = `${IMAGE_DIR}/asset-manifest.json`;

// ─── Adapt this ──────────────────────────────────────────────────────────────
// Prompt template: [period] + [subject/action] + [medium] + [composition] + vertical framing.
// Keep it a reconstruction, never a claim of authenticity.
const beats = [
  {
    file: 'scene-05-right-yue-fei-army.jpg',
    scene: 5,
    subject: 'Nhạc Gia Quân hành quân',
    prompt:
      'Historical reconstruction, 12th-century Song dynasty army marching under banners, '
      + 'ink-and-color scroll painting style, dramatic overcast sky, vertical composition '
      + 'with central subject and clear negative space at top, no text, no modern elements.',
  },
];
// ─────────────────────────────────────────────────────────────────────────────

if (!FAL_KEY) {
  process.stderr.write('FAL_KEY not set. export FAL_KEY=... then re-run.\n');
  process.exit(1);
}

const generate = async (prompt) => {
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: 'portrait_16_9', num_images: 1, enable_safety_checker: true }),
  });
  if (!res.ok) throw new Error(`fal ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error('fal returned no image');
  return url;
};

const download = async (url, path) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
};

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
const upsert = (entry) => {
  const index = manifest.findIndex((m) => m.id === entry.id);
  if (index >= 0) manifest[index] = entry;
  else manifest.push(entry);
};

for (const beat of beats) {
  const imageUrl = await generate(beat.prompt);
  await download(imageUrl, `${IMAGE_DIR}/${beat.file}`);
  upsert({
    id: beat.file.replace(/\.[^.]+$/, ''),
    scene: beat.scene,
    type: 'ai_reconstruction',
    subject: beat.subject,
    source: `AI generated (${MODEL})`,
    sourceUrl: null,
    license: 'AI-generated — no third-party rights; label on screen',
    credit: `AI reconstruction (${MODEL})`,
    authenticity: 'AI_RECONSTRUCTION',
    prompt: beat.prompt,
  });
  process.stdout.write(`✓ ${beat.file} (AI_RECONSTRUCTION)\n`);
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Generated ${beats.length} AI beats. All labelled AI_RECONSTRUCTION.\n`);
