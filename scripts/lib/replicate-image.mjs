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
import { FAL_IMAGE_MODELS, falImageUrl } from './fal-image.mjs';
import { VMEDIA_IMAGE_MODELS, vmediaImageUrl } from './vmedia-image.mjs';
import { parsePlanAspect, aspectInfo, applyAspectText, DEFAULT_ASPECT } from './aspect.mjs';
import { TEMPLATE_VI_DEFAULTS } from './template-vi.mjs';

// Which project's public/projects/<slug>/images/ + asset-manifest.json this module reads and
// writes. CLI scripts (generate-visuals.mjs, restyle-characters.mjs) get the active project once
// at startup; the long-running review server calls setProjectPaths() on every project switch, so
// a frozen const here would silently write into the wrong project after a switch.
let paths = activePaths();
// Active project's aspect (from its scene-plan `aspect:`), read fresh on every use: the plan's
// `aspect:` line can be edited while the review server is running, and a value cached at startup
// or at the last project switch would keep generating images in the previous ratio.
const readAspect = (planMd) => (existsSync(planMd) ? parsePlanAspect(readFileSync(planMd, 'utf8')) : DEFAULT_ASPECT);
const currentAspect = () => readAspect(paths.planMd);
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
export const NO_TEXT_POLICY = `SYMBOL-ONLY ARTWORK: no letters, numerals or glyphs of any writing system anywhere, especially no Vietnamese words or diacritics (à, ế, ộ, ữ, đ). Banners, flags, walls and objects stay blank — material, colour and folds only. Maps read through coastline, terrain, rivers and colour regions. Titles and narration text are added later by the editor.`;
const NO_TEXT_FINAL_CHECK = 'FINAL CHECK: no glyph-like mark or lettering anywhere; read the scene through pictures and shapes only.';

// Kontext (image-to-image) character-lock template. The scene's action/setting prompt is
// substituted into [SCENE-SPECIFIC PROMPT]; everything else forces identity from the reference.
const MASTER_PROMPT = `ONE flat chibi cartoon illustration. Reference = art style for the ENTIRE image (not a sticker).

STYLE: [STYLE]. Distant scenery = flat outlined cartoon shapes in cooler tones only. No painted backdrop, haze or blur.

ALL figures (soldiers, crowds, bystanders) use identical 2.5-head chibi proportions, round head, mitten hands, line weight, eyes, cel-shading and detail as the main character. Never sketchier, semi-realistic, painted or silhouetted. A crowd = many small chibi characters, never a textured mass.

ONE CULTURE ONLY: Follow the SCENE’s country + century for architecture, costumes, armour, banners and weapons. Strictly no mixing (especially Chinese ↔ Vietnamese).

MAIN CHARACTER: Locked to reference — same face, hair, skin, proportions, costume, armour, colours and weapon. Only pose, expression, orientation, action, camera angle and lighting may change. Never redesign face/armour. Extras wear plainer gear; never copy main character’s face, helmet or golden armour.

BARE SURFACES: every banner, flag, shield and wall is one uninterrupted field of a single flat colour, edge to edge — dyed cloth showing only folds and hem, plain painted wood, bare stone. Keep all surfaces completely blank and non-symbolic.

TYPOGRAPHY BAN: no visible glyphs, marks arranged as writing, or typographic decoration anywhere in the frame. Visual information must use shapes, colour, plain dots and plain lines only.

COHERENT ANATOMY & PROPS: each figure is one whole separate body with space around it — exactly two arms and two hands, a balanced natural pose, never an extra, merged, shared or twisted limb, and no two figures fused. A held object (sword, bow, book, cup) stays whole, gripped by the handle beside the body, never bent through the hand. A rider and mount face the same way. Cel shading stays flat and even — no 3D gradient, cast shadow or gloss.

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

COHERENT ANATOMY & PROPS: each figure is one whole separate body with space around it — exactly two arms and two hands, a balanced natural pose, never an extra, merged, shared or twisted limb, and no two figures fused. A held object (sword, bow, book, cup) stays whole, gripped by the handle beside the body, never bent through the hand. A rider and mount face the same way. Cel shading stays flat and even — no 3D gradient, cast shadow or gloss.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical, wide environmental story shot, never a close-up portrait. Person is deliberately small, about 20–30% of frame height, with generous visible surroundings. Use foreground, middle ground and background layers, clear leading lines, varied scale, and visible activity around the person. Prefer asymmetrical or diagonal composition over a static centered lineup. Head/face remains readable and uncropped; reserve calm negative space only at top for captions.

NEGATIVE (style qualities only — never name a drawable object here, the model renders whatever is named): mixed styles/proportions, painted/matte backgrounds, semi-realistic people, silhouettes, gradients, glossy highlights, haze/blur, mixed cultures, anachronistic, different face/hairstyle/person/age, empty background, adult proportions, deformed hands, photorealistic, 3D, text, watermark.`;

