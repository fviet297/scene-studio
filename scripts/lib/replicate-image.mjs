// Shared Replicate image generation for one scene. Used by both the CLI
// (scripts/generate-visuals.mjs) and the review UI server (scripts/review-server.mjs)
// so the FLUX Kontext / text-to-image logic and the manifest record live in one place.
//
//   generateSceneImage(scene, characters, { token, kontextModel, textModel })
//     scene      — one entry from src/scene-plan.json ({ scene, image: { kind, characters, prompt } })
//     characters — the plan's { id: referencePath } map
//   → { file, via, manifestEntry }, and writes public/images/scene-NN.jpg
//
// Requires REPLICATE_API_TOKEN. Only kind === 'ai' scenes are generated here;
// search scenes are handled by source-assets.mjs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activePaths } from './project-paths.mjs';

// Which project's public/projects/<slug>/images/ + asset-manifest.json this module reads and
// writes. CLI scripts (generate-visuals.mjs, restyle-characters.mjs) get the active project once
// at startup; the long-running review server calls setProjectPaths() on every project switch, so
// a frozen const here would silently write into the wrong project after a switch.
let paths = activePaths();
export const setProjectPaths = (next) => { paths = next; };
export const imageDir = () => paths.imageDir;
export const manifestPath = () => paths.manifest;

// Style DNA — the project Style Reference, transcribed from prompt-chibi-lich-su-viet.md.
// Defined once and interpolated into every template so characters and scenes share one art
// direction; editing this line restyles the whole video.
export const STYLE_DNA = `2D vector chibi game-asset art — 2.5-head chibi proportions, oversized round head, stubby body and limbs, mitten hands; bold uniform dark-brown lineart; flat cel-shading, one soft shadow tone, no gradients, glossy highlights or texture noise; small almond eyes with dark pupils, thick sharp black brows, dot nose, small mouth, determined serious expression; muted historical palette of crimson, antique gold, ochre, teal, olive, deep purple and leather brown`;

const GUARD = 'historically appropriate for the period, 9:16 vertical, clear central subject, negative space at top, completely blank surfaces, no writing, no symbols, no watermark, no modern objects, no anachronistic equipment, no fantasy armor';

// Appended after every editable template so a saved UI override cannot weaken this rule.
// Text is added later by Remotion, never baked into generated scene artwork.
export const NO_TEXT_POLICY = `SYMBOL-ONLY ARTWORK: render a purely visual scene with zero typographic glyphs from any writing system and zero numeric glyphs. All surfaces are blank and non-symbolic. Maps communicate only through coastline, terrain, rivers, colour regions, plain circles and continuous plain lines. Banners and objects show only material, colour, folds and borders. Remotion adds all titles and labels later, outside this image.`;
const NO_TEXT_FINAL_CHECK = 'FINAL CHECK: remove every glyph-like mark before output; the image must remain understandable using pictures and geometry alone.';

// Kontext (image-to-image) character-lock template. The scene's action/setting prompt is
// substituted into [SCENE-SPECIFIC PROMPT]; everything else forces identity from the reference.
const MASTER_PROMPT = `ONE flat chibi cartoon illustration. Reference = art style for the ENTIRE image (not a sticker).

STYLE: [STYLE]. Distant scenery = flat outlined cartoon shapes in cooler tones only. No painted backdrop, haze or blur.

ALL figures (soldiers, crowds, bystanders) use identical 2.5-head chibi proportions, round head, mitten hands, line weight, eyes, cel-shading and detail as the main character. Never sketchier, semi-realistic, painted or silhouetted. A crowd = many small chibi characters, never a textured mass.

ONE CULTURE ONLY: Follow the SCENE’s country + century for architecture, costumes, armour, banners and weapons. Strictly no mixing (especially Chinese ↔ Vietnamese).

MAIN CHARACTER: Locked to reference — same face, hair, skin, proportions, costume, armour, colours and weapon. Only pose, expression, orientation, action, camera angle and lighting may change. Never redesign face/armour. Extras wear plainer gear; never copy main character’s face, helmet or golden armour.

BARE SURFACES: every banner, flag, shield and wall is one uninterrupted field of a single flat colour, edge to edge — dyed cloth showing only folds and hem, plain painted wood, bare stone. Keep all surfaces completely blank and non-symbolic.

TYPOGRAPHY BAN: no visible glyphs, marks arranged as writing, or typographic decoration anywhere in the frame. Visual information must use shapes, colour, plain dots and plain lines only.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical, wide environmental story shot, never a close-up portrait. Main character is deliberately small, about 20–30% of frame height, with generous visible surroundings. Use foreground, middle ground and background layers, clear leading lines, varied scale, and visible activity around the character. Prefer asymmetrical or diagonal composition over a static centered lineup. Head/face remains readable and uncropped; reserve calm negative space only at top for captions.

NEGATIVE (style qualities only — never name a drawable object here, the model renders whatever is named): mixed styles/proportions, painted/matte backgrounds, semi-realistic people, silhouettes, gradients, glossy highlights, haze/blur, mixed cultures, anachronistic, redesigned main face/costume, main character filling the frame, empty background, extras in main’s armour, adult proportions, deformed hands, photorealistic, 3D, text, watermark.`;

