// Redraw each character reference (public/characters/<id>.png) in the project's STYLE_DNA,
// keeping the same person, costume, armour, weapon and colours.
//
// The reference is the source of truth for every scene image, so restyling it here is what
// actually changes the look of the whole video — scene prompts inherit the style from it and
// from the effective styleDna (the review UI's prompt-templates.json override, or the default in
// scripts/lib/replicate-image.mjs when unset), so both stay in one art direction.
//
// Always reads the pristine original from public/characters/_original/ so re-running never
// compounds style drift, and writes the restyled result back over the live reference.
//
// All characters: node scripts/restyle-characters.mjs
// Some:          node scripts/restyle-characters.mjs quang-trung

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { getTemplates, buildInput, dataUri, download, loadEnv, predict } from './lib/replicate-image.mjs';
import { activePaths, resolveSlug } from './lib/project-paths.mjs';
import { parsePlan } from './lib/parse-plan.mjs';

loadEnv();

const slug = resolveSlug();
const ORIGINAL_DIR = activePaths().charOriginalDir;
const MODEL = process.env.REPLICATE_KONTEXT_MODEL ?? 'bytedance/seedream-4.5';
// Effective styleDna = the review UI's edited value (scripts/prompt-templates.json) merged over
// the default, so restyled references stay in the same art direction as freshly generated scenes.
const STYLE_DNA = getTemplates().styleDna;

const RESTYLE_PROMPT = `Redraw the person in the attached reference image as a 3D-rendered chibi game character
(high-end 3D animated film look), Vietnamese historical theme.

STYLE: ${STYLE_DNA}. Palette anchors — crimson #B32C2C, antique gold #D9A441, teal #3E7B78,
olive #5C7A3F, deep purple #6B4A7A, leather brown #7A5230.

KEEP THE SAME CHARACTER: same face and facial features, same skin tone, same hairstyle, same
apparent age, same costume, armour, helmet, weapon, accessories and colour palette. If the
reference has a moustache, beard or goatee, KEEP IT — do not shave the face into a beardless
child. Reproduce the exact shape of every helmet ornament, cheek guard, shoulder guard and
belt plate; do not invent new attachments or turn an ornament into a different object. This
must read as the exact same historical figure, only drawn in the new style — an adult warrior
in chibi form, not a small child.

CHANGE ONLY THE ART STYLE: convert realistic proportions into the 2.5-head chibi proportions
above (oversized round head, stubby limbs, soft rounded hands) and render the armour and
clothing as soft, cleanly modelled 3D forms with gentle cinematic shading — no flat 2D vector,
no cel-shading, no hard lineart — while keeping every distinctive element (helmet crest,
shoulder guards, sash, weapon shape) recognisable.

COMPOSITION: single full-body character standing in a neutral confident pose, front-facing or
slight 3/4 view, centred, feet fully visible, isolated on a pure white background. No scenery,
no other people, no props, no text. Clean 3D game character render, soft studio key light.

NEGATIVE: different person, different costume, different colours, missing moustache or beard,
invented helmet attachments, adult non-chibi proportions, long legs, tall slender figure,
deformed hands, flat 2D vector, cel-shaded, hard lineart, sketchy, photoreal live-action,
hyperreal skin, texture noise, soft blur, pixel art, jagged aliased outlines, anime moe,
background scenery, cropped head or feet, multiple characters, text, logo, watermark.`;

if (!process.env.REPLICATE_API_TOKEN) { process.stderr.write('REPLICATE_API_TOKEN not set (put it in .env).\n'); process.exit(1); }
const { characters } = parsePlan(slug);
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
  process.stdout.write(`✓ ${path} ← ${MODEL} 3D chibi restyle (${id})\n`);
}
