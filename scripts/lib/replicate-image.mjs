// Shared Replicate image generation for one scene. Used by both the CLI
// (scripts/generate-visuals.mjs) and the review UI server (scripts/review-server.mjs)
// so the FLUX Kontext / text-to-image logic and the manifest record live in one place.
//
//   generateSceneImage(scene, characters, { token, kontextModel, textModel })
//     scene      — one parsed scene from parsePlan() ({ scene, image: { kind, characters, prompt } })
//     characters — the plan's { id: referencePath } map
//   → { file, via, manifestEntry }, and writes public/images/scene-NN.jpg
//
// Requires REPLICATE_API_TOKEN. Only kind === 'ai' scenes are generated here;
// search scenes are handled by source-assets.mjs.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activePaths } from './project-paths.mjs';
import { META_IMAGE_MODELS, metaImageUrl } from './meta-image.mjs';
import { MUSE_IMAGE_MODELS, museImageUrl } from './muse-image.mjs';
import { openaiImageUrl } from './openai-image.mjs';
import { customProviderOf, getConfig } from './model-config.mjs';
import { providerOf } from './providers.mjs';
import { parsePlanAspect, aspectInfo, applyAspectText, frameText, DEFAULT_ASPECT } from './aspect.mjs';
import { TEMPLATE_VI_DEFAULTS } from './template-vi.mjs';
import { MOTION_SYSTEM } from './motion-template.mjs';
import { readPlanHeader, writePlanHeader } from './plan-writer.mjs';

// Which project's public/projects/<slug>/images/ + asset-manifest.json this module reads and
// writes. CLI scripts (generate-visuals.mjs, restyle-characters.mjs) get the active project once
// at startup; the long-running review server calls setProjectPaths() on every project switch, so
// a frozen const here would silently write into the wrong project after a switch.
let paths = activePaths();
// Active project's aspect (from its scene-plan `aspect:`), read fresh on every use: the plan's
// `aspect:` line can be edited while the review server is running, and a value cached at startup
// or at the last project switch would keep generating images in the previous ratio.
const readAspect = (planMd) => (existsSync(planMd) ? parsePlanAspect(readFileSync(planMd, 'utf8')) : DEFAULT_ASPECT);
export const currentAspect = () => readAspect(paths.planMd);
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
// `motionSystem` is not an image template: it is the system prompt the motion writer
// (motion-writer.mjs) sends to the LLM that writes camera/action/env. It lives in this store so the
// panel edits it beside the image templates and it follows the project's style version; it never
// reaches a video model.
const TEMPLATE_DEFAULTS = {
  styleDna: STYLE_DNA,
  guard: GUARD,
  masterPrompt: MASTER_PROMPT,
  faceLockPrompt: FACE_LOCK_PROMPT,
  multiCharPrompt: MULTI_CHAR_PROMPT,
  text2img: TEXT2IMG_TEMPLATE,
  motionSystem: MOTION_SYSTEM,
};
export const TEMPLATE_KEYS = Object.keys(TEMPLATE_DEFAULTS);
// User edits are persisted here (project-root relative) and override the defaults above. The file
// holds template *content* only (top-level fields = the "default" version, plus named `versions`);
// which version a project uses is its own scene-plan `template:` header, so switching projects
// never rewrites this tracked file. Its `activeVersion` key is legacy and read-only: the fallback
// for projects whose plan has no `template:` line yet.
export const TEMPLATE_OVERRIDE_FILE = 'scripts/prompt-templates.json';
const TEMPLATE_META_KEYS = new Set(['activeVersion', 'versions']);

const readTemplateFile = () => {
  if (!existsSync(TEMPLATE_OVERRIDE_FILE)) return {};
  try { return JSON.parse(readFileSync(TEMPLATE_OVERRIDE_FILE, 'utf8')); } catch { return {}; }
};
const projectTemplateVersion = () => (existsSync(paths.planMd)
  ? readPlanHeader(readFileSync(paths.planMd, 'utf8'), 'template')
  : null);