// Face-lock variant for scenes tagged `identity: face`. Locks the person's face, hair, age and
// 2D style from the reference but lets the scene prompt re-dress the figure — e.g. a general
// shown poor and in commoner's clothes before his rise, where the reference armor would be wrong.
const FACE_LOCK_PROMPT = `SAME PERSON, DIFFERENT SCENE — ONE flat chibi cartoon illustration. Reference = art style for the ENTIRE image (not a sticker).

STYLE: [STYLE]. Distant scenery = flat outlined cartoon shapes in cooler tones only. No painted backdrop, haze or blur.

ALL figures use identical 2.5-head chibi proportions, round head, mitten hands, line weight, eyes, cel-shading and detail. Never sketchier, semi-realistic, painted or silhouetted. A crowd = many small chibi characters, never a textured mass.

ONE CULTURE ONLY: Follow the SCENE’s country + century strictly. No mixing cultures in either direction.

REFERENCE = FACE + IDENTITY only: keep exact face shape/features, eyes, nose, mouth, hairstyle, hair colour, skin tone, apparent age and chibi proportions. Never change face, hairstyle or age.

CLOTHING + POSE follow the SCENE (not the reference). Dress according to the scene even if the reference wears armour. Everything else (other people, buildings, terrain) also comes from the SCENE.

BARE SURFACES: every banner, flag, shield and wall is one uninterrupted field of a single flat colour, edge to edge — dyed cloth showing only folds and hem, plain painted wood, bare stone. Keep all surfaces completely blank and non-symbolic.

TYPOGRAPHY BAN: no visible glyphs, marks arranged as writing, or typographic decoration anywhere in the frame. Visual information must use shapes, colour, plain dots and plain lines only.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical, wide environmental story shot, never a close-up portrait. Person is deliberately small, about 20–30% of frame height, with generous visible surroundings. Use foreground, middle ground and background layers, clear leading lines, varied scale, and visible activity around the person. Prefer asymmetrical or diagonal composition over a static centered lineup. Head/face remains readable and uncropped; reserve calm negative space only at top for captions.

NEGATIVE (style qualities only — never name a drawable object here, the model renders whatever is named): mixed styles/proportions, painted/matte backgrounds, semi-realistic people, silhouettes, gradients, glossy highlights, haze/blur, mixed cultures, anachronistic, different face/hairstyle/person/age, empty background, adult proportions, deformed hands, photorealistic, 3D, text, watermark.`;

