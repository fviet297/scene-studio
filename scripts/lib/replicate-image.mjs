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
import { META_IMAGE_MODELS, metaImageUrl } from './meta-image.mjs';
import { MUSE_IMAGE_MODELS, museImageUrl } from './muse-image.mjs';
import { parsePlanAspect, aspectInfo, applyAspectText, frameText, DEFAULT_ASPECT } from './aspect.mjs';
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

// The style's shared negative list, substituted as [GUARD] into every template. It names style
// qualities only: the image model renders whatever object a prompt names, even inside a
// "NEGATIVE:" line, so an unwanted object is ruled out positively elsewhere instead.
const GUARD = 'mixed art styles or proportions, semi-realistic or adult-proportioned people, painted or matte backdrop, gradients, gloss, haze, blur, silhouettes, photoreal, 3D render, mixed cultures or periods, anachronism, fantasy armour, empty background, watermark';

// Appended after every editable template so a saved UI override cannot weaken this rule.
// Text is added later by Remotion, never baked into generated scene artwork.
export const NO_TEXT_POLICY = `NO TEXT: no letters, numerals or glyphs of any script anywhere, especially no Vietnamese words or diacritics. Banners, flags, walls, signs and maps stay blank — material, colour, folds and terrain only. Garments too: plain chest and collar, closed by cloth ties or a knotted sash — no emblem, badge, brooch, pendant, amulet, necklace or religious insignia on anyone.`;
// The garment clause exists because image models kept hanging a Christian cross on the chest of
// 10th-century Vietnamese figures — the seed was the template's own "cross-collared tunic", and a
// blank-chest rule is what stops the model from filling that space with any other stray insignia.
const NO_TEXT_FINAL_CHECK = 'FINAL CHECK: no lettering anywhere, no emblem or cross-shaped clasp on any chest, two arms per person.';

// Style-independent figure rules, appended to every route so no template (shipped or saved from
// the UI) has to carry its own copy. A lone figure holding a second prop (a pole plus a net, an
// oar plus a rope) is where the model grows a third arm to free up a hand, so the rule names that
// failure; the strap clause is phrased positively because naming bags in a negative drew them in.
const FIGURE_RULES = 'ANATOMY & SCALE: each person has one head, two legs, exactly two arms and two hands — no extra, merged or floating limb, no fused bodies. Props sit whole in those two hands or rest on a shoulder, belt, the ground or a boat — never an extra arm to hold one, never a strap across the body. Every horse, ox or elephant shows four legs, ridden or not; a rider faces where the mount faces. One ground plane, one scale; distant figures shrink.';

// Shared by every template: which culture each element belongs to. Kept generic — the scene
// prompt names the specific wrong dynasty to exclude, so no project's enemies are baked in here.
const WORLD_RULE = "WORLD: the SCENE's named country and century decide architecture, dress, armour, weapons and objects; two named sides each keep their own; nothing from a culture or era the SCENE does not name.";

const CHIBI_FIGURES = 'Distant scenery = flat outlined shapes in cooler tones; no painted backdrop, haze or blur. Mains, soldiers and crowd share the same 2.5-head proportions, mitten hands, line weight and flat cel shading; a crowd is many small chibi figures, never a textured mass.';
const CHIBI_STAGING = 'STAGING: wide environmental story shot, never a close-up portrait; each main about 20–30% of frame height. Layered depth, leading lines, varied scale, visible activity; asymmetric or diagonal, never a centred lineup. Faces readable and uncropped.';

// Kontext (image-to-image) character-lock template. The scene's action/setting prompt is
// substituted into [SCENE-SPECIFIC PROMPT]; everything else forces identity from the reference.
const MASTER_PROMPT = `ONE flat 2D chibi cartoon illustration. [FRAME]

STYLE: [STYLE]. ${CHIBI_FIGURES}

MAIN CHARACTER: locked to the reference — same face, hair, skin, proportions, costume, armour, colours and weapon; only pose, expression, action, camera and lighting change. Extras wear plainer gear and never copy the main's face, helmet or armour.

${WORLD_RULE}

SCENE: [SCENE-SPECIFIC PROMPT]

${CHIBI_STAGING}

NEGATIVE: [GUARD], redesigned main face or costume, main filling the frame.`;

// Face-lock variant for scenes tagged `identity: face`. Locks the person's face, hair, age and
// 2D style from the reference but lets the scene prompt re-dress the figure — e.g. a general
// shown poor and in commoner's clothes before his rise, where the reference armor would be wrong.
const FACE_LOCK_PROMPT = `SAME PERSON, DIFFERENT SCENE — ONE flat 2D chibi cartoon illustration. [FRAME]

STYLE: [STYLE]. ${CHIBI_FIGURES}

FACE LOCK: the reference fixes face, eyes, nose, mouth, hairstyle, hair colour, skin tone, apparent age and chibi proportions only. Clothing and pose follow the SCENE, even when the reference wears armour.

${WORLD_RULE}

SCENE: [SCENE-SPECIFIC PROMPT]

${CHIBI_STAGING}

NEGATIVE: [GUARD], different face, hairstyle, age or person.`;

