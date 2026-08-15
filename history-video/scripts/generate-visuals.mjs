// Generate one AI image per scene from src/scene-plan.json (see references/scene-plan.md).
// - scene with a `char` reference → FLUX Kontext (keeps the pasted character's identity)
// - scene with a prompt but no char → FLUX text-to-image (no identity to preserve)
// Writes the canonical file public/images/scene-NN.jpg. Search scenes are handled by
// source-assets.mjs, not here.
//
// Every output is labelled AI_RECONSTRUCTION and shown with an on-screen "AI phục dựng" tag.
// Requires REPLICATE_API_TOKEN and REPLICATE_MODEL (loaded from ./.env).
//
// All scenes:  node scripts/generate-visuals.mjs
// Some scenes: node scripts/generate-visuals.mjs 2 6 7

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TOKEN = process.env.REPLICATE_API_TOKEN;
const MODEL = process.env.REPLICATE_MODEL;
const IMAGE_DIR = 'public/images';
const MANIFEST = `${IMAGE_DIR}/asset-manifest.json`;
const PLAN = 'src/scene-plan.json';

// Style line = the project Style Reference; keep identical across every scene.
const STYLE = '2D hand-drawn historical illustration, clean bold outlines, flat colors, subtle painterly shading, cinematic educational documentary aesthetic';
const GUARD = 'historically appropriate for the period, 9:16 vertical, clear central subject, negative space at top, no text, no watermark, no modern objects, no anachronistic equipment, no fantasy armor';
const MASTER_PROMPT = `MASTER CHARACTER CONSISTENCY PROMPT

REFERENCE IMAGE = CANONICAL CHARACTER DESIGN.

The uploaded reference image is the ONLY source of truth for the character's visual identity.

Reproduce the SAME CHARACTER from the reference image in the new scene.

CHARACTER LOCK — ABSOLUTE:

The generated character MUST preserve the reference image's:

- exact face shape
- exact facial features
- exact eyes
- exact nose
- exact mouth
- exact hairstyle
- exact hair shape
- exact hair color
- exact skin tone
- exact body shape
- exact body proportions
- exact height-to-width proportions
- exact clothing
- exact armor
- exact garment layers
- exact collar
- exact sleeves
- exact belt
- exact headwear
- exact footwear
- exact weapon
- exact accessories
- exact patterns
- exact costume colors
- exact color palette
- exact silhouette
- exact illustration style

DO NOT redesign the character.

DO NOT create a historically similar character.

DO NOT interpret the character based on the character's name.

DO NOT replace the reference costume with historically "more accurate" clothing.

DO NOT change the face.

DO NOT change the hairstyle.

DO NOT change the body proportions.

DO NOT change the costume.

DO NOT change the armor.

DO NOT change the colors.

The character reference has higher priority than:
- the scene prompt
- historical assumptions
- generic character knowledge
- stylistic interpretation

If any information in the scene prompt conflicts with the reference image,
IGNORE that information and FOLLOW THE REFERENCE IMAGE.

The character must look as if the exact same illustrated character
from the reference image has been placed into a different scene.

ONLY these elements may change:
- pose
- facial expression
- body orientation
- action
- camera angle
- environment
- lighting

CHARACTER STYLE LOCK:

Preserve the exact 2D visual language of the reference image.

Do not transform the character into another art style.

Do not make the character more realistic.

Do not make the character more detailed.

Do not make the character more cinematic than the reference.

The character and the scene must appear to belong to the SAME illustration.

SCENE:

[SCENE-SPECIFIC PROMPT]

The scene environment, props, architecture, soldiers and background
must adapt to the same 2D Flat Historical visual style as the reference character.

Do not allow the background style to overpower or visually change the character.

COMPOSITION:

9:16 vertical TikTok frame.

Keep the entire character clearly visible whenever possible.

Do not crop the head, face, hands, feet or important costume elements.

Keep the character inside the TikTok safe zone.

Use a simple background with enough negative space for captions.

NEGATIVE:

character redesign,
different face,
different hairstyle,
different costume,
different armor,
different body proportions,
different colors,
generic historical character,
photorealistic character,
3D character,
CGI,
anime,
manga,
fantasy character,
modern clothing,
modern weapons,
costume replacement,
style mismatch,
text,
logo,
watermark.`;