// Multi-reference variant for scenes listing two or more characters (`char: a, b`). Every
// reference is uploaded and each figure is locked to its own one; without this the model gets a
// single reference for a two-person scene and paints the same face onto both figures.
const MULTI_CHAR_PROMPT = `SEVERAL DIFFERENT PEOPLE IN ONE SCENE — ONE flat chibi cartoon illustration. References = art style for the ENTIRE image (not stickers).

STYLE: [STYLE]. Distant scenery = flat outlined cartoon shapes in cooler tones only. No painted backdrop, haze or blur.

ALL figures (soldiers, crowds, bystanders) share the main characters' 2.5-head chibi proportions, round head, mitten hands, line weight, eyes, cel-shading and detail. A crowd = many small chibi characters, never a textured mass.

ONE REFERENCE PER CHARACTER: the references are DIFFERENT PEOPLE, in the order the SCENE names them — reference 1 → first character named, reference 2 → second. Each figure is locked to its own reference: same face, hair, skin, proportions, costume, armour, colours and weapon; only pose, expression, orientation, camera angle and lighting may change. Never give two figures the same face, hairstyle, headwear or armour, never draw one character twice, never mirror one into the other's place. Extras wear plainer gear and copy no main face or armour.

EACH CHARACTER KEEPS THEIR OWN CULTURE: follow each character's own country + century for architecture, costume, armour, banners and weapons, on that character's own side. No mixing or swapping (especially Chinese ↔ Vietnamese).

BARE SURFACES: every banner, flag, shield and wall is one uninterrupted field of a single flat colour — dyed cloth showing only folds and hem, plain painted wood, bare stone. All surfaces stay blank and non-symbolic.

TYPOGRAPHY BAN: no visible glyphs, marks arranged as writing, or typographic decoration anywhere in the frame.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical, wide environmental story shot, never full-frame portraits. Each main character is deliberately small, about 20–30% of frame height, while remaining recognizable and clearly separated. Show generous surroundings with foreground, middle ground and background layers, varied scale, clear leading lines and active secondary figures. Prefer asymmetrical or diagonal composition over a static centered lineup. Heads uncropped; reserve calm negative space only at top for captions.

NEGATIVE (style qualities only — never name a drawable object here): two characters sharing one face, cloned or mirrored main characters, mixed styles/proportions, painted/matte backgrounds, semi-realistic people, silhouettes, gradients, glossy highlights, haze/blur, mixed cultures, anachronistic, redesigned main faces/costumes, empty background, extras in a main character's armour, adult proportions, deformed hands, photorealistic, 3D, text, watermark.`;

// Text-to-image template for scenes with no character reference (e.g. an enemy army,
// a symbolic shot). Placeholders below are filled at generate time.
const TEXT2IMG_TEMPLATE = `Historical reconstruction. [SCENE-SPECIFIC PROMPT]. [STYLE], [GUARD].`;

// The editable prompt pieces the review UI exposes. Every generated image combines the
// scene's own prompt with these. Placeholders: [STYLE] = style DNA, [GUARD] = the text2img
// guard/negative line, [SCENE-SPECIFIC PROMPT] = that scene's prompt from the plan.
const TEMPLATE_DEFAULTS = {
  styleDna: STYLE_DNA,
  guard: GUARD,
  masterPrompt: MASTER_PROMPT,
  faceLockPrompt: FACE_LOCK_PROMPT,
  multiCharPrompt: MULTI_CHAR_PROMPT,
  text2img: TEXT2IMG_TEMPLATE,
};
export const TEMPLATE_KEYS = Object.keys(TEMPLATE_DEFAULTS);
// User edits are persisted here (project-root relative) and override the defaults above.
export const TEMPLATE_OVERRIDE_FILE = 'scripts/prompt-templates.json';

// Effective templates = defaults merged with any saved override (a blank field falls back).
export const getTemplates = () => {
  let over = {};
  if (existsSync(TEMPLATE_OVERRIDE_FILE)) {
    try { over = JSON.parse(readFileSync(TEMPLATE_OVERRIDE_FILE, 'utf8')); } catch { over = {}; }
  }
  const out = { ...TEMPLATE_DEFAULTS };
  for (const k of TEMPLATE_KEYS) if (typeof over[k] === 'string' && over[k].trim()) out[k] = over[k];
  return out;
};

