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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const IMAGE_DIR = 'public/images';
export const MANIFEST = `${IMAGE_DIR}/asset-manifest.json`;

// Style DNA — THE ONE KNOB. This single line is the project's Style Reference: it is
// interpolated into every template below and into scripts/restyle-characters.mjs, so editing
// it restyles the character references and every scene at once. Keep it one dense clause list
// (medium · figure proportions · lineart · shading · face · palette) and swap the whole value
// when the video wants a different look — never describe style anywhere else.
//
// Example of a different direction:
//   `2D vector chibi game-asset art — 2.5-head proportions, oversized round head, stubby limbs,
//    mitten hands; bold uniform dark-brown lineart; flat cel-shading, one soft shadow tone …`
export const STYLE_DNA = `2D hand-drawn historical illustration — realistic adult figure proportions; clean bold outlines; flat colours with subtle painterly shading; grounded period-accurate faces; cinematic educational documentary aesthetic`;

const GUARD = 'historically appropriate for the period, 9:16 vertical, clear central subject, negative space at top, no text, no watermark, no modern objects, no anachronistic equipment, no fantasy armor';

// Appended around every editable template so a saved UI override cannot weaken this rule.
// Image models invent plausible-looking script on banners, walls and maps; Remotion adds all
// real text later, so no generated artwork should carry a glyph.
export const NO_TEXT_POLICY = `SYMBOL-ONLY ARTWORK: render a purely visual scene with zero typographic glyphs from any writing system and zero numeric glyphs. All surfaces are blank and non-symbolic. Maps communicate only through coastline, terrain, rivers, colour regions, plain circles and continuous plain lines. Banners and objects show only material, colour, folds and borders. Remotion adds all titles and labels later, outside this image.`;
const NO_TEXT_FINAL_CHECK = 'FINAL CHECK: remove every glyph-like mark before output; the image must remain understandable using pictures and geometry alone.';

// Kontext (image-to-image) character-lock template. The scene's action/setting prompt is
// substituted into [SCENE-SPECIFIC PROMPT]; everything else forces identity from the reference.
//
// Two constraints shape how every template below is written:
//   - The NEGATIVE line may name style qualities only. This model has no separate negative
//     field, so a named object gets rendered rather than suppressed; express object constraints
//     positively in the sections above ("the hull is plain painted wood", not "no tyres").
//   - Seedream caps the whole prompt at SEEDREAM_PROMPT_LIMIT. Template + NO_TEXT_POLICY eat
//     most of it, so keep each template terse — every char spent here is a char the scene's own
//     prompt cannot use. Run scripts/check-assets.mjs style budget checks after editing.
const MASTER_PROMPT = `ONE illustration in ONE consistent art style. Reference = art style for the ENTIRE image, not a sticker pasted onto a differently-drawn background.

STYLE — every figure, building, banner, weapon, hill and patch of ground, foreground to horizon: [STYLE]. Distant scenery uses the same style in cooler tones; never a photographic or differently-rendered backdrop, haze or blur.

EVERY FIGURE IS DRAWN THE SAME WAY: soldiers, crowds and bystanders get identical figure proportions, line weight, eye and face construction, shading and detail as the main character. Never sketchier, semi-realistic, loosely painted or silhouetted. A crowd is many small characters drawn that way, not a textured mass.

ONE CULTURE PER IMAGE: the SCENE names one country and century; all architecture, roof and eave shapes, costume, armour, banners and weapons belong to that culture and century alone. Never mix in a neighbouring or better-known culture, in either direction, and never a later dynasty of the same country. Follow the SCENE, never a default.

MAIN CHARACTER — locked to the reference: same face, hair, skin tone, proportions, costume, armour, colours and weapon. Only pose, expression, orientation, action, camera angle and lighting may change; never redesign the face or armour, never infer their look from a name. Everyone else and the whole environment come from the SCENE: extras wear plainer gear and never copy the main character's face, helmet or distinctive armour.

BARE SURFACES: every banner, flag, shield and wall is one uninterrupted field of a single flat colour, edge to edge — dyed cloth showing only folds and hem, plain painted wood, bare stone. A period banner is a plain coloured cloth, never a signboard.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical, medium-wide environmental shot — NOT a full-frame portrait. The main character fills one third to one half of the frame height, leaving room for the people, architecture and landscape behind. Head and face uncropped, calm negative space only at the very top for captions.

NEGATIVE (style qualities only — never name a drawable object here; the model renders whatever is named):
mixed art styles, extras in a different style or proportion from the main character, painted or matte-painting background, semi-realistic people, silhouettes, inconsistent line weight, haze, blur, mixed cultures in one image, anachronistic, different main-character face or costume, main character filling the frame, empty background, extras in the main character's armour, deformed hands, photorealistic, 3D render, text, watermark.`;