// Effective templates = defaults merged with any saved override (a blank field falls back).
export const getTemplates = () => {
  const over = readTemplateFile();
  const versions = over.versions ?? {};
  const isKnown = (v) => typeof v === 'string' && (v === 'default' || Object.hasOwn(versions, v));
  const selected = [projectTemplateVersion(), over.activeVersion].find(isKnown) ?? 'default';
  const source = over.versions?.[selected] ?? over;
  const out = { ...TEMPLATE_DEFAULTS, activeVersion: selected, versions };
  for (const k of TEMPLATE_KEYS) if (typeof source[k] === 'string' && source[k].trim()) out[k] = source[k];
  // Read-only Vietnamese reading aids (styleDna_vi, guard_vi, …) for the panel's "Dịch" toggle.
  // They translate the shipped defaults only; a custom template version keeps the default's VI,
  // which the panel flags is only exact when the field still matches the default.
  for (const k of TEMPLATE_KEYS) out[`${k}_vi`] = TEMPLATE_VI_DEFAULTS[k] ?? '';
  return out;
};

export const listTemplateVersions = () => {
  const over = readTemplateFile();
  const versions = over.versions && typeof over.versions === 'object' ? over.versions : {};
  return ['default', ...Object.keys(versions).filter((name) => name !== 'default')];
};

// Point the active project at `version` (its scene-plan `template:` header).
const useTemplateVersion = (version) => {
  if (existsSync(paths.planMd)) writePlanHeader(paths.planMd, 'template', version);
};