// Multi-reference variant for scenes listing two or more characters (`char: a, b`). Every
// reference is uploaded and each figure is locked to its own one; without this the model gets a
// single reference for a two-person scene and paints the same face onto both figures.
const MULTI_CHAR_PROMPT = `SEVERAL DIFFERENT PEOPLE IN ONE SCENE — ONE flat chibi cartoon illustration. References set the art style for the WHOLE image, not stickers.

STYLE: [STYLE]. Distant scenery uses cooler flat outlined shapes.

ALL PEOPLE: same chibi proportions, line weight, eyes and cel-shading. Crowds contain distinct small chibi figures.

REFERENCE ORDER: reference 1 = first named character; reference 2 = second. Preserve each person's face, hair, skin, costume, armour, colours and weapon. Change only pose, expression, orientation and camera. Each main appears once and remains visually distinct. Extras use plain gear and copy neither main.

CULTURE: each side uses its named country and century for architecture, costume, armour and weapons. Never swap Chinese and Vietnamese elements.

SURFACES: banners, flags, shields and walls remain blank, using only flat colour, material and folds.

COHERENT ANATOMY & PROPS: each figure is one whole separate body with space around it — exactly two arms and two hands, a balanced natural pose, never an extra, merged, shared or twisted limb, and no two figures fused into one. A held object (sword, bow, book, cup) stays whole, gripped by the handle beside the body, never bent through the hand. A rider and mount face the same way. Cel shading stays flat and even — no 3D gradient, cast shadow or gloss.

SCENE:
[SCENE-SPECIFIC PROMPT]

COMPOSITION: 9:16 vertical environmental shot. Follow SCENE placement. Each main occupies 20–30% of frame height, clearly separated and uncropped. Show foreground, middle ground and background, varied scale, active secondary figures and calm top space.

NEGATIVE: cloned or mirrored mains, shared faces, mixed cultures or styles, adult proportions, painted background, gradients, gloss, haze, blur, photorealism, 3D, text, watermark.`;

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
const TEMPLATE_META_KEYS = new Set(['activeVersion', 'versions']);

// Effective templates = defaults merged with any saved override (a blank field falls back).
export const getTemplates = () => {
  let over = {};
  if (existsSync(TEMPLATE_OVERRIDE_FILE)) {
    try { over = JSON.parse(readFileSync(TEMPLATE_OVERRIDE_FILE, 'utf8')); } catch { over = {}; }
  }
  const selected = typeof over.activeVersion === 'string' ? over.activeVersion : 'default';
  const source = over.versions?.[selected] ?? over;
  const out = { ...TEMPLATE_DEFAULTS, activeVersion: selected, versions: over.versions ?? {} };
  for (const k of TEMPLATE_KEYS) if (typeof source[k] === 'string' && source[k].trim()) out[k] = source[k];
  // Read-only Vietnamese reading aids (styleDna_vi, guard_vi, …) for the panel's "Dịch" toggle.
  // They translate the shipped defaults only; a custom template version keeps the default's VI,
  // which the panel flags is only exact when the field still matches the default.
  for (const k of TEMPLATE_KEYS) out[`${k}_vi`] = TEMPLATE_VI_DEFAULTS[k] ?? '';
  return out;
};

export const listTemplateVersions = () => {
  let over = {};
  if (existsSync(TEMPLATE_OVERRIDE_FILE)) {
    try { over = JSON.parse(readFileSync(TEMPLATE_OVERRIDE_FILE, 'utf8')); } catch { over = {}; }
  }
  const versions = over.versions && typeof over.versions === 'object' ? over.versions : {};
  return ['default', ...Object.keys(versions).filter((name) => name !== 'default')];
};