// Face-lock variant for scenes tagged `identity: face`. Locks the person's face, hair, age and
// 2D style from the reference but lets the scene prompt re-dress the figure — e.g. a general
// shown poor and in commoner's clothes before his rise, where the reference armor would be wrong.
const FACE_LOCK_PROMPT = `SAME PERSON, DIFFERENT SCENE — ONE illustration in ONE consistent art style. Reference = art style for the ENTIRE image, not a sticker pasted onto a differently-drawn background.

STYLE — every figure, building, banner, hill and patch of ground, foreground to horizon: [STYLE]. Distant scenery uses the same style in cooler tones; never a photographic or differently-rendered backdrop, haze or blur.

EVERY FIGURE IS DRAWN THE SAME WAY: other people get identical figure proportions, line weight, eye and face construction, shading and detail as the main person. Never sketchier, semi-realistic, loosely painted or silhouetted. A crowd is many small characters drawn that way, not a textured mass.

ONE CULTURE PER IMAGE: the SCENE names one country and century; all architecture, roof and eave shapes, costume, armour, banners and weapons belong to that culture and century alone. Never mix in a neighbouring culture, in either direction, and never a later dynasty of the same country.

REFERENCE = the person's FACE and IDENTITY. Keep the SAME PERSON: exact face shape and features, eyes, nose and mouth, hairstyle and hair colour, skin tone, same apparent age, same figure proportions. Never change the face or hairstyle or make them older or younger.

CLOTHING AND POSE FOLLOW THE SCENE, NOT THE REFERENCE: costume, armour, props and pose are set by the scene below. If the scene describes plain or poor clothing, dress the person that way even if the reference wears armour. The face stays; the outfit changes. Every other person, building and terrain comes from the SCENE too.

BARE SURFACES: every banner, flag, shield and wall is one uninterrupted field of a single flat colour, edge to edge — dyed cloth showing only folds and hem, plain painted wood, bare stone. A period banner is a plain coloured cloth, never a signboard.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical, medium environmental shot — NOT a full-frame portrait. The person occupies one third to one half of the frame height, leaving room for the environment and any other people the scene describes. Head and face uncropped, calm negative space only at the top for captions.

NEGATIVE (style qualities only — never name a drawable object here; the model renders whatever is named):
mixed art styles, extras in a different style or proportion from the main person, painted or matte-painting background, semi-realistic people, silhouettes, inconsistent line weight, haze, blur, mixed cultures in one image, anachronistic, different face, different hairstyle, different person, wrong age, empty background, deformed hands, photorealistic, 3D render, text, watermark.`;