// Persist edited templates under `version` and make it the active project's version. Blank/missing
// fields keep their current effective value.
export const saveTemplates = (partial, version = getTemplates().activeVersion || 'default') => {
  const current = getTemplates();
  const next = {};
  for (const k of TEMPLATE_KEYS) {
    const v = partial?.[k];
    next[k] = typeof v === 'string' && v.trim() ? v : current[k];
  }
  const raw = readTemplateFile();
  const versions = { ...(raw.versions || {}) };
  if (version !== 'default') versions[version] = next;
  const payload = version === 'default' ? { ...raw, ...next, versions } : { ...raw, versions };
  writeFileSync(TEMPLATE_OVERRIDE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  useTemplateVersion(version);
  return getTemplates();
};

export const activateTemplateVersion = (version) => {
  if (!listTemplateVersions().includes(version)) throw new Error(`Unknown template version: ${version}`);
  useTemplateVersion(version);
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
// `image` reference (see buildInput below), so on a two-character scene the references go as one
// tiled sheet (singleReference) — Seedream 4.5, which takes each reference separately, still locks
// both faces most reliably.
// Override via REPLICATE_SINGLE_MODEL / REPLICATE_MULTI_MODEL / REPLICATE_TEXT_MODEL.
const DEFAULT_SINGLE = 'xai/grok-imagine-image';
const DEFAULT_MULTI = 'xai/grok-imagine-image';
const DEFAULT_TEXT = 'xai/grok-imagine-image';

// Models the review UI lets the user force for a scene, overriding the default above. Only Grok
// Imagine and Seedream 4.5 are offered — Seedream is the per-scene override for two-character
// scenes needing both faces locked (see note above). There is no "Auto" entry: with the defaults
// above it routed every scene to Grok Imagine, the same as picking Grok Imagine.
//
// `price` is USD per output image (null = unknown), used by the panel's batch cost estimate.
// Replicate prices are from replicate.com/pricing (Aug 2026); they can change and higher
// resolutions can cost more — treat them as guidance, not a billing guarantee.
// The picker posts a model id and generateSceneImage dispatches on its prefix: `meta:...` → Meta
// Model API (meta-image.mjs), `muse:...` → muse2api (muse-image.mjs), `<provider>:...` → a provider
// added in the model manager (openai-image.mjs), everything else → Replicate.
export const IMAGE_MODELS = [
  { id: 'bytedance/seedream-4.5', label: 'Seedream 4.5 — nhiều tham chiếu, giữ mặt từng người tốt nhất (~$0.03/ảnh)', price: 0.03 },
  { id: 'xai/grok-imagine-image', label: 'Grok Imagine — 1 tham chiếu hoặc không tham chiếu (~$0.04/ảnh, +$0.01 khi sửa)', price: 0.04 },
  ...META_IMAGE_MODELS,
  ...MUSE_IMAGE_MODELS,
];

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
export const dataUri = (path) => `data:${MIME[path.split('.').pop().toLowerCase()] ?? 'image/png'};base64,${readFileSync(path).toString('base64')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const REQUEST_TIMEOUT_MS = 30_000;

// muse2api and Grok Imagine take a single reference image. With several references (a multi-character
// scene) they are tiled left→right, in plan order, into one sheet, and the prompt says which
// panel is which — otherwise only the first character would keep its face. Returns the prompt
// and the data URI to send.
const SHEET_HEIGHT = 1024;
const referenceSheetNote = (count) => `REFERENCE SHEET: the one reference image shows ${count} different people side by side, left to right — leftmost = reference 1 (the first named character)${count > 2 ? ', then reference 2, 3… in order' : ''}, rightmost = reference ${count}. It is a cast sheet, not a layout: draw each person once, inside the SCENE, never the sheet itself.`;
const singleReference = (prompt, refPaths, onLog = () => {}) => {
  if (refPaths.length <= 1) return { prompt, refDataUri: refPaths.length ? dataUri(refPaths[0]) : undefined };
  const sheet = join(tmpdir(), `ref-sheet-${randomUUID()}.jpg`);
  const scaled = refPaths.map((_, i) => `[${i}]scale=-2:${SHEET_HEIGHT}[r${i}]`).join(';');
  const stacked = `${refPaths.map((_, i) => `[r${i}]`).join('')}hstack=inputs=${refPaths.length}`;
  execFileSync('ffmpeg', [
    '-y', ...refPaths.flatMap((path) => ['-i', path]),
    '-filter_complex', `${scaled};${stacked}`,
    '-frames:v', '1', '-q:v', '3', sheet,
  ], { stdio: 'pipe' });
  try {
    onLog(`${refPaths.length} references tiled into one sheet (this provider takes a single image)`);
    return { prompt: `${referenceSheetNote(refPaths.length)}\n\n${prompt}`, refDataUri: dataUri(sheet) };
  } finally {
    unlinkSync(sheet);
  }
};

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
    // output_format/num_outputs); aspect_ratio is ignored while editing. Single reference only:
    // runImageModel tiles a multi-character scene's references into one sheet before this.
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

// `signal` (optional) cancels the job: polling stops, the prediction is cancelled on Replicate so
// it stops billing, and the call rejects with the signal's AbortError.
export const predict = async (token, model, input, { signal } = {}) => {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await runPrediction(token, model, input, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (!/ConnectError|connection reset|upstream connect/i.test(error.message) || attempt === 2) throw error;
      await wait(2000 * 2 ** attempt);
    }
  }
  throw lastError;
};

// Best effort: a failed cancel must not mask the abort itself.
const cancelPrediction = async (token, p) => {
  if (!p.urls?.cancel) return;
  await requestJson(p.urls.cancel, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, `replicate cancel ${p.id}`, false)
    .catch(() => {});
};

const runPrediction = async (token, model, input, signal) => {
  signal?.throwIfAborted();
  const endpoint = `https://api.replicate.com/v1/models/${model}/predictions`;
  // Do not hold POST open while model runs; long-lived connections frequently fail upstream.
  let p = await requestJson(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  }, `replicate create ${model}`, false);
  const predictionId = p.id ?? 'unknown';
  while (!['succeeded', 'failed', 'canceled'].includes(p.status)) {
    if (signal?.aborted) {
      await cancelPrediction(token, p);
      signal.throwIfAborted();
    }
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

// Upsert one manifest entry into the active project's asset-manifest.json (kept sorted).
export const upsertManifest = (entry) => {
  const manifest = existsSync(manifestPath()) ? JSON.parse(readFileSync(manifestPath(), 'utf8')) : [];
  const i = manifest.findIndex((m) => m.id === entry.id);
  if (i >= 0) manifest[i] = entry; else manifest.push(entry);
  manifest.sort((a, b) => a.scene - b.scene || a.id.localeCompare(b.id));
  mkdirSync(paths.imageDir, { recursive: true });
  writeFileSync(manifestPath(), `${JSON.stringify(manifest, null, 2)}\n`);
};

// Route one image model to its provider by id prefix (see IMAGE_MODELS); anything unrecognised →
// Replicate. refPaths are local reference file paths; each provider builds its own
// payload from the shared data-URI encoding. Returns the output image URL. Also used for character
// reference images (character-image.mjs).
export const runImageModel = async (token, model, { prompt, refPaths, aspect = currentAspect(), onLog, signal }) => {
  if (model.startsWith('meta:')) {
    const { url } = await metaImageUrl(model.slice('meta:'.length), {
      prompt, refUris: refPaths.map(dataUri), size: aspectInfo(aspect).metaImageSize, onLog,
    });
    return url;
  }
  if (model.startsWith('muse:')) {
    // Takes a single reference image: several are sent as one sheet.
    const { url } = await museImageUrl(model.slice('muse:'.length), {
      ...singleReference(prompt, refPaths, onLog), aspect, onLog, signal,
    });
    return url;
  }
  const custom = customProviderOf(getConfig(), model);
  if (custom) {
    const { url } = await openaiImageUrl({
      label: custom.provider.id, baseUrl: custom.provider.baseUrl, apiKey: custom.provider.apiKey, model: custom.name,
      prompt, refUris: refPaths.map(dataUri), size: aspectInfo(aspect).openaiImageSize, onLog,
    });
    return url;
  }
  if (!token) throw new Error('REPLICATE_API_TOKEN not set (put it in .env).');
  onLog(`POST https://api.replicate.com/v1/models/${model}/predictions`);
  // Grok Imagine edits from one image, like muse2api: several references go as one sheet.
  const single = model.startsWith('xai/grok-imagine') ? singleReference(prompt, refPaths, onLog) : null;
  const input = single
    ? buildInput(model, { prompt: single.prompt, refUris: single.refDataUri ? [single.refDataUri] : [], aspect })
    : buildInput(model, { prompt, refUris: refPaths.map(dataUri), aspect });
  const url = await predict(token, model, input, { signal });
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
  // Optional AbortSignal: a cancelled job stops its provider call and never writes the image.
  const { signal } = opts;
  // Token is required only for the Replicate path; runImageModel checks it there. A user of another
  // provider (muse, meta, …) does not need REPLICATE_API_TOKEN.
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
    url = await runImageModel(token, model, { prompt, refPaths: refs, aspect, onLog, signal });
    via = `${model} ${route}`;
  } else {
    const model = override ?? text;
    const prompt = buildPrompt(t, scene.image.prompt, t.text2img, aspect);
    onLog(`route: text2img, model=${model}, aspect=${aspect}, no reference, prompt=${prompt.length} chars`);
    url = await runImageModel(token, model, { prompt, refPaths: [], aspect, onLog, signal });
    via = `${model} text2img`;
  }

  signal?.throwIfAborted(); // cancelled while the provider finished: keep the current image
  mkdirSync(imageDir(), { recursive: true });
  onLog(`downloading result → ${join(imageDir(), file)}`);
  await download(url, join(imageDir(), file));
  onLog(`saved: ${join(imageDir(), file)}`);
  const provider = providerOf(via).label;
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
