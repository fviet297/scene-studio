// Generate one AI image per scene of the active project's scene-plan.md (see references/scene-plan.md).
// Model is routed by reference count in scripts/lib/replicate-image.mjs:
// - one char reference   → FLUX Kontext dev (cheap, keeps the character's identity)
// - two+ char references → Seedream 4.5 (keeps a distinct face per person)
// - no char reference    → FLUX dev text-to-image (no identity to preserve)
// Writes the canonical file public/images/scene-NN.jpg. Search scenes are handled by
// source-assets.mjs, not here. The Replicate call + manifest record live in
// scripts/lib/replicate-image.mjs (shared with the review UI server).
//
// Every output is labelled AI_RECONSTRUCTION and shown with an on-screen "AI phục dựng" tag.
// Requires REPLICATE_API_TOKEN (loaded from ./.env). Models overridable via
// REPLICATE_SINGLE_MODEL / REPLICATE_MULTI_MODEL / REPLICATE_TEXT_MODEL.
//
// All scenes:  node scripts/generate-visuals.mjs
// Some scenes: node scripts/generate-visuals.mjs 2 6 7

import { generateSceneImage, loadEnv } from './lib/replicate-image.mjs';
import { parseProjectArg, resolveSlug } from './lib/project-paths.mjs';
import { parsePlan } from './lib/parse-plan.mjs';

loadEnv();

if (!process.env.REPLICATE_API_TOKEN) { process.stderr.write('REPLICATE_API_TOKEN not set (put it in .env).\n'); process.exit(1); }

const argv = process.argv.slice(2);
const { characters, scenes } = parsePlan(resolveSlug(argv));
const { rest } = parseProjectArg(argv);
const only = rest.map(Number).filter(Number.isFinite);

let count = 0;
for (const s of scenes) {
  if (only.length && !only.includes(s.scene)) continue;
  if (s.image.kind !== 'ai') continue;

  const { file, via } = await generateSceneImage(s, characters);
  count += 1;
  process.stdout.write(`✓ ${file} ← ${via}${s.image.characters.length ? ` (${s.image.characters.join(', ')})` : ''}\n`);
}

process.stdout.write(`Generated ${count} AI scene image(s). All labelled AI_RECONSTRUCTION.\n`);