if (!TOKEN) { process.stderr.write('REPLICATE_API_TOKEN not set (put it in .env).\n'); process.exit(1); }
if (!MODEL) { process.stderr.write('REPLICATE_MODEL not set (put it in .env).\n'); process.exit(1); }
if (!existsSync(PLAN)) { process.stderr.write(`No ${PLAN}. Run: node scripts/parse-scene-plan.mjs\n`); process.exit(1); }

const { characters, scenes } = JSON.parse(readFileSync(PLAN, 'utf8'));
const only = process.argv.slice(2).map(Number).filter(Number.isFinite);

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const dataUri = (path) => `data:${MIME[path.split('.').pop().toLowerCase()] ?? 'image/png'};base64,${readFileSync(path).toString('base64')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const predict = async (model, input) => {
  const create = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait' },
    body: JSON.stringify({ input }),
  });
  if (!create.ok) throw new Error(`replicate ${create.status}: ${await create.text()}`);
  let p = await create.json();
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    await wait(2000);
    p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  }
  if (p.status !== 'succeeded') throw new Error(`replicate ${p.status}: ${JSON.stringify(p.error)}`);
  return Array.isArray(p.output) ? p.output[0] : p.output;
};

const download = async (url, path) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 2).toString('hex').startsWith('ffd8')) throw new Error('not a jpeg');
  writeFileSync(path, buf);
};

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
const upsert = (e) => { const i = manifest.findIndex((m) => m.id === e.id); if (i >= 0) manifest[i] = e; else manifest.push(e); };

let count = 0;
for (const s of scenes) {
  if (only.length && !only.includes(s.scene)) continue;
  if (s.image.kind !== 'ai') continue;

  const file = `scene-${String(s.scene).padStart(2, '0')}.jpg`;
  const refs = s.image.characters.map((id) => characters[id]).filter((p) => p && existsSync(p));
  let url;
  let via;

  if (refs.length) {
    const others = s.image.characters.slice(1).join(', ');
    const scenePrompt = `${s.image.prompt}${others ? ` Also include ${others}.` : ''}`;
    const prompt = MASTER_PROMPT.replace('[SCENE-SPECIFIC PROMPT]', scenePrompt);
    url = await predict(MODEL, { prompt, input_image: dataUri(refs[0]), aspect_ratio: '9:16', output_format: 'jpg' });
    via = `image-to-image ${MODEL}`;
  } else {
    const prompt = `Historical reconstruction. ${s.image.prompt}. ${STYLE}, ${GUARD}.`;
    url = await predict(MODEL, { prompt, aspect_ratio: '9:16', output_format: 'jpg', num_outputs: 1 });
    via = `text-to-image ${MODEL}`;
  }

  await download(url, `${IMAGE_DIR}/${file}`);
  upsert({
    id: file.replace(/\.[^.]+$/, ''), scene: s.scene, type: 'ai_reconstruction',
    subject: s.image.prompt.slice(0, 80), source: `AI generated (Replicate, ${via})`, sourceUrl: null,
    license: 'AI-generated — no third-party rights; labelled on screen',
    credit: `AI reconstruction (${via})`, authenticity: 'AI_RECONSTRUCTION',
    characters: s.image.characters, prompt: s.image.prompt,
  });
  count += 1;
  process.stdout.write(`✓ ${file} ← ${via}${refs.length ? ` (${s.image.characters[0]})` : ''}\n`);
}

manifest.sort((a, b) => a.scene - b.scene || a.id.localeCompare(b.id));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Generated ${count} AI scene image(s). All labelled AI_RECONSTRUCTION.\n`);