// Multi-reference variant for scenes listing two or more characters (`char: a, b`). Every
// reference is uploaded and each figure is locked to its own one; without this the model gets a
// single reference for a two-person scene and paints the same face onto both figures.
const MULTI_CHAR_PROMPT = `SEVERAL DIFFERENT PEOPLE — ONE flat 2D chibi cartoon illustration. [FRAME]

STYLE: [STYLE]. ${CHIBI_FIGURES}

REFERENCES: reference 1 = the first named character, reference 2 = the second, further ones in named order. Keep each person's face, hair, skin, costume, armour, colours and weapon; each main appears exactly once and stays distinct. Extras wear plain gear and copy neither main.

${WORLD_RULE}

SCENE: [SCENE-SPECIFIC PROMPT]

${CHIBI_STAGING} Follow the SCENE's placement and keep the mains clearly separated.

NEGATIVE: [GUARD], cloned, mirrored or merged mains, shared faces.`;

// Text-to-image template for scenes with no character reference (e.g. an enemy army,
// a symbolic shot). Placeholders below are filled at generate time.
const TEXT2IMG_TEMPLATE = `ONE flat 2D chibi cartoon ENVIRONMENT illustration — the setting is the subject. [FRAME]

STYLE: [STYLE]. Distant scenery = flat outlined shapes in cooler tones.

CAST: draw only the people, animals and objects the SCENE names. No person named → no human figure. A named group stays small and supports the environment; never invent a protagonist.

${WORLD_RULE}

SCENE: [SCENE-SPECIFIC PROMPT]

NEGATIVE: [GUARD], character portrait, giant foreground figure.`;

// The editable prompt pieces the review UI exposes. Every generated image combines the
// scene's own prompt with these. Placeholders, filled in every template: [STYLE] = style DNA,
// [GUARD] = the style's shared negative list, [FRAME] = the project aspect's frame and safe-zone
// line (aspect.mjs), [SCENE-SPECIFIC PROMPT] = that scene's prompt from the plan.
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

// Every route shares one assembly: fixed text policy, the filled template, fixed figure rules.
// applyAspectText still runs for saved versions authored before [FRAME] that spell out "9:16".
const buildPrompt = (t, scenePrompt, template, aspect = currentAspect()) =>
  applyAspectText(`${NO_TEXT_POLICY}\n\n${template
    .replaceAll('[FRAME]', frameText(aspect))
    .replaceAll('[STYLE]', t.styleDna)
    .replaceAll('[GUARD]', t.guard)
    .replace('[SCENE-SPECIFIC PROMPT]', scenePrompt)}\n\n${FIGURE_RULES}\n\n${NO_TEXT_FINAL_CHECK}`, aspect);


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
    return buildPrompt(templates, scenePrompt, template, aspect);
  }
  return buildPrompt(templates, scenePrompt, templates.text2img, aspect);
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
// (fal-image.mjs), `vmedia:...` → Gommo/VMedia (vmedia-image.mjs), `meta:...` → Meta Model API
// (meta-image.mjs), `muse:...` → muse2api (muse-image.mjs), everything else → Replicate.
export const IMAGE_MODELS = [
  { id: 'bytedance/seedream-4.5', label: 'Seedream 4.5 — multi-reference, best per-person identity, default (~$0.03/img)' },
  { id: 'xai/grok-imagine-image', label: 'Grok Imagine — single reference or text-to-image (~$0.04/img, +$0.01 to edit)' },
  { id: '', label: 'Auto — route by reference count (Grok Imagine)' },
  ...FAL_IMAGE_MODELS,
  ...VMEDIA_IMAGE_MODELS,
  ...META_IMAGE_MODELS,
  ...MUSE_IMAGE_MODELS,
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
  if (model.startsWith('meta:')) {
    const { url } = await metaImageUrl(model.slice('meta:'.length), {
      prompt, refUris: refPaths.map(dataUri), size: aspectInfo(aspect).metaImageSize, onLog,
    });
    return url;
  }
  if (model.startsWith('muse:')) {
    // Single-reference like VMedia: a multi-character scene keeps only the first reference.
    const { url } = await museImageUrl(model.slice('muse:'.length), {
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
    const prompt = buildPrompt(t, scene.image.prompt, template, aspect);
    onLog(`route: ${route}, model=${model}, aspect=${aspect}, refs=${refs.length} (${scene.image.characters.join(', ')}), prompt=${prompt.length} chars`);
    url = await runImageModel(token, model, { prompt, refPaths: refs, aspect, onLog });
    via = `${model} ${route}`;
  } else {
    const model = override ?? text;
    const prompt = buildPrompt(t, scene.image.prompt, t.text2img, aspect);
    onLog(`route: text2img, model=${model}, aspect=${aspect}, no reference, prompt=${prompt.length} chars`);
    url = await runImageModel(token, model, { prompt, refPaths: [], aspect, onLog });
    via = `${model} text2img`;
  }

  mkdirSync(imageDir(), { recursive: true });
  onLog(`downloading result → ${join(imageDir(), file)}`);
  await download(url, join(imageDir(), file));
  onLog(`saved: ${join(imageDir(), file)}`);
  const provider = via.includes('fal-ai/') ? 'fal.ai' : via.includes('vmedia:') ? 'VMedia' : via.includes('meta:') ? 'Meta' : via.includes('muse:') ? 'muse2api' : 'Replicate';
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
