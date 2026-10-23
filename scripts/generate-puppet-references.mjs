// Redraw every character reference (from the active project's scene-plan.md) into a
// puppet-ready v2 pose: front-facing, arms/legs separated, pure white background — the shape a
// 2D animation rig can be cut from. Reads the v1 reference the plan points at, writes to
// public/projects/<slug>/characters/v2/<same basename>.
//
// All characters:  node scripts/generate-puppet-references.mjs
// One character:    node scripts/generate-puppet-references.mjs ly-thai-to
// Other project:     node scripts/generate-puppet-references.mjs --project other-slug

import { existsSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dataUri, download, loadEnv, predict } from './lib/replicate-image.mjs';
import { activePaths, parseProjectArg } from './lib/project-paths.mjs';
import { parsePlan } from './lib/parse-plan.mjs';

loadEnv();

const MODEL = 'bytedance/seedream-4.5';

const argv = process.argv.slice(2);
const paths = activePaths(argv);
const { characterRows: characters } = parsePlan(paths.slug);

const { rest: only } = parseProjectArg(argv);

const promptFor = (name) => `Use the attached image as the exact MASTER CHARACTER REFERENCE for ${name}.

Create a clean production reference for a reusable 2D animation puppet. This is the same adult historical character, not a redesign.

IDENTITY LOCK: preserve the exact face, eye shape, eyebrows, nose, moustache, goatee, hairstyle, apparent age, skin tone, headwear silhouette, costume design, garment layers, belt, ornaments, accessories, colours, chibi proportions, outline style and overall visual identity from the reference.

POSE FOR RIGGING: one full-body character, perfectly front-facing, neutral relaxed standing pose, head upright, torso straight, feet fully visible and separated. Both arms hang slightly away from the torso at about 20 degrees. Elbows are only slightly bent. Hands are visible and do not overlap the body, sleeves, belt, face or accessories. Legs are separated enough to identify each leg. Keep left and right limbs visually distinct.

ANIMATION-FRIENDLY ART: crisp high-resolution flat 2D chibi illustration, clean bold dark-brown outlines, simple closed shapes, minimal flat cel shading, stable symmetrical silhouette, clear boundaries between head, torso, upper arms, forearms, hands, legs, costume layers and accessories. Preserve all culturally distinctive costume details while simplifying tiny texture that cannot animate.

BACKGROUND: pure solid white, edge-to-edge. No scenery, architecture, clouds, smoke, floor, ground line, cast shadow, frame, panel, label or decorative element.

STRICT TEXT BAN: no letters, words, numbers, calligraphy, glyphs, logos, signature or watermark anywhere, including banners, plaques, clothing and background.

OUTPUT: exactly one character, centred with generous margin around hat, hands and feet. No crop. No additional pose. No character sheet.

AVOID: different face, younger child face, missing moustache or goatee, changed costume, changed colours, new weapon, handheld prop, hands hidden in sleeves, crossed arms, arms touching torso, overlapping limbs, side view, dramatic action pose, perspective distortion, long realistic anatomy, photorealism, 3D, anime moe, painterly texture, gradient shading, glow, blur, background scene, text.`;

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error('REPLICATE_API_TOKEN not set in .env');
}

mkdirSync(paths.charV2Dir, { recursive: true });

const targets = characters.filter((c) => !only.length || only.includes(c.id));
if (!targets.length) { process.stderr.write(`No matching character(s) in ${CHAR_DATA}.\n`); process.exit(1); }

for (const character of targets) {
  const source = join('public', character.image); // characterRows paths are staticFile-relative
  if (!existsSync(source)) { process.stderr.write(`✗ ${character.id}: no reference at ${source}\n`); continue; }
  const output = join(paths.charV2Dir, basename(source));
  const url = await predict(process.env.REPLICATE_API_TOKEN, MODEL, {
    prompt: promptFor(character.name),
    image_input: [dataUri(source)],
    aspect_ratio: '3:4',
    size: '4k',
  });
  await download(url, output);
  process.stdout.write(`Generated ${output} with ${MODEL}\n`);
}
