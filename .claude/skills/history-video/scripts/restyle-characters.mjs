// Redraw each character reference (public/characters/<id>.png) in the project's STYLE_DNA,
// keeping the same person, costume, armour, weapon and colours.
//
// The reference is the source of truth for every scene image, so restyling it here is what
// actually changes the look of the whole video — scene prompts inherit the style from it and
// from STYLE_DNA in scripts/lib/replicate-image.mjs.
//
// Always reads the pristine original from public/characters/_original/ so re-running never
// compounds style drift, and writes the restyled result back over the live reference.
//
// All characters: node scripts/restyle-characters.mjs
// Some:          node scripts/restyle-characters.mjs quang-trung

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { STYLE_DNA, buildInput, dataUri, download, loadEnv, predict } from './lib/replicate-image.mjs';

loadEnv();

const PLAN = 'src/scene-plan.json';
const ORIGINAL_DIR = 'public/characters/_original';
const MODEL = process.env.REPLICATE_KONTEXT_MODEL ?? 'bytedance/seedream-4.5';

// Optional per-project colour anchors. Hex codes pin a palette far harder than colour names,
// so fill this in when the style has agreed swatches; leave empty to let STYLE_DNA decide.
const PALETTE_ANCHORS = '';

const RESTYLE_PROMPT = `Redraw the person in the attached reference image in this exact art style.

STYLE: ${STYLE_DNA}.${PALETTE_ANCHORS ? ` Palette anchors — ${PALETTE_ANCHORS}.` : ''}

KEEP THE SAME CHARACTER: same face and facial features, same skin tone, same hairstyle, same
apparent age, same costume, armour, helmet, weapon, accessories and colour palette. If the
reference has a moustache, beard or goatee, KEEP IT — do not shave the face. Reproduce the
exact shape of every helmet ornament, cheek guard, shoulder guard and belt plate; do not
invent new attachments or turn an ornament into a different object. This must read as the
exact same historical figure at the same apparent age, only drawn in the new style.

CHANGE ONLY THE ART STYLE: restate the figure in the proportions, line weight and shading the
STYLE describes, simplifying costume detail to match, while keeping every distinctive element
(helmet crest, shoulder guards, sash, weapon shape) recognisable.

COMPOSITION: single full-body character standing in a neutral confident pose, front-facing or
slight 3/4 view, centred, feet fully visible, isolated on a pure white background. No shadow
on the ground, no scenery, no other people, no props, no text.

NEGATIVE: different person, different costume, different colours, missing moustache or beard,
invented helmet attachments, wrong age, deformed hands, photorealistic, 3D render, photo,
pixel art, jagged aliased outlines, shadow on floor, background scenery, cropped head or feet,
multiple characters, text, logo, watermark.`;

if (!process.env.REPLICATE_API_TOKEN) { process.stderr.write('REPLICATE_API_TOKEN not set (put it in .env).\n'); process.exit(1); }
if (!existsSync(PLAN)) { process.stderr.write(`No ${PLAN}. Run: node scripts/parse-scene-plan.mjs\n`); process.exit(1); }

const { characters } = JSON.parse(readFileSync(PLAN, 'utf8'));
const only = process.argv.slice(2);

for (const [id, path] of Object.entries(characters)) {
  if (only.length && !only.includes(id)) continue;

  const source = `${ORIGINAL_DIR}/${basename(path)}`;
  if (!existsSync(source)) { process.stderr.write(`✗ ${id}: no original at ${source}\n`); continue; }

  const url = await predict(
    process.env.REPLICATE_API_TOKEN,
    MODEL,
    buildInput(MODEL, { prompt: RESTYLE_PROMPT, refUris: [dataUri(source)] }),
  );
  await download(url, path);
  process.stdout.write(`✓ ${path} ← ${MODEL} restyle (${id})\n`);
}