// Persist edited templates. Blank/missing fields keep their current effective value.
export const saveTemplates = (partial) => {
  const current = getTemplates();
  const next = {};
  for (const k of TEMPLATE_KEYS) {
    const v = partial?.[k];
    next[k] = typeof v === 'string' && v.trim() ? v : current[k];
  }
  writeFileSync(TEMPLATE_OVERRIDE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  return next;
};

const buildCharPrompt = (t, scenePrompt, template) =>
  `${NO_TEXT_POLICY}\n\n${template
    .replaceAll('[STYLE]', t.styleDna)
    .replace('[SCENE-SPECIFIC PROMPT]', scenePrompt)}\n\n${NO_TEXT_FINAL_CHECK}`;

const buildTextPrompt = (t, scenePrompt) =>
  `${NO_TEXT_POLICY}\n\n${t.text2img
    .replaceAll('[STYLE]', t.styleDna)
    .replaceAll('[GUARD]', t.guard)
    .replace('[SCENE-SPECIFIC PROMPT]', scenePrompt)}\n\n${NO_TEXT_FINAL_CHECK}`;

// Image model routed by how many character references a scene has, to keep cost down without
// losing per-person identity on two-character scenes (the core of a comparison video):
//   - single reference → FLUX Kontext dev (cheap image-to-image, one reference is enough)
//   - two+ references   → Seedream 4.5 (only this reliably locks a different face per reference)
//   - no reference      → FLUX dev (cheap text-to-image; no identity to preserve)
// Override any of them via REPLICATE_SINGLE_MODEL / REPLICATE_MULTI_MODEL / REPLICATE_TEXT_MODEL.
const DEFAULT_SINGLE = 'black-forest-labs/flux-kontext-dev';
const DEFAULT_MULTI = 'bytedance/seedream-4.5';
const DEFAULT_TEXT = 'black-forest-labs/flux-dev';

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
export const dataUri = (path) => `data:${MIME[path.split('.').pop().toLowerCase()] ?? 'image/png'};base64,${readFileSync(path).toString('base64')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Seedream rejects prompts past this length, so fail here with a useful message instead of
// letting the API return an opaque error after the reference upload.
const SEEDREAM_PROMPT_LIMIT = 4000;

// Build the Replicate `input` for a model. Seedream and FLUX take different fields, so the
// caller passes intent (prompt, reference data-URIs) and we shape it per provider.
// Seedream accepts 1–14 references (multi-reference generation); FLUX takes a single one.
export const buildInput = (model, { prompt, refUris = [] }) => {
  if (model.startsWith('bytedance/seedream')) {
    if (prompt.length > SEEDREAM_PROMPT_LIMIT) {
      throw new Error(`prompt is ${prompt.length} chars, over Seedream's ${SEEDREAM_PROMPT_LIMIT} limit — shorten the scene prompt or the template in this file`);
    }
    return { prompt, aspect_ratio: '9:16', size: '2K', ...(refUris.length ? { image_input: refUris } : {}) };
  }
  // FLUX Kontext / FLUX dev fallback (kept so REPLICATE_*_MODEL can still point at them).
  return refUris.length
    ? { prompt, input_image: refUris[0], aspect_ratio: '9:16', output_format: 'jpg' }
    : { prompt, aspect_ratio: '9:16', output_format: 'jpg', num_outputs: 1 };
};

// Read REPLICATE_* from ./.env into process.env (once), without overwriting real env.
export const loadEnv = () => {
  if (!existsSync('.env')) return;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
};

export const predict = async (token, model, input) => {
  // Retry on 429 (Replicate throttles hard when account credit is low), honouring retry_after.
  let create;
  for (let attempt = 0; attempt < 6; attempt++) {
    create = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait' },
      body: JSON.stringify({ input }),
    });
    if (create.status !== 429) break;
    const body = await create.clone().json().catch(() => ({}));
    const retryAfter = Number(body.retry_after ?? create.headers.get('retry-after') ?? 3);
    await wait((retryAfter + 1) * 1000);
  }
  if (!create.ok) throw new Error(`replicate ${create.status}: ${await create.text()}`);
  let p = await create.json();
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    await wait(2000);
    p = await (await fetch(p.urls.get, { headers: { Authorization: `Bearer ${token}` } })).json();
  }
  if (p.status !== 'succeeded') throw new Error(`replicate ${p.status}: ${JSON.stringify(p.error)}`);
  return Array.isArray(p.output) ? p.output[0] : p.output;
};

