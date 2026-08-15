// Generate one AI image per scene from src/scene-plan.json (see references/scene-plan.md).
// - scene with a `char` reference → FLUX Kontext (keeps the pasted character's identity)
// - scene with a prompt but no char → FLUX text-to-image (no identity to preserve)
// Writes the canonical file public/images/scene-NN.jpg. Search scenes are handled by
// source-assets.mjs, not here. The Replicate call + manifest record live in
// scripts/lib/replicate-image.mjs (shared with the review UI server).
//
// Every output is labelled AI_RECONSTRUCTION and shown with an on-screen "AI phục dựng" tag.
// Requires REPLICATE_API_TOKEN (loaded from ./.env).
//   Kontext model : REPLICATE_KONTEXT_MODEL  (default black-forest-labs/flux-kontext-dev)
//   text2img model: REPLICATE_TEXT_MODEL     (default black-forest-labs/flux-dev)
//
// All scenes:  node scripts/generate-visuals.mjs
// Some scenes: node scripts/generate-visuals.mjs 2 6 7

import { existsSync, readFileSync } from 'node:fs';
import { generateSceneImage, loadEnv } from './lib/replicate-image.mjs';

loadEnv();

const PLAN = 'src/scene-plan.json';
if (!process.env.REPLICATE_API_TOKEN) { process.stderr.write('REPLICATE_API_TOKEN not set (put it in .env).\n'); process.exit(1); }
if (!existsSync(PLAN)) { process.stderr.write(`No ${PLAN}. Run: node scripts/parse-scene-plan.mjs\n`); process.exit(1); }

const { characters, scenes } = JSON.parse(readFileSync(PLAN, 'utf8'));
const only = process.argv.slice(2).map(Number).filter(Number.isFinite);

let count = 0;
for (const s of scenes) {
  if (only.length && !only.includes(s.scene)) continue;
  if (s.image.kind !== 'ai') continue;

  const { file, via } = await generateSceneImage(s, characters);
  count += 1;
  process.stdout.write(`✓ ${file} ← ${via}${s.image.characters.length ? ` (${s.image.characters[0]})` : ''}\n`);
}

process.stdout.write(`Generated ${count} AI scene image(s). All labelled AI_RECONSTRUCTION.\n`);