// Persist edited templates. Blank/missing fields keep their current effective value.
export const saveTemplates = (partial, version = getTemplates().activeVersion || 'default') => {
  const current = getTemplates();
  const next = {};
  for (const k of TEMPLATE_KEYS) {
    const v = partial?.[k];
    next[k] = typeof v === 'string' && v.trim() ? v : current[k];
  }
  let raw = {};
  if (existsSync(TEMPLATE_OVERRIDE_FILE)) {
    try { raw = JSON.parse(readFileSync(TEMPLATE_OVERRIDE_FILE, 'utf8')); } catch { raw = {}; }
  }
  const versions = { ...(raw.versions || {}) };
  if (version !== 'default') versions[version] = next;
  const payload = version === 'default'
    ? { ...next, activeVersion: version, versions }
    : { activeVersion: version, versions };
  writeFileSync(TEMPLATE_OVERRIDE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  return getTemplates();
};

export const activateTemplateVersion = (version) => {
  if (!listTemplateVersions().includes(version)) throw new Error(`Unknown template version: ${version}`);
  let raw = {};
  if (existsSync(TEMPLATE_OVERRIDE_FILE)) {
    try { raw = JSON.parse(readFileSync(TEMPLATE_OVERRIDE_FILE, 'utf8')); } catch { raw = {}; }
  }
  raw.activeVersion = version;
  writeFileSync(TEMPLATE_OVERRIDE_FILE, `${JSON.stringify(raw, null, 2)}\n`);
  return getTemplates();
};

const buildCharPrompt = (t, scenePrompt, template, aspect = currentAspect()) =>
  applyAspectText(`${NO_TEXT_POLICY}\n\n${template
    .replaceAll('[STYLE]', t.styleDna)
    .replace('[SCENE-SPECIFIC PROMPT]', scenePrompt)}\n\n${NO_TEXT_FINAL_CHECK}`, aspect);

const buildTextPrompt = (t, scenePrompt, aspect = currentAspect()) =>
  applyAspectText(`${NO_TEXT_POLICY}\n\n${t.text2img
    .replaceAll('[STYLE]', t.styleDna)
    .replaceAll('[GUARD]', t.guard)
    .replace('[SCENE-SPECIFIC PROMPT]', scenePrompt)}\n\n${NO_TEXT_FINAL_CHECK}`, aspect);

// The full prompt string generateSceneImage would send for one scene (template + style + scene
// prompt), so the review panel can count it against SEEDREAM_PROMPT_LIMIT before generating.
// Routes by declared character count, mirroring generateSceneImage's template choice.
export const assemblePrompt = (scene, templates = getTemplates(), aspect = currentAspect()) => {
  const chars = scene.image?.characters ?? [];
  const scenePrompt = scene.image?.prompt ?? '';
  if (chars.length) {
    const multi = chars.length > 1;
    const face = !multi && scene.image?.identity === 'face';
    const template = multi ? templates.multiCharPrompt : face ? templates.faceLockPrompt : templates.masterPrompt;
    return buildCharPrompt(templates, scenePrompt, template, aspect);
  }
  return buildTextPrompt(templates, scenePrompt, aspect);
};

// Default image model for every scene regardless of reference count (single-character,
// two-character, or no reference at all) is Grok Imagine. Note: Grok Imagine only accepts one
// `image` reference (see buildInput below), so on a two-character scene it locks the first-named
// character and drops the second reference — pick Seedream 4.5 from the dropdown for scenes that
// need both faces locked.
// Override via REPLICATE_SINGLE_MODEL / REPLICATE_MULTI_MODEL / REPLICATE_TEXT_MODEL.
const DEFAULT_SINGLE = 'xai/grok-imagine-image';
const DEFAULT_MULTI = 'xai/grok-imagine-image';
const DEFAULT_TEXT = 'xai/grok-imagine-image';

// Models the review UI lets the user force for a scene, overriding the default above. `id` is
// empty for "Auto" (keep the default: Grok Imagine). Only Grok Imagine and Seedream 4.5 are
// offered — Seedream is the per-scene override for two-character scenes needing both faces
// locked (see note above).
//
// Prices are Replicate USD per output image, from replicate.com/pricing (Aug 2026). They can
// change and higher resolutions can cost more — treat the labels as guidance, not a billing
// guarantee.
// The picker posts a model id and generateSceneImage dispatches on its prefix: `fal-ai/...` → fal
// (fal-image.mjs), `vmedia:...` → Gommo/VMedia (vmedia-image.mjs), everything else → Replicate.
export const IMAGE_MODELS = [
  { id: 'bytedance/seedream-4.5', label: 'Seedream 4.5 — multi-reference, best per-person identity, default (~$0.03/img)' },
  { id: 'xai/grok-imagine-image', label: 'Grok Imagine — single reference or text-to-image (~$0.04/img, +$0.01 to edit)' },
  { id: '', label: 'Auto — route by reference count (Grok Imagine)' },
  ...FAL_IMAGE_MODELS,
  ...VMEDIA_IMAGE_MODELS,
];

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
export const dataUri = (path) => `data:${MIME[path.split('.').pop().toLowerCase()] ?? 'image/png'};base64,${readFileSync(path).toString('base64')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REQUEST_TIMEOUT_MS = 30_000;

const requestJson = async (url, init, label, retryNetwork = true) => {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return response.json();
      const body = await response.text();
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 5) {
        const error = new Error(`${label} ${response.status}: ${body}`);
        error.retryable = false;
        throw error;
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await wait(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** attempt);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (error.retryable === false || !retryNetwork || attempt === 5) break;
      await wait(1000 * 2 ** attempt);
    }
  }
  throw new Error(`${label} failed after retries: ${lastError?.message ?? 'unknown error'}`);
};

// Seedream rejects prompts past this length, so fail here with a useful message instead of
// letting the API return an opaque error after the reference upload. Exported so the review panel
// can show the live full-prompt length against this limit before generating.
export const SEEDREAM_PROMPT_LIMIT = 4000;

// Build the Replicate `input` for a model. Each provider takes different fields, so the caller
// passes intent (prompt, reference data-URIs) and we shape it per provider. Seedream and
// nano-banana accept 1–14 references (multi-reference generation); FLUX takes a single one.
export const buildInput = (model, { prompt, refUris = [], aspect = currentAspect() }) => {
  const ratio = aspectInfo(aspect).ratio;
  if (model.startsWith('bytedance/seedream')) {
    if (prompt.length > SEEDREAM_PROMPT_LIMIT) {
      throw new Error(`prompt is ${prompt.length} chars, over Seedream's ${SEEDREAM_PROMPT_LIMIT} limit — shorten the scene prompt or the template in this file`);
    }
    return {
      prompt, aspect_ratio: ratio, size: '4K', max_images: 1,
      sequential_image_generation: 'disabled',
      ...(refUris.length ? { image_input: refUris } : {}),
    };
  }
  if (model.startsWith('google/nano-banana')) {
    // Gemini image models: one `prompt` string plus an optional `image_input` array of up to
    // 14 references; resolution/aspect_ratio instead of FLUX's fields, and no Seedream-style
    // prompt-length cap. Same array is used for one or many references.
    return { prompt, aspect_ratio: ratio, resolution: '4k', output_format: 'jpg', ...(refUris.length ? { image_input: refUris } : {}) };
  }
  if (model.startsWith('xai/grok-imagine')) {
    // Grok Imagine takes a single `image` for editing (not FLUX's `input_image`, and no
    // output_format/num_outputs); aspect_ratio is ignored while editing. Single reference only,
    // so a two-character scene forced onto this model keeps only the first reference.
    return refUris.length ? { prompt, image: refUris[0] } : { prompt, aspect_ratio: ratio };
  }
  // Fallback for any other model — FLUX Kontext/dev via REPLICATE_*_MODEL, and any custom model id
  // typed into the review panel's custom-model box. We can't know a custom model's exact input
  // schema, so the reference is sent under the field names the common Replicate image-edit models
  // use: `input_image` (single, FLUX Kontext), `image_input` (array, Seedream/Gemini-style) and
  // `images` (array, e.g. prunaai/qwen edit models). A model reads whichever its schema defines and
  // ignores the rest; a model with a strict schema on a different key still needs its own branch above.
  return refUris.length
    ? { prompt, input_image: refUris[0], image_input: refUris, images: refUris, aspect_ratio: ratio, output_format: 'jpg' }
    : { prompt, aspect_ratio: ratio, output_format: 'jpg', num_outputs: 1 };
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
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await runPrediction(token, model, input);
    } catch (error) {
      lastError = error;
      if (!/ConnectError|connection reset|upstream connect/i.test(error.message) || attempt === 2) throw error;
      await wait(2000 * 2 ** attempt);
    }
  }
  throw lastError;
};