const isImage = (buf) => {
  const hex = buf.subarray(0, 4).toString('hex');
  if (hex.startsWith('ffd8ff')) return true; // JPEG
  if (hex === '89504e47') return true; // PNG
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true; // WebP
  return false;
};
export const download = async (url, path) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!isImage(buf)) throw new Error('downloaded file is not a supported image');
  writeFileSync(path, buf);
};

// Upsert one manifest entry into the active project's asset-manifest.json (kept sorted), and
// mirror it to src/asset-manifest.json — the fixed path Remotion statically imports.
export const upsertManifest = (entry) => {
  const manifest = existsSync(manifestPath()) ? JSON.parse(readFileSync(manifestPath(), 'utf8')) : [];
  const i = manifest.findIndex((m) => m.id === entry.id);
  if (i >= 0) manifest[i] = entry; else manifest.push(entry);
  manifest.sort((a, b) => a.scene - b.scene || a.id.localeCompare(b.id));
  mkdirSync(paths.imageDir, { recursive: true });
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(manifestPath(), text);
  writeFileSync('src/asset-manifest.json', text);
};

// Generate one AI scene image → public/images/scene-NN.jpg. Returns { file, via, manifestEntry }.
export const generateSceneImage = async (scene, characters, opts = {}) => {
  const token = opts.token ?? process.env.REPLICATE_API_TOKEN;
  const singleModel = opts.singleModel ?? process.env.REPLICATE_SINGLE_MODEL ?? DEFAULT_SINGLE;
  const multiModel = opts.multiModel ?? process.env.REPLICATE_MULTI_MODEL ?? DEFAULT_MULTI;
  const text = opts.textModel ?? process.env.REPLICATE_TEXT_MODEL ?? DEFAULT_TEXT;
  if (!token) throw new Error('REPLICATE_API_TOKEN not set (put it in .env).');
  if (scene.image.kind !== 'ai') throw new Error(`scene ${scene.scene} is not an AI scene`);

  const file = `scene-${String(scene.scene).padStart(2, '0')}.jpg`;
  // Kept in plan order: the multi-character template maps reference N to the Nth character named
  // in the scene, so a silently dropped reference would shift every character after it.
  const refs = scene.image.characters.map((id) => {
    const path = characters[id];
    if (!path || !existsSync(path)) throw new Error(`scene ${scene.scene}: no reference image for character "${id}"`);
    return path;
  });
  const t = getTemplates();
  let url;
  let via;

  if (refs.length) {
    // Every reference is uploaded, in plan order, so each character keeps its own face.
    // identity: 'face' unlocks costume so the prompt can re-dress the figure; default full-lock.
    // It does not apply to multi-character scenes — unlocking costume there is what lets the
    // model blend the people together.
    const multi = refs.length > 1;
    // Two+ people → Seedream (per-reference identity); one person → cheap FLUX Kontext.
    const model = multi ? multiModel : singleModel;
    const face = !multi && scene.image.identity === 'face';
    const template = multi ? t.multiCharPrompt : face ? t.faceLockPrompt : t.masterPrompt;
    const prompt = buildCharPrompt(t, scene.image.prompt, template);
    url = await predict(token, model, buildInput(model, { prompt, refUris: refs.map(dataUri) }));
    via = `${model} ${multi ? `multi-char ×${refs.length}` : face ? 'face-lock' : 'char-lock'}`;
  } else {
    const prompt = buildTextPrompt(t, scene.image.prompt);
    url = await predict(token, text, buildInput(text, { prompt }));
    via = `${text} text2img`;
  }

  mkdirSync(imageDir(), { recursive: true });
  await download(url, join(imageDir(), file));
  const manifestEntry = {
    id: file.replace(/\.[^.]+$/, ''), scene: scene.scene, type: 'ai_reconstruction',
    subject: scene.image.prompt.slice(0, 80), source: `AI generated (Replicate, ${via})`, sourceUrl: null,
    license: 'AI-generated — no third-party rights; labelled on screen',
    credit: `AI reconstruction (${via})`, authenticity: 'AI_RECONSTRUCTION',
    characters: scene.image.characters, prompt: scene.image.prompt,
  };
  upsertManifest(manifestEntry);
  return { file, via, manifestEntry };
};
