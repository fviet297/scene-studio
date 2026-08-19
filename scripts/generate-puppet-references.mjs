import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import {
  dataUri,
  download,
  loadEnv,
  predict,
} from './lib/replicate-image.mjs';

loadEnv();

const MODEL = 'bytedance/seedream-4.5';
const OUTPUT_DIR = 'public/characters/v2';
const CHARACTERS = [
  {
    id: 'ly-thai-to',
    name: 'Ly Thai To',
    source: 'public/characters/lythaito.png',
  },
  {
    id: 'ly-the-dan',
    name: 'Ly The Dan',
    source: 'public/characters/lythedan.png',
  },
];

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

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const character of CHARACTERS) {
  const output = `${OUTPUT_DIR}/${basename(character.source)}`;
  const url = await predict(process.env.REPLICATE_API_TOKEN, MODEL, {
    prompt: promptFor(character.name),
    image_input: [dataUri(character.source)],
    aspect_ratio: '3:4',
    size: '2K',
  });
  await download(url, output);
  process.stdout.write(`Generated ${output} with ${MODEL}\n`);
}