// Multi-reference template for scenes naming two or more characters (`char: a, b`). Every
// reference is uploaded and each figure is locked to its own one. Without this the model
// receives a single reference for a two-person scene and paints that one face onto both
// figures — the scene reads as one person drawn twice in different hats.
const MULTI_CHAR_PROMPT = `SEVERAL DIFFERENT PEOPLE IN ONE SCENE — ONE illustration in ONE consistent art style. References = art style for the ENTIRE image, not stickers pasted onto a differently-drawn background.

STYLE — every figure, building, banner, weapon, hill and patch of ground, foreground to horizon: [STYLE]. Distant scenery uses the same style in cooler tones; never a photographic or differently-rendered backdrop, haze or blur.

EVERY FIGURE IS DRAWN THE SAME WAY: soldiers, crowds and bystanders get identical proportions, line weight, face construction, shading and detail as the main characters — never sketchier, semi-realistic or silhouetted. A crowd is many small characters, not a textured mass.

ONE REFERENCE PER CHARACTER: the references are DIFFERENT PEOPLE, in the order the SCENE names them — reference 1 is the first character named, reference 2 the second, and so on. Each figure is locked to its own reference: same face, hair, skin tone, proportions, costume, armour, colours and weapon; only pose, expression, orientation, camera angle and lighting may change. Never give two of them the same face, hairstyle, headwear or armour, never draw one character twice, never mirror one figure into the other's place. Extras wear plainer gear and copy no main character's face or armour.

EACH CHARACTER KEEPS THEIR OWN CULTURE: follow each character's own country and century for architecture, roof and eave shapes, costume, armour, banners and weapons, on that character's own side of the composition. Never mix or swap them, in either direction, and never a later dynasty of the same country.

BARE SURFACES: every banner, flag, shield and wall is one uninterrupted field of a single flat colour, edge to edge — dyed cloth showing only folds and hem, plain painted wood, bare stone. A period banner is a plain coloured cloth, never a signboard.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical, medium-wide environmental shot — NOT full-frame portraits. Each main character fills one third to one half of the frame height and reads as its own person. Heads uncropped, calm negative space only at the top for captions.

NEGATIVE (style qualities only — never name a drawable object here; the model renders whatever is named):
two characters sharing one face, cloned or mirrored main characters, mixed art styles, extras in a different style or proportion, painted or matte-painting background, semi-realistic people, silhouettes, inconsistent line weight, haze, blur, mixed cultures on one side, anachronistic, different main-character face or costume, empty background, extras in a main character's armour, deformed hands, photorealistic, 3D render, text, watermark.`;

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

// Default image model: ByteDance Seedream 4.5 does both text-to-image and image-to-image
// (character reference) from one endpoint — pass image_input to keep the reference identity.
const DEFAULT_KONTEXT = 'bytedance/seedream-4.5';
const DEFAULT_TEXT = 'bytedance/seedream-4.5';

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

// Upsert one manifest entry into public/images/asset-manifest.json (kept sorted).
export const upsertManifest = (entry) => {
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
  const i = manifest.findIndex((m) => m.id === entry.id);
  if (i >= 0) manifest[i] = entry; else manifest.push(entry);
  manifest.sort((a, b) => a.scene - b.scene || a.id.localeCompare(b.id));
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
};

// Generate one AI scene image → public/images/scene-NN.jpg. Returns { file, via, manifestEntry }.
export const generateSceneImage = async (scene, characters, opts = {}) => {
  const token = opts.token ?? process.env.REPLICATE_API_TOKEN;
  const kontext = opts.kontextModel ?? process.env.REPLICATE_KONTEXT_MODEL ?? DEFAULT_KONTEXT;
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
    const face = !multi && scene.image.identity === 'face';
    const template = multi ? t.multiCharPrompt : face ? t.faceLockPrompt : t.masterPrompt;
    const prompt = buildCharPrompt(t, scene.image.prompt, template);
    url = await predict(token, kontext, buildInput(kontext, { prompt, refUris: refs.map(dataUri) }));
    via = `${kontext} ${multi ? `multi-char ×${refs.length}` : face ? 'face-lock' : 'char-lock'}`;
  } else {
    const prompt = buildTextPrompt(t, scene.image.prompt);
    url = await predict(token, text, buildInput(text, { prompt }));
    via = `${text} text2img`;
  }

  await download(url, `${IMAGE_DIR}/${file}`);
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