const runPrediction = async (token, model, input) => {
  const endpoint = `https://api.replicate.com/v1/models/${model}/predictions`;
  // Do not hold POST open while model runs; long-lived connections frequently fail upstream.
  let p = await requestJson(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  }, `replicate create ${model}`, false);
  const predictionId = p.id ?? 'unknown';
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    await wait(2000);
    if (!p.urls?.get) throw new Error(`replicate prediction ${predictionId}: missing polling URL`);
    p = await requestJson(p.urls.get, {
      headers: { Authorization: `Bearer ${token}` },
    }, `replicate poll ${predictionId}`);
  }
  if (p.status !== 'succeeded') throw new Error(`replicate prediction ${predictionId} ${p.status}: ${JSON.stringify(p.error)}`);
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

// Route one image model to its provider by id prefix: a `fal-ai/...` id → fal (fal-image.mjs),
// anything else → Replicate. refPaths are local reference file paths; each provider builds its own
// payload from the shared data-URI encoding. Returns the output image URL.
const runImageModel = async (token, model, { prompt, refPaths, aspect = currentAspect(), onLog }) => {
  if (model.startsWith('fal-ai/')) {
    const { url } = await falImageUrl(model, { prompt, refUris: refPaths.map(dataUri), aspect, onLog });
    return url;
  }
  if (model.startsWith('vmedia:')) {
    // Gommo generateImage locks to a single reference (edit mode); a multi-character scene keeps
    // only the first reference, so pick fal/Replicate for scenes needing every face locked.
    const { url } = await vmediaImageUrl(model.slice('vmedia:'.length), {
      prompt, refDataUri: refPaths.length ? dataUri(refPaths[0]) : undefined, aspect, onLog,
    });
    return url;
  }
  if (!token) throw new Error('REPLICATE_API_TOKEN not set (put it in .env).');
  onLog(`POST https://api.replicate.com/v1/models/${model}/predictions`);
  const url = await predict(token, model, buildInput(model, { prompt, refUris: refPaths.map(dataUri), aspect }));
  onLog('prediction succeeded; image URL received');
  return url;
};

// Generate one AI scene image → public/images/scene-NN.jpg. Returns { file, via, manifestEntry }.
export const generateSceneImage = async (scene, characters, opts = {}) => {
  const token = opts.token ?? process.env.REPLICATE_API_TOKEN;
  const singleModel = opts.singleModel ?? process.env.REPLICATE_SINGLE_MODEL ?? DEFAULT_SINGLE;
  const multiModel = opts.multiModel ?? process.env.REPLICATE_MULTI_MODEL ?? DEFAULT_MULTI;
  const text = opts.textModel ?? process.env.REPLICATE_TEXT_MODEL ?? DEFAULT_TEXT;
  // Explicit model chosen in the review UI. Overrides the reference-count routing below for
  // whichever branch this scene falls into; blank/absent keeps the automatic route.
  const override = typeof opts.model === 'string' && opts.model.trim() ? opts.model.trim() : null;
  const aspect = opts.aspect ?? currentAspect();
  const onLog = opts.onLog ?? (() => {});
  // Token is required only for the Replicate path; runImageModel checks it there. A fal-only user
  // (fal model chosen, FAL_KEY set) does not need REPLICATE_API_TOKEN.
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
    // Same default (Grok Imagine) regardless of reference count; multiModel/singleModel are only
    // distinct when overridden via REPLICATE_MULTI_MODEL / REPLICATE_SINGLE_MODEL.
    const model = override ?? (multi ? multiModel : singleModel);
    const face = !multi && scene.image.identity === 'face';
    const template = multi ? t.multiCharPrompt : face ? t.faceLockPrompt : t.masterPrompt;
    const route = multi ? `multi-char ×${refs.length}` : face ? 'face-lock' : 'char-lock';
    const prompt = buildCharPrompt(t, scene.image.prompt, template, aspect);
    onLog(`route: ${route}, model=${model}, aspect=${aspect}, refs=${refs.length} (${scene.image.characters.join(', ')}), prompt=${prompt.length} chars`);
    url = await runImageModel(token, model, { prompt, refPaths: refs, aspect, onLog });
    via = `${model} ${route}`;
  } else {
    const model = override ?? text;
    const prompt = buildTextPrompt(t, scene.image.prompt, aspect);
    onLog(`route: text2img, model=${model}, aspect=${aspect}, no reference, prompt=${prompt.length} chars`);
    url = await runImageModel(token, model, { prompt, refPaths: [], aspect, onLog });
    via = `${model} text2img`;
  }

  mkdirSync(imageDir(), { recursive: true });
  onLog(`downloading result → ${join(imageDir(), file)}`);
  await download(url, join(imageDir(), file));
  onLog(`saved: ${join(imageDir(), file)}`);
  const provider = via.includes('fal-ai/') ? 'fal.ai' : via.includes('vmedia:') ? 'VMedia' : 'Replicate';
  const manifestEntry = {
    id: file.replace(/\.[^.]+$/, ''), scene: scene.scene, type: 'ai_reconstruction',
    subject: scene.image.prompt.slice(0, 80), source: `AI generated (${provider}, ${via})`, sourceUrl: null,
    license: 'AI-generated — no third-party rights; labelled on screen',
    credit: `AI reconstruction (${via})`, authenticity: 'AI_RECONSTRUCTION',
    characters: scene.image.characters, prompt: scene.image.prompt,
  };
  upsertManifest(manifestEntry);
  return { file, via, manifestEntry };
};
