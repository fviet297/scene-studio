// Local review UI server for the per-scene image gate (the mandatory "approve visuals
// before audio" step). No framework — Node's built-in http only. Serves one self-contained
// control-panel page plus a small JSON/SSE API:
//
//   GET  /                    → the control panel (scripts/review-panel.html)
//   GET  /panel.css|/panel.js|/timeline.js → the panel's stylesheet and scripts
//   GET  /api/state           → scenes parsed from the active scene-plan.md + which images exist
//   GET  /images/scene-NN.jpg → serve the current scene image (no-cache so regen shows)
//   GET  /characters/<file>   → serve a character reference/puppet image for the active project
//   GET  /api/projects        → list every projects/<slug> + which one is active
//   POST /api/project         → { slug } → switch the active project, rebuild its bundle
//   POST /api/project-create  → { slug, title, aspect?, template?, voice?, plan? } → new project from
//                               a pasted scene-plan.md, or scaffolded from projects/_template
//   POST /api/script-generate → { request, sceneCount, voice?, slug?, title?, aspect?, template? } →
//                               LLM writes the whole video (narration, cast, image + motion prompts),
//                               then it becomes a new active project; progress streamed over SSE
//   GET  /api/voices          → OmniVoice voice profiles (the running server, else its voice folder)
//   POST /api/project-voice   → { voice } → the active project's narration voice (`voice:` header)
//   POST /api/prompt          → { scene, prompt } → write prompt back into the plan .md
//   POST /api/narration       → { scene, narration } → write narration back into the plan .md
//   POST /api/scenes-update   → { scenes:[{scene,narration?,cue?,char?,beat?,prompt?,prompt_vi?,camera?,action?,env?,…_vi?,motion?,motion_vi?}] } bulk patch (full-script editor + JSON import)
//   POST /api/scene-field     → { scene, field, value } → write title|cue|host|char back into the plan .md
//   POST /api/character-create → { id, name } → add a character to the plan + create its profile.json
//   GET  /api/character-library → every other project's characters, most recently updated first
//   GET  /library-characters/<slug>/<file> → another project's character reference image
//   POST /api/character-import → { project, sourceId, id, name, replace? } → copy another project's
//                               character (reference image + profile.json) into the active project
//                               as `id`; replace overwrites the existing character `id`
//   POST /api/character-upload?id=<id> → raw image body → set/replace that character's reference image
//   POST /api/character-source?id=<id> → raw image body → source image to redraw that character from
//   POST /api/character-generate → { id, model, description?, source?: 'upload'|'current' } → draw a
//                               draft reference (from the description, or redrawn from a source
//                               image) in the active style; streamed over SSE
//   POST /api/character-apply → { id, from?: 'draft'|'source' } → the draft (default) or the uploaded
//                               source image, as it is, becomes that character's reference image
//   POST /api/generate-puppets → { id? } → spawn generate-puppet-references.mjs, stream its log over SSE
//   POST /api/generate-prompt → { scene } → write that scene's image prompt from narration via OpenAI
//   POST /api/generate-prompts-batch → { scenes:[...] } → same, sequential, streamed over SSE
//   POST /api/generate-motion-prompts-batch → { scenes:[...] } → write camera / action / env for
//                               those scenes via the LLM (motion-writer.mjs), streamed over SSE
//   POST /api/social-generate → { note? } → title, description and hashtags for YouTube, TikTok and
//                               Facebook from the active project's narration (social-writer.mjs)
//   POST /api/thumbnail-ideas → headline options, cast and an English background prompt (thumbnail.mjs)
//   GET  /api/thumbnail-backgrounds → the active project's AI thumbnail backgrounds, newest first
//   POST /api/thumbnail-generate → { model, prompt, chars, side } → one 16:9 AI background, SSE
//   POST /api/generate        → { scene } → run Replicate for that one AI scene
//   POST /api/upload?scene=N  → raw image body → use the user's own photo for that scene
//   POST /api/upload-motion-video?scene=N → raw MP4/MOV body → replace that scene's motion video
//   POST /api/remove-motion-video → { scene } → remove clip and use the source image instead
//   GET  /api/model-config    → providers (endpoint, masked key) and image/motion models, grouped for the manager
//   POST /api/model-config/<provider-add|provider-update|provider-delete|model-add|model-update|model-delete|model-hidden>
//                             → edit data/models.json (keys never returned in full), answers with the refreshed list
//   GET  /api/branding        → the active project's corner logo + watermark settings
//   POST /api/branding        → { logo:{enabled,position,opacity}, watermark:{enabled,opacity} } → save
//   GET  /brand-logo.svg      → the channel logo (public/brand/logo.svg) for the panel preview
//   POST /api/project-aspect  → { aspect } → change the active project's `aspect:` header
//   POST /api/finalize        → { format: wide|vertical } → render; a 16:9 project's vertical
//                               export is the master plus its 1080x1920 wrap (wrap-vertical.mjs)
//   GET  /video[?f=9x16]      → the rendered master, or its 9:16 wrap
//   GET  /preview.js          → src/preview/preview-entry.tsx bundled: the render composition in
//                               @remotion/player, for the timeline's "as rendered" modes
//   GET  /api/preview-data    → rebuild + return the active project's Remotion data (same builder
//                               the render runs first), so the preview plays exactly what renders
//   GET  /public/<path>       → files under public/ (what staticFile() points at in the preview)
//   GET  /api/services        → state of the local OmniVoice / muse2api servers
//   POST /api/services/start  → { id } → start that local server as a child of this one
//   POST /api/services/stop   → { id } → stop a server this one started
//   POST /api/services/restart → { id } → stop a server this one started, wait for exit, start it
//   GET  /api/jobs            → generation jobs still running here (they outlive a page reload),
//                               with their kind, scenes and the scenes already finished
//   POST /api/cancel          → { id } → cancel the streamed job the panel tagged with X-Job-Id
//
// Run: node scripts/review-server.mjs   (then open http://127.0.0.1:8080)
// Env: REVIEW_PORT (default 8080). Reuses REPLICATE_* from ./.env via replicate-image.mjs.

import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, watch, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { beginChange, historyCounts, redoChange, settleChange, undoChange } from './lib/media-history.mjs';
import { generateSceneImage, loadEnv, upsertManifest, manifestPath, getTemplates, saveTemplates, activateTemplateVersion, listTemplateVersions, setProjectPaths as setImageProjectPaths, IMAGE_MODELS, assemblePrompt, SEEDREAM_PROMPT_LIMIT } from './lib/replicate-image.mjs';
import { buildMotionPrompt, generateSceneVideo, MOTION_VIDEO_MODELS } from './lib/motion-video.mjs';
import { activePaths, ensureProjectDirs, isValidSlug, listProjects, OUTPUT_DIR, PROJECTS_DIR, projectPaths, projectTitle, sceneBase, setActiveSlug, setOutputDir } from './lib/project-paths.mjs';
import { ASPECTS, aspectInfo, parsePlanAspect } from './lib/aspect.mjs';
import { parsePlan } from './lib/parse-plan.mjs';
import { addCharacterToPlan, appendScene, characterRefPath, closeSceneGap, hasSceneHeading, insertScene, mergeScenes, MOTION_PART_KEYS, readPlanHeader, removeScene, renderScenePlan, writeCharacterPath, writeMotionParts, writePlanHeader, writeSceneField } from './lib/plan-writer.mjs';
import { composeMotionPrompt, hasMotionParts, MOTION_FIELDS, writeMotionsBatched } from './lib/motion-writer.mjs';
import { pickerModels, providerOf } from './lib/providers.mjs';
import { ConfigError, initModelConfig } from './lib/model-config.mjs';
import { applyModelConfigAction, describeModelConfig, isModelConfigAction } from './lib/model-manager.mjs';
import { removeSceneMedia, shiftSceneMedia } from './lib/scene-shift.mjs';
import { clearAudioNarration, isAudioStale, readAudioNarration, writeAudioNarration } from './lib/audio-narration.mjs';
import { adoptMotionSource, clearMotionSource, imageFingerprint, isMotionStale, readMotionSource, writeMotionSource } from './lib/motion-source.mjs';
import { buildCharacterContext, generateScenePrompt } from './lib/prompt-writer.mjs';
import { listServices, restartService, startService, stopService } from './lib/local-services.mjs';
import { readBranding, writeBranding } from './lib/branding.mjs';
import { appendNotification, clearNotifications, readNotifications, sanitizeNotification } from './lib/notification-store.mjs';
import { previewBundle } from './lib/preview-bundle.mjs';
import { DEFAULT_VOICE, isValidVoiceName, listVoices } from './lib/omnivoice-client.mjs';
import { SCENE_COUNT_MAX, SCENE_COUNT_MIN, writeVideo } from './lib/script-writer.mjs';
import { MAX_SOCIAL_NOTE, writeSocialPosts } from './lib/social-writer.mjs';
import { generateThumbnailBackground, MAX_THUMB_PROMPT, THUMB_SIDES, writeThumbnailIdeas } from './lib/thumbnail.mjs';
import { generateCharacterImage, MAX_CHARACTER_DESCRIPTION } from './lib/character-image.mjs';

loadEnv();
initModelConfig();

// Motion prompt priority: the scene's camera / action / env (motion-writer.mjs) wrapped in the
// fixed lines; else an older single-line `motion:` (lsvn/trangca skills) verbatim; else one
// auto-built from the image prompt. `parts` lets a caller send unsaved camera/action/env edits.
// Plenx models get the positive-only wrapper (see composeMotionPrompt); the panel's preview, which
// does not know the model, shows the default one.
const sceneMotionPrompt = (scene, parts = scene.image?.motionParts, model = '') =>
  hasMotionParts(parts)
    ? composeMotionPrompt(parts, { cue: scene.cue ?? '', charCount: scene.image?.characters?.length ?? 0, plain: providerOf(model).id === 'plenx' })
    : scene.image?.motion?.trim() ||
      buildMotionPrompt({ narration: scene.narration ?? '', scenePrompt: scene.image?.prompt ?? '' });

const PORT = Number(process.env.REVIEW_PORT ?? 9000);
const TEMPLATE_MD = join('projects', '_template', 'scene-plan.md');
const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL = join(HERE, 'review-panel.html');
// The panel's stylesheet and script, served as-is next to the page.
const PANEL_ASSETS = {
  '/panel.css': ['review-panel.css', 'text/css; charset=utf-8'],
  '/panel.js': ['review-panel.js', 'text/javascript; charset=utf-8'],
  '/timeline.js': ['review-timeline.js', 'text/javascript; charset=utf-8'],
  '/script-gen.js': ['review-script-gen.js', 'text/javascript; charset=utf-8'],
  '/char-image.js': ['review-char-image.js', 'text/javascript; charset=utf-8'],
  '/models.js': ['review-models.js', 'text/javascript; charset=utf-8'],
  '/social.js': ['review-social.js', 'text/javascript; charset=utf-8'],
  '/thumbnail.js': ['review-thumbnail.js', 'text/javascript; charset=utf-8'],
  '/brand-logo.svg': ['../public/brand/logo.svg', 'image/svg+xml'],
};

// The active project's paths. Mutable: POST /api/project and /api/project-create reassign it,
// which is why every handler below reads through `P` instead of a frozen const.
let P = activePaths();
setImageProjectPaths(P);
// The active project's aspect ('9:16' default, '16:9', …), read fresh from its plan so image/video
// generation and the upload check match the composition ratio even right after a project switch.
const activeAspect = () => (existsSync(P.planMd) ? parsePlanAspect(readFileSync(P.planMd, 'utf8')) : '9:16');

// Media of deleted scenes waits here, per project, for a manual restore.
const DELETED_SCENES_DIR = join('tmp', 'deleted-scenes');

const sceneFile = (n) => `${sceneBase(n)}.jpg`;
const audioFile = (n) => `${sceneBase(n)}.mp3`;
const sceneVideoFile = (n) => `${sceneBase(n)}.mp4`;
const outMp4 = () => join(P.outDir, `${P.slug}.mp4`);
// Written by wrap-vertical.mjs from a 16:9 master (same name it uses).
const outMp4Vertical = () => join(P.outDir, `${P.slug}-9x16.mp4`);
// Every render in P.outDir across all projects: <slug>.mp4 is the master, <slug>-9x16.mp4 the
// vertical wrap. The pattern doubles as the path-traversal guard for GET /output/<name>.
const OUTPUT_VIDEO_RE = /^[a-z0-9][a-z0-9-]*\.mp4$/;
const VERTICAL_SUFFIX = '-9x16';
const outputLibrary = () => ({ dir: P.outDir, defaultDir: OUTPUT_DIR, videos: listOutputVideos() });
const listOutputVideos = () => {
  if (!existsSync(P.outDir)) return [];
  const slugs = new Set(listProjects());
  return readdirSync(P.outDir)
    .filter((name) => OUTPUT_VIDEO_RE.test(name))
    .map((name) => {
      const base = name.slice(0, -'.mp4'.length);
      const vertical = base.endsWith(VERTICAL_SUFFIX);
      const slug = vertical ? base.slice(0, -VERTICAL_SUFFIX.length) : base;
      const known = slugs.has(slug);
      const { size, mtimeMs } = statSync(join(P.outDir, name));
      const aspect = vertical ? '9:16' : known ? parsePlanAspect(readFileSync(projectPaths(slug).planMd, 'utf8')) : '16:9';
      return {
        name, slug, vertical, aspect, size, mtimeMs,
        title: known ? projectTitle(slug) : slug,
        active: slug === P.slug,
        url: `/output/${name}?v=${mtimeMs}`,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
};
// Export formats a 16:9 project can render: the YouTube master alone, or the master plus its
// Shorts/TikTok wrap (the panel picks it from the timeline's preview mode).
const RENDER_FORMATS = ['wide', 'vertical'];
const imagePathFor = (n) => join(P.imageDir, sceneFile(n));
const motionPathFor = (n) => join(P.sceneVideoDir, sceneVideoFile(n));

// Undo/redo for scene media (lib/media-history.mjs): every write to a scene's image, audio or
// motion video goes through trackMediaChange, which snapshots the file first and keeps the step
// only if the file really changed. /api/undo and /api/redo walk those snapshots.
//
// The scene image also carries a manifest entry (authenticity: AI vs USER_UPLOAD, characters), so
// each image step carries that entry as its meta to keep the tag correct after an undo/redo.
const MEDIA_KINDS = {
  image: { path: (n) => imagePathFor(n) },
  audio: { path: (n) => join(P.audioDir, audioFile(n)) },
  motion: { path: (n) => motionPathFor(n) },
};
const mediaPath = (kind, n) => MEDIA_KINDS[kind].path(n);
const mediaHistoryDir = (kind, n) => join(P.historyDir, kind, sceneBase(n));
const imageManifestEntry = (n) => {
  const manifest = existsSync(manifestPath()) ? JSON.parse(readFileSync(manifestPath(), 'utf8')) : [];
  return manifest.find((m) => m.id === sceneBase(n)) ?? null;
};
// An audio step carries the narration its mp3 was generated from, so undo/redo keeps the
// out-of-date check (audio-narration.mjs) matching the file that comes back.
const audioMeta = (n) => {
  const narration = readAudioNarration(P.audioDir, n);
  return narration === null ? null : { narration };
};
// The narration was edited (or merged) after this scene's audio was generated.
const sceneAudioStale = (n, narration) => existsSync(join(P.audioDir, audioFile(n))) && isAudioStale(P.audioDir, n, narration);
// A motion step carries the fingerprint of the image its clip was animated from (motion-source.mjs),
// so undo/redo keeps the out-of-date check matching the clip that comes back.
const motionMeta = (n) => {
  const source = readMotionSource(P.sceneVideoDir, n);
  return source === null ? null : { source };
};
// The scene's image was regenerated or replaced after its motion clip was made.
const sceneMotionStale = (n) => isMotionStale(P.sceneVideoDir, n, imagePathFor(n));
const mediaMeta = (kind, n) => (kind === 'image' ? imageManifestEntry(n) : kind === 'audio' ? audioMeta(n) : motionMeta(n));
const trackMediaChange = async (kind, n, write) => {
  const file = mediaPath(kind, n);
  const dir = mediaHistoryDir(kind, n);
  if (kind === 'image') adoptMotionSource(P.sceneVideoDir, n, imagePathFor(n));
  // A clip written now is animated from the image as it is now.
  const source = kind === 'motion' ? imageFingerprint(imagePathFor(n)) : null;
  const pending = beginChange(dir, file, mediaMeta(kind, n));
  try {
    return await write();
  } finally {
    if (settleChange(dir, file, pending)) afterMediaChange(kind, n, source);
  }
};
const afterMediaChange = (kind, n, source) => {
  if (kind === 'motion') {
    if (existsSync(motionPathFor(n))) writeMotionSource(P.sceneVideoDir, n, source);
    else clearMotionSource(P.sceneVideoDir, n);
  }
  // A new image retires the scene's clip from the render (parse-plan.mjs drops its motionVideo flag).
  if (kind === 'image' && existsSync(motionPathFor(n))) rebuildBundles();
};
const stepMedia = (step, kind, n) => {
  const restored = step(mediaHistoryDir(kind, n), mediaPath(kind, n), mediaMeta(kind, n));
  if (restored && kind === 'audio') {
    if (restored.meta) writeAudioNarration(P.audioDir, n, restored.meta.narration);
    else clearAudioNarration(P.audioDir, n);
  }
  if (restored && kind === 'motion') writeMotionSource(P.sceneVideoDir, n, restored.meta?.source ?? null);
  if (restored?.meta && kind === 'image') upsertManifest(restored.meta); // restore authenticity + characters
  return Boolean(restored);
};
const mediaHistory = (n) => Object.fromEntries(
  Object.keys(MEDIA_KINDS).map((kind) => [kind, historyCounts(mediaHistoryDir(kind, n), mediaPath(kind, n))]),
);

// Character profile.json (projects/<slug>/characters/<id>/profile.json). The context fields
// (country/period/dynasty/role) feed prompt-writer.mjs's culture/century pinning; display_name
// + aliases feed the gallery. The editable fields the review UI exposes:
const PROFILE_STRING_FIELDS = ['display_name', 'country', 'period', 'dynasty', 'role', 'interpretation'];
const PROFILE_LIST_FIELDS = ['aliases', 'known_facts', 'unknowns'];
const profileJsonPath = (id) => join(P.profilesDir, id, 'profile.json');
const readProfile = (id) => {
  const path = profileJsonPath(id);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
};
// Keep only known fields, trimmed; lists accept an array or a newline-separated string.
const normalizeProfilePatch = (patch) => {
  const out = {};
  for (const k of PROFILE_STRING_FIELDS) if (typeof patch[k] === 'string') out[k] = patch[k].trim();
  for (const k of PROFILE_LIST_FIELDS) {
    const v = patch[k];
    if (Array.isArray(v)) out[k] = v.map((x) => String(x).trim()).filter(Boolean);
    else if (typeof v === 'string') out[k] = v.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return out;
};

// Vietnamese prompt/template translations are authored up front (by the lsvn/trangca/history-video
// skills and the OpenAI prompt writer) and stored alongside each prompt, so the panel reads them
// straight from state — no runtime translation service.
// `fit`: 'crop' takes the centre square (uploads); 'pad' letterboxes the whole picture onto a
// light-grey square — AI drafts, which the dialog previews uncropped and a crop would behead.
const optimizeCharacterImage = (source, target, fit = 'crop') => {
  const square = fit === 'pad'
    ? 'scale=1024:1024:force_original_aspect_ratio=decrease:flags=lanczos,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=0xD8D8D8'
    : "crop='min(iw,ih)':'min(iw,ih)',scale=1024:1024:flags=lanczos";
  execFileSync('ffmpeg', [
    '-y', '-i', source,
    '-vf', square,
    '-frames:v', '1', '-q:v', '3', target,
  ], { stdio: 'pipe' });
};
// Make `sourceFile` character `id`'s reference: squared (see optimizeCharacterImage) and
// re-encoded to the plan's reference path as .jpg, repointing the plan when the old reference had
// another extension.
const setCharacterReference = (id, relPath, sourceFile, fit) => {
  const targetPath = relPath.replace(/\.[^.]+$/, '.jpg');
  mkdirSync(dirname(targetPath), { recursive: true });
  optimizeCharacterImage(sourceFile, targetPath, fit);
  if (targetPath !== relPath) writeCharacterPath(P.planMd, id, targetPath);
};
// The plan's reference path for character `id`, or null. Own keys only, so an id such as
// "constructor" never resolves to an Object.prototype member.
const planCharacterPath = (id) => {
  const { characters } = readPlan();
  return typeof id === 'string' && Object.hasOwn(characters, id) ? characters[id] : null;
};
// Characters of every project except the active one, newest first — "updated" is the later of
// the reference image and profile.json, so a freshly drawn or re-described character rises to the
// top. Rows whose reference file is missing are skipped (nothing to copy).
const characterLibrary = () => listProjects()
  .filter((slug) => slug !== P.slug)
  .flatMap((slug) => {
    const { title, characters, characterRows } = parsePlan(slug);
    const { profilesDir } = projectPaths(slug);
    return characterRows
      .filter((row) => existsSync(characters[row.id]))
      .map((row) => {
        const profile = join(profilesDir, row.id, 'profile.json');
        const updatedAt = Math.max(
          statSync(characters[row.id]).mtimeMs,
          existsSync(profile) ? statSync(profile).mtimeMs : 0,
        );
        return {
          project: slug, projectTitle: title, id: row.id, name: row.name, aliases: row.aliases,
          imageUrl: `/library-characters/${slug}/${encodeURIComponent(basename(characters[row.id]))}`,
          updatedAt,
        };
      });
  })
  .sort((a, b) => b.updatedAt - a.updatedAt);

// Put `sourceFile` in place as character `id`'s reference and return its plan path. A new
// character gets its image first and its plan line second, so a failed copy never leaves a plan
// entry pointing at nothing. Replacing keeps the id (every scene's `char:` still points at it) and
// drops the old puppet v2 render, which shows the previous person.
const placeImportedReference = (id, sourceFile, replace) => {
  if (!replace) {
    const relPath = characterRefPath(P.staticPrefix, id);
    mkdirSync(dirname(relPath), { recursive: true });
    optimizeCharacterImage(sourceFile, relPath);
    addCharacterToPlan(P.planMd, P.staticPrefix, id);
    return relPath;
  }
  const oldPath = planCharacterPath(id);
  setCharacterReference(id, oldPath, sourceFile);
  const relPath = oldPath.replace(/\.[^.]+$/, '.jpg');
  for (const base of new Set([basename(oldPath), basename(relPath)])) {
    const puppet = join(P.charV2Dir, base);
    if (existsSync(puppet)) unlinkSync(puppet);
  }
  return relPath;
};

// Copy another project's character into the active one as `id` — a new character, or (replace)
// an existing one. The profile keeps every authored field (appearance, facts, …); only its
// identity fields are rewritten for the id/name.
const importCharacter = ({ project, sourceId, id, name, replace }) => {
  const source = parsePlan(project).characters;
  if (!Object.hasOwn(source, sourceId) || !existsSync(source[sourceId])) {
    throw new Error(`character "${sourceId}" has no reference image in project "${project}"`);
  }
  const relPath = placeImportedReference(id, source[sourceId], replace);
  const sourceProfile = join(projectPaths(project).profilesDir, sourceId, 'profile.json');
  let profile = {};
  if (existsSync(sourceProfile)) {
    try { profile = JSON.parse(readFileSync(sourceProfile, 'utf8')); } catch { profile = {}; }
  }
  mkdirSync(join(P.profilesDir, id), { recursive: true });
  writeFileSync(profileJsonPath(id), `${JSON.stringify({
    ...profile, character_id: id, name, display_name: name, reference: relPath,
  }, null, 2)}\n`);
};

// A generated character image waits here as a draft until applied, beside the source image a
// redraw starts from. Served through /characters/_drafts/.
const charDraftDir = () => join(P.charDir, '_drafts');
const charDraftPath = (id) => join(charDraftDir(), `${id}.jpg`);
const charSourcePath = (id) => join(charDraftDir(), `${id}-source.jpg`);
const charDraftUrl = (path) => `/characters/_drafts/${basename(path)}?v=${statSync(path).mtimeMs}`;
// A redraw's source image, shrunk to at most 1536 px on its long edge as JPEG: providers take it
// inline as base64, and a 15 MB phone photo would stall the upload or exceed their body limits.
const optimizeSourceImage = (source, target) => {
  execFileSync('ffmpeg', [
    '-y', '-i', source,
    '-vf', "scale='min(1536,iw)':'min(1536,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos",
    '-frames:v', '1', '-q:v', '3', target,
  ], { stdio: 'pipe' });
};
// Parse the active project's scene-plan.md on every read, so an edit made outside the panel
// (IDE, a skill, another script) is never shadowed by a stale copy.
const readPlan = () => parsePlan(P.slug);

// Which scenes use a user-uploaded photo vs an AI reconstruction, read from the manifest
// (the single source of truth for authenticity). Returns { [scene]: authenticity }.
const readAuthenticity = () => {
  if (!existsSync(manifestPath())) return {};
  const rows = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  return Object.fromEntries(rows.map((r) => [r.scene, r.authenticity]));
};

// Rebuild the active project's Remotion bundle (src/projects-data) so newly generated audio,
// motion clips, or a switched/created project show up in the studio without a manual
// build-remotion run. Only the active project is rebuilt — the other bundles on disk stay in the
// index untouched, so a rebuild costs seconds instead of re-measuring every project.
// SSE callers pass `send` so the browser sees the rebuild step. Always resolves — a rebuild
// failure is surfaced as a log line, never as a failure of the job or API call that asked for it.
// Rebuilds are chained, never concurrent: two jobs finishing close together (e.g. an audio batch
// and a motion clip) would otherwise run build-remotion.mjs at once and race on the same files.
let rebuildChain = Promise.resolve();
const rebuildBundles = (send = () => {}, slug = P.slug) => {
  rebuildChain = rebuildChain.then(() => new Promise((resolve) => {
    send('log', '▶ Rebuilding Remotion data (src/projects-data)...');
    const child = spawn('node', [join(HERE, 'build-remotion.mjs'), '--project', slug], { cwd: process.cwd() });
    const pipe = (stream) => stream.on('data', (b) => b.toString().split('\n').filter(Boolean).forEach((line) => send('log', line)));
    pipe(child.stdout);
    pipe(child.stderr);
    child.on('close', () => resolve());
    child.on('error', (e) => { send('log', `✗ build-remotion: ${e.message}`); resolve(); });
  }));
  return rebuildChain;
};

// Generation jobs still running server-side. A job outlives its browser connection (a reload
// does not cancel it), and every job writes through the active project's
// paths — so a project switch while this is non-zero would land its files in the wrong project.
let activeJobs = 0;
// Running jobs by id: the panel tags each streamed request with X-Job-Id (plus X-Job-Label,
// X-Job-Kind and X-Job-Scenes), so it can cancel the job through /api/cancel and, after a reload,
// find it again via /api/jobs and keep its unfinished scenes locked.
const jobs = new Map();
const jobByRes = new WeakMap();
// A cancel can reach the server before the request it targets; remembered until that job starts.
const earlyCancels = new Set();
const jobFor = (res) => {
  let job = jobByRes.get(res);
  if (job) return job;
  const header = (name) => (typeof res.req.headers[name] === 'string' ? res.req.headers[name] : '');
  const id = header('x-job-id') || randomUUID();
  let label = res.req.url;
  try { label = decodeURIComponent(header('x-job-label')) || label; } catch { /* keep the url */ }
  const scenes = header('x-job-scenes').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
  job = {
    id, label, kind: header('x-job-kind'), scenes, done: new Set(), lastLog: '',
    startedAt: Date.now(), controller: new AbortController(),
  };
  if (earlyCancels.delete(id)) job.controller.abort();
  jobs.set(id, job);
  jobByRes.set(res, job);
  return job;
};
const trackJob = async (res, work) => {
  activeJobs++;
  const job = jobFor(res);
  try { await work(); } finally { activeJobs--; jobs.delete(job.id); }
};
const JOBS_RUNNING_ERROR = 'Đang có job chạy trên server — chờ xong rồi đổi project.';

// Normalize a bulk-import row's `char` value → the comma id string scene-plan.md expects.
// Accepts an id, comma ids, an array of ids, "both"/"all" (every project character), or
// "none"/"" (no character → text-to-image). Returns { skip } when the row omitted char (leave the
// scene's current char untouched), { ids } on success, or { error } on an unknown id/type.
const normalizeImportChar = (value, charIds) => {
  if (value === undefined || value === null) return { skip: true };
  let ids;
  if (Array.isArray(value)) ids = value.map((v) => String(v).trim()).filter(Boolean);
  else if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === '' || v === 'none') ids = [];
    else if (v === 'both' || v === 'all') ids = [...charIds];
    else ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  } else return { error: 'char must be a string or an array of character ids' };
  const unknown = ids.filter((id) => !charIds.includes(id));
  if (unknown.length) return { error: `unknown character id(s): ${unknown.join(', ')} — valid: ${charIds.join(', ') || '(none defined)'}` };
  return { ids };
};

// Build the per-scene view the panel renders: prompt, char refs, image kind, whether the
// image/audio exist yet (with an mtime cache-buster so a regenerated file reloads).
const buildState = () => {
  const { characters, scenes } = readPlan();
  const authenticity = readAuthenticity();
  const planRaw = existsSync(P.planMd) ? readFileSync(P.planMd, 'utf8') : '';
  const title = planRaw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Scenes';

  const sceneCharMap = new Map();
  for (const s of scenes) for (const id of s.image.characters ?? []) {
    sceneCharMap.set(id, [...(sceneCharMap.get(id) ?? []), s.scene]);
  }
  const charactersData = parsePlan(P.slug).characterRows;
  const characterList = charactersData.map((c) => {
    const refBase = c.image.split('/').pop();
    const refPath = join(P.charDir, refBase);
    const refUrl = existsSync(refPath) ? `/characters/${refBase}?v=${statSync(refPath).mtimeMs}` : null;
    let puppetUrl = null;
    if (c.imageV2 !== c.image) {
      const puppetBase = c.imageV2.split('/').pop();
      const puppetPath = join(P.charV2Dir, puppetBase);
      if (existsSync(puppetPath)) puppetUrl = `/characters/v2/${puppetBase}?v=${statSync(puppetPath).mtimeMs}`;
    }
    return { id: c.id, name: c.name, refUrl, puppetUrl, scenes: sceneCharMap.get(c.id) ?? [] };
  });

  const templates = getTemplates();
  return {
    title,
    project: { slug: P.slug, title, aspect: activeAspect(), template: templates.activeVersion, templateVersions: listTemplateVersions(), voice: readPlanHeader(planRaw, 'voice') ?? DEFAULT_VOICE },
    // Corner logo + watermark, so the timeline preview shows what the render will draw.
    branding: readBranding(P.slug),
    imageModels: pickerModels('image', IMAGE_MODELS),
    motionVideoModels: pickerModels('motion', MOTION_VIDEO_MODELS),
    seedreamPromptLimit: SEEDREAM_PROMPT_LIMIT,
    projects: listProjects().map((slug) => ({ slug, title: projectTitle(slug) })),
    scenes: scenes.map((s) => {
      const file = sceneFile(s.scene);
      const path = join(P.imageDir, file);
      const has = existsSync(path);
      const apath = join(P.audioDir, audioFile(s.scene));
      const hasAudio = existsSync(apath);
      const motionPath = join(P.sceneVideoDir, sceneVideoFile(s.scene));
      const hasMotionVideo = existsSync(motionPath);
      // uploaded photo, AI reconstruction, or a sourced search image — drives the AI tag.
      const source = authenticity[s.scene] === 'USER_UPLOAD' ? 'upload' : s.image.kind;
      // Full prompt length (template + style + scene prompt) the image API would receive, and the
      // fixed template overhead (full − scene prompt) so the panel can count live as the user types.
      const isAi = s.image.kind === 'ai';
      const promptFullChars = isAi ? assemblePrompt(s, templates).length : 0;
      const promptOverhead = isAi ? promptFullChars - (s.image.prompt?.length ?? 0) : 0;
      return {
        scene: s.scene,
        narration: s.narration ?? '',
        title: s.title ?? '',
        cue: s.cue ?? '',
        host: s.host ?? '',
        kind: s.image.kind,
        source,
        prompt: s.image.prompt ?? '',
        promptVi: s.image.promptVi ?? '',
        beat: s.beat ?? '',
        // The full prompt a motion video would be sent with (see sceneMotionPrompt).
        motionPrompt: sceneMotionPrompt(s),
        camera: s.image.motionParts?.camera ?? '',
        action: s.image.motionParts?.action ?? '',
        env: s.image.motionParts?.env ?? '',
        cameraVi: s.image.motionParts?.cameraVi ?? '',
        actionVi: s.image.motionParts?.actionVi ?? '',
        envVi: s.image.motionParts?.envVi ?? '',
        // Older single-line `motion:` (empty when the scene has none), still sent when the three
        // parts above are empty.
        motion: s.image.motion ?? '',
        motionVi: s.image.motionVi ?? '',
        query: s.image.query ?? '',
        characters: s.image.characters ?? [],
        hasImage: has,
        imageUrl: has ? `/images/${file}?v=${statSync(path).mtimeMs}` : null,
        hasAudio,
        audioStale: sceneAudioStale(s.scene, s.narration ?? ''),
        audioUrl: hasAudio ? `/audio/${audioFile(s.scene)}?v=${statSync(apath).mtimeMs}` : null,
        hasMotionVideo,
        motionStale: hasMotionVideo && sceneMotionStale(s.scene),
        motionVideoUrl: hasMotionVideo ? `/motion-video/${sceneVideoFile(s.scene)}?v=${statSync(motionPath).mtimeMs}` : null,
        history: mediaHistory(s.scene),
        promptFullChars,
        promptOverhead,
      };
    }),
    characters,
    characterList,
  };
};

// --- tiny http helpers ---------------------------------------------------------------------
const sendJson = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
};
// Audio/video with HTTP Range support: without it Chrome cannot seek a media element (setting
// currentTime snaps back to 0), and the timeline preview seeks into every clip.
const sendMedia = (req, res, path, type) => {
  const size = statSync(path).size;
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!range || (!range[1] && !range[2])) {
    res.writeHead(200, { ...headers, 'Content-Length': size });
    createReadStream(path).pipe(res);
    return;
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
    return;
  }
  res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  createReadStream(path, { start, end }).pipe(res);
};
const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
});
const MAX_IMAGE_UPLOAD = 15 * 1024 * 1024;
const MAX_VIDEO_UPLOAD = 500 * 1024 * 1024;
const readRawBody = (req, maxBytes, tooLargeMessage) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > maxBytes) { reject(new Error(tooLargeMessage)); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
// Detect image type from magic bytes so a mislabelled or non-image upload is rejected.
const isSupportedImage = (buf) => {
  if (buf.length < 12) return false;
  const hex = buf.subarray(0, 4).toString('hex');
  if (hex.startsWith('ffd8ff')) return true; // JPEG
  if (hex === '89504e47') return true; // PNG
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return true; // WebP
  return false;
};
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
// Everything the composition can reach through staticFile(); media goes out with Range support.
const PUBLIC_MIME = { ...MIME, svg: 'image/svg+xml', mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav' };
const PUBLIC_DIR = 'public';
const execFileAsync = promisify(execFile);
// Validate an uploaded scene video against the active project's aspect: orientation must match
// (portrait for 9:16, landscape for 16:9) and the long edge must be at least 1280px.
const probeSceneVideo = (path) => {
  const [width, height] = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      path,
    ],
    { encoding: 'utf8' },
  ).trim().split(',').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Video has no readable video stream.');
  }
  const info = aspectInfo(activeAspect());
  const wantLandscape = info.orientation === 'horizontal';
  if (info.orientation !== 'square' && wantLandscape !== width > height) {
    throw new Error(`This project is ${info.ratio} (${info.orientation}). Received ${width}x${height}.`);
  }
  if (Math.max(width, height) < 1280 || Math.min(width, height) < 720) {
    throw new Error(`Use a ${info.ratio} video at least 1280 on the long edge. Received ${width}x${height}.`);
  }
  return { width, height };
};

// Aborts only on an explicit POST /api/cancel for this response's job — never when the browser
// drops the stream, so a page reload leaves the job running to finish and write its result.
const cancelSignal = (res) => jobFor(res).controller.signal;

// Run generate-narration.mjs (optionally for specific scene numbers) and stream its log to the
// browser as SSE. Shared by "generate one scene" and "approve → all scenes". Resolves once the
// child has exited (and the bundle is rebuilt), so trackJob counts the whole run.
const streamNarration = (res, args, startMsg) => new Promise((resolve) => {
  sseHead(res);
  const send = (event, data) => sseSend(res, event, data);
  send('log', startMsg);
  // The script rewrites scene audio in place, so snapshot the scenes it may touch first (no args =
  // every scene) and keep only the steps whose file actually changed.
  const scenes = args.length ? args.map(Number) : readPlan().scenes.map((s) => s.scene);
  const pendingChanges = scenes.map((n) => [n, beginChange(mediaHistoryDir('audio', n), mediaPath('audio', n), audioMeta(n))]);
  const child = spawn('node', [join(HERE, 'generate-narration.mjs'), ...args], { cwd: process.cwd() });
  const pipe = (stream) => stream.on('data', (b) => b.toString().split('\n').filter(Boolean).forEach((line) => send('log', line)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('close', async (code) => {
    for (const [n, pending] of pendingChanges) settleChange(mediaHistoryDir('audio', n), mediaPath('audio', n), pending);
    if (code !== 0) { send('error', `Exited with code ${code}`); res.end(); resolve(); return; }
    await rebuildBundles(send); // new audio → refresh hasAudio/durations/captions in the bundle
    send('done', 'Audio generation finished.');
    res.end();
    resolve();
  });
  cancelSignal(res).addEventListener('abort', () => { if (!child.killed) child.kill(); });
});

// --- shared SSE helpers --------------------------------------------------------------------
const sseHead = (res) => res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
// A scene's end line in a job log ("✓/✗/• scene N", "✓ scene-NN.mp3") — the same lines the
// panel's trackSceneProgress reads; kept per job so /api/jobs reports which scenes are finished.
const SCENE_END_LINE = /^[✓✗•] scene[- ](\d+)/;
// A job outlives a dropped stream, so writes after the browser left are skipped, not errors.
const sseSend = (res, event, data) => {
  const job = event === 'log' ? jobByRes.get(res) : null;
  if (job) {
    job.lastLog = String(data);
    const end = SCENE_END_LINE.exec(job.lastLog);
    if (end) job.done.add(Number(end[1]));
  }
  if (res.destroyed || res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

// Run generate-puppet-references.mjs (optionally for one character id) and stream its log.
// Resolves once the child has exited.
const streamPuppets = (res, args, startMsg) => new Promise((resolve) => {
  sseHead(res);
  sseSend(res, 'log', startMsg);
  const child = spawn('node', [join(HERE, 'generate-puppet-references.mjs'), ...args], { cwd: process.cwd() });
  const pipe = (stream) => stream.on('data', (b) => b.toString().split('\n').filter(Boolean).forEach((line) => sseSend(res, 'log', line)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('close', (code) => { sseSend(res, code === 0 ? 'done' : 'error', code === 0 ? 'Puppet reference(s) generated.' : `Exited with code ${code}`); res.end(); resolve(); });
  cancelSignal(res).addEventListener('abort', () => { if (!child.killed) child.kill(); });
});

// Run shell steps in order, streaming each step's log; stop at the first non-zero exit.
// Resolves once the last step (or the aborted one) has exited.
const runSteps = (res, steps, doneMsg) => {
  sseHead(res);
  let current = null;
  const signal = cancelSignal(res);
  signal.addEventListener('abort', () => { if (current && !current.killed) current.kill(); });
  return (async () => {
    for (const step of steps) {
      if (signal.aborted) return;
      sseSend(res, 'log', `▶ ${step.label}`);
      const code = await new Promise((resolve) => {
        current = spawn(step.cmd, step.args, { cwd: process.cwd() });
        const pipe = (stream) => stream.on('data', (b) => b.toString().split('\n').filter(Boolean).forEach((line) => sseSend(res, 'log', line)));
        pipe(current.stdout);
        pipe(current.stderr);
        current.on('close', resolve);
        current.on('error', (e) => { sseSend(res, 'log', `✗ ${e.message}`); resolve(1); });
      });
      if (code !== 0) { sseSend(res, 'error', `${step.label} failed (exit ${code})`); res.end(); return; }
    }
    sseSend(res, 'done', doneMsg ?? 'Finished.');
    res.end();
  })();
};

// Generate images for several AI scenes in turn (in-process, not a subprocess). One reference
// image per frame, so scenes run sequentially; a failure on one does not abort the rest. A cancel
// stops the scene in flight too (its provider call is cancelled and its image never written).
const generateImagesBatch = async (res, sceneNos, model) => {
  sseHead(res);
  const signal = cancelSignal(res);
  const plan = readPlan();
  let ok = 0;
  let attempted = 0;
  for (const n of sceneNos) {
    if (signal.aborted) return;
    const target = plan.scenes.find((s) => s.scene === n);
    if (!target) { sseSend(res, 'log', `✗ scene ${n} not found`); continue; }
    if (target.image.kind !== 'ai') { sseSend(res, 'log', `• scene ${n} is a search scene — skipped`); continue; }
    if (!target.image.prompt) { sseSend(res, 'log', `✗ scene ${n} has no prompt — skipped`); continue; }
    attempted++;
    sseSend(res, 'log', `▶ generating scene ${n}...`);
    try {
      const { via } = await trackMediaChange('image', n, () => generateSceneImage(target, plan.characters, { model, signal, onLog: (line) => sseSend(res, 'log', `  ${line}`) }));
      ok++;
      sseSend(res, 'log', `✓ scene ${n} (${via}) — ${ok}/${sceneNos.length} ảnh thành công`);
    } catch (e) {
      if (signal.aborted) { console.log(`[image batch] cancelled at scene ${n}`); return; }
      sseSend(res, 'log', `✗ scene ${n}: ${e.message}`);
    }
  }
  sseSend(res, ok === attempted ? 'done' : 'error', `Generated ${ok}/${attempted} scene image(s).`);
  res.end();
};

// Generate selected motion videos sequentially. Every prediction is paid, so never parallelize
// this batch; a failed scene does not stop others. A cancel stops the scene in flight too (its
// provider call is cancelled and its clip never written); clips finished before it are kept.
const generateMotionVideosBatch = async (res, sceneNos, model) => {
  sseHead(res);
  const signal = cancelSignal(res);
  const plan = readPlan();
  let ok = 0;
  let attempted = 0;
  for (const n of sceneNos) {
    if (signal.aborted) break;
    const target = plan.scenes.find((s) => s.scene === n);
    if (!target) { sseSend(res, 'log', `✗ scene ${n} not found`); continue; }
    const imagePath = join(P.imageDir, sceneFile(n));
    const audioPath = join(P.audioDir, audioFile(n));
    if (!existsSync(imagePath) || !existsSync(audioPath)) {
      sseSend(res, 'log', `• scene ${n} skipped: image and audio are required`);
      continue;
    }
    attempted++;
    try {
      const audioSeconds = Number(execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', audioPath],
        { encoding: 'utf8' },
      ).trim());
      if (!Number.isFinite(audioSeconds)) throw new Error('could not read audio duration');
      sseSend(res, 'log', `▶ generating motion video for scene ${n} (${model})...`);
      await trackMediaChange('motion', n, () => generateSceneVideo({
        scene: n,
        imagePath,
        outputDir: P.sceneVideoDir,
        prompt: sceneMotionPrompt(target, undefined, model),
        model,
        audioSeconds,
        aspect: activeAspect(),
        signal,
        onLog: (line) => sseSend(res, 'log', `  ${line}`),
      }));
      ok++;
      sseSend(res, 'log', `✓ scene ${n} motion video ready — ${ok}/${sceneNos.length} video thành công`);
    } catch (e) {
      if (signal.aborted) { console.log(`[motion batch] cancelled at scene ${n}`); break; }
      sseSend(res, 'log', `✗ scene ${n}: ${e.message}`);
    }
  }
  if (ok) await rebuildBundles((event, data) => sseSend(res, event, data));
  sseSend(res, ok === attempted ? 'done' : 'error', `Generated ${ok}/${attempted} motion video(s).`);
  res.end();
};

// Write prompts for several AI scenes in turn via OpenAI (scripts/lib/prompt-writer.mjs). One
// LLM call per scene, sequential; a failure on one does not abort the rest.
const generatePromptsBatch = async (res, sceneNos) => {
  sseHead(res);
  const signal = cancelSignal(res);
  const plan = readPlan();
  let ok = 0;
  let attempted = 0;
  for (const n of sceneNos) {
    if (signal.aborted) break;
    const target = plan.scenes.find((s) => s.scene === n);
    if (!target) { sseSend(res, 'log', `✗ scene ${n} not found`); continue; }
    if (target.image.kind !== 'ai') { sseSend(res, 'log', `• scene ${n} is a search scene — skipped`); continue; }
    if (!target.narration) { sseSend(res, 'log', `✗ scene ${n} has no narration — skipped`); continue; }
    attempted++;
    sseSend(res, 'log', `▶ writing prompt for scene ${n}...`);
    try {
      const characters = buildCharacterContext(target.image.characters, P.profilesDir);
      const gi = plan.scenes.findIndex((s) => s.scene === n);
      const context = { prev: plan.scenes[gi - 1]?.narration, next: plan.scenes[gi + 1]?.narration };
      const { text, vi } = await generateScenePrompt({ narration: target.narration, characters, identity: target.image.identity, context });
      writeSceneField(P.planMd, n, 'prompt', text);
      writeSceneField(P.planMd, n, 'prompt_vi', vi);
      ok++;
      sseSend(res, 'log', `✓ scene ${n}: ${text.slice(0, 90)}${text.length > 90 ? '…' : ''}`);
    } catch (e) { sseSend(res, 'log', `✗ scene ${n}: ${e.message}`); }
  }
  sseSend(res, ok === attempted ? 'done' : 'error', `Wrote ${ok}/${attempted} prompt(s).`);
  res.end();
};

// The motion writer's view of one scene: its English beat — or, for plans written before beats
// were stored, its image prompt — plus mood and on-screen cast names (left to right).
const motionBeat = (s) => s.beat || s.image?.prompt || '';
const motionInput = (s) => ({
  scene: s.scene,
  beat: motionBeat(s),
  cue: s.cue ?? '',
  names: buildCharacterContext(s.image.characters, P.profilesDir).map((c) => c.name),
});

// Write camera / action / env for several scenes (scripts/lib/motion-writer.mjs), in batches.
// Every other scene's beat goes along for continuity, cut short when it is a stand-in image prompt.
const generateMotionPromptsBatch = async (res, sceneNos) => {
  sseHead(res);
  const signal = cancelSignal(res);
  const log = (line) => sseSend(res, 'log', line);
  const plan = readPlan();
  const targets = [];
  for (const n of sceneNos) {
    const s = plan.scenes.find((x) => x.scene === n);
    if (!s) log(`✗ scene ${n} not found`);
    else if (s.image.kind !== 'ai') log(`• scene ${n} is a search scene — skipped`);
    else if (!motionBeat(s)) log(`✗ scene ${n}: chưa có beat hay prompt ảnh — skipped`);
    else targets.push(motionInput(s));
  }
  const withoutBeat = targets.filter((t) => !plan.scenes.find((x) => x.scene === t.scene).beat).map((t) => t.scene);
  if (withoutBeat.length) log(`• scene ${withoutBeat.join(', ')} chưa có beat → dùng prompt ảnh làm mô tả cảnh`);
  try {
    const outline = plan.scenes
      .filter((s) => motionBeat(s))
      .map((s) => ({ scene: s.scene, beat: s.beat || s.image.prompt.slice(0, 200) }));
    const rows = targets.length ? await writeMotionsBatched({ context: { outline }, scenes: targets, signal, onLog: log }) : new Map();
    for (const [n, row] of rows) { writeMotionParts(P.planMd, n, row); log(`✓ scene ${n} motion đã viết`); }
    for (const t of targets) if (!rows.has(t.scene)) log(`✗ scene ${t.scene}: LLM không trả về motion`);
    sseSend(res, rows.size && rows.size === targets.length ? 'done' : 'error', `Đã viết motion ${rows.size}/${targets.length} scene.`);
  } catch (e) {
    sseSend(res, 'error', e.message);
  }
  res.end();
};

// Switch the active project: persist it, point every path at it, and rebuild the
// Remotion bundles so the Studio shows this project (measured durations + captions when its audio
// is complete). Never triggers TTS itself (OmniVoice may not be running).
const activateProject = async (slug) => {
  setActiveSlug(slug);
  P = projectPaths(slug);
  setImageProjectPaths(P);
  await rebuildBundles();
};

// A new project's scene-plan.md: a pasted plan (e.g. the lsvn / trangca skill output) or, when
// none is given, the blank template. `<slug>` placeholders become the slug; the title replaces
// the heading when given. Returns { text } or { error }.
const buildNewPlan = ({ slug, title, plan }) => {
  const heading = typeof title === 'string' ? title.trim() : '';
  const pasted = typeof plan === 'string' ? plan.trim() : '';
  if (pasted && !/^##\s+scene\s+\d+/im.test(pasted)) return { error: 'scene-plan dán vào không có khối "## scene N"' };
  if (!pasted && !existsSync(TEMPLATE_MD)) return { error: `template missing at ${TEMPLATE_MD}` };
  const base = (pasted || readFileSync(TEMPLATE_MD, 'utf8')).replaceAll('<slug>', slug);
  const hasHeading = /^#\s+.*$/m.test(base);
  if (!hasHeading) return { text: `# ${heading || slug}\n\n${base}\n` };
  return { text: heading || !pasted ? base.replace(/^#\s+.*$/m, `# ${heading || slug}`) : base };
};

// Checks shared by both ways to start a project (blank/pasted plan, AI writer), run before any
// work so a bad slug never costs an LLM run. `slug` may be absent: the AI writer derives one.
// Returns an error message or null.
const newProjectError = ({ slug, aspect, template, voice }) => {
  if (slug !== undefined && !isValidSlug(slug)) return 'slug must be lowercase letters, numbers and hyphens';
  if (slug !== undefined && existsSync(projectPaths(slug).planMd)) return `project "${slug}" already exists`;
  if (aspect !== undefined && !Object.hasOwn(ASPECTS, aspect)) return `tỉ lệ khung phải là ${Object.keys(ASPECTS).join(', ')}`;
  if (template !== undefined && !listTemplateVersions().includes(template)) return `không có style version "${template}"`;
  if (voice !== undefined && !isValidVoiceName(voice)) return `tên giọng đọc không hợp lệ: "${voice}"`;
  return null;
};

// Write a checked new project: its folders, then its scene-plan.md (see buildNewPlan) with the
// header lines. The plan is written last and lands in one rename: listProjects() keys on
// scene-plan.md, so a project only appears once it is complete. Throws when the plan is unusable.
const writeNewProject = ({ slug, title, aspect, template, voice, plan }) => {
  const target = projectPaths(slug);
  const content = buildNewPlan({ slug, title, plan });
  if (content.error) throw new Error(content.error);
  ensureProjectDirs(target);
  const draft = `${target.planMd}.tmp`;
  writeFileSync(draft, content.text);
  if (aspect) writePlanHeader(draft, 'aspect', aspect);
  if (template) writePlanHeader(draft, 'template', template);
  if (voice) writePlanHeader(draft, 'voice', voice);
  renameSync(draft, target.planMd);
  return target;
};

// ---- YouTube thumbnail (review-thumbnail.js) ---------------------------------------------
const THUMB_BACKGROUND_RE = /^ai-\d+\.jpg$/;

const thumbnailBackgrounds = () => (existsSync(P.thumbnailDir) ? readdirSync(P.thumbnailDir) : [])
  .filter((file) => THUMB_BACKGROUND_RE.test(file))
  .sort()
  .reverse()
  .map((file) => ({ file, url: `/public/${P.staticPrefix}/thumbnail/${file}` }));

// The cast ids the panel sent → { name, refPath } for each that has a reference image.
const thumbnailCast = (ids) => {
  const rows = readPlan().characterRows;
  return (Array.isArray(ids) ? ids : [])
    .map((id) => rows.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({ name: c.name, refPath: join(P.charDir, basename(c.image)) }))
    .filter((c) => existsSync(c.refPath));
};

const generateThumbnail = async (res, { model, prompt, chars, side }) => {
  sseHead(res);
  const signal = cancelSignal(res);
  const file = `ai-${Date.now()}.jpg`;
  try {
    mkdirSync(P.thumbnailDir, { recursive: true });
    await generateThumbnailBackground({
      prompt, cast: thumbnailCast(chars), side, model, outPath: join(P.thumbnailDir, file), signal,
      onLog: (line) => sseSend(res, 'log', line),
    });
    sseSend(res, 'done', { file, url: `/public/${P.staticPrefix}/thumbnail/${file}` });
  } catch (error) {
    if (!signal.aborted) sseSend(res, 'error', error.message);
  }
  res.end();
};

// ---- AI script writer (POST /api/script-generate) ----------------------------------------
const MAX_SCRIPT_REQUEST = 4000;

// A /api/script-generate body → the checked input, or { error }.
const scriptRequestInput = (body) => {
  const request = typeof body.request === 'string' ? body.request.trim() : '';
  if (!request) return { error: 'Nhập yêu cầu video.' };
  if (request.length > MAX_SCRIPT_REQUEST) return { error: `Yêu cầu dài quá ${MAX_SCRIPT_REQUEST} ký tự.` };
  const sceneCount = Number(body.sceneCount);
  if (!Number.isInteger(sceneCount) || sceneCount < SCENE_COUNT_MIN || sceneCount > SCENE_COUNT_MAX) {
    return { error: `Số scene phải từ ${SCENE_COUNT_MIN} đến ${SCENE_COUNT_MAX}.` };
  }
  // One line each: the title becomes the plan's `# heading`, where a newline would start a block.
  const optional = (value) => (typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : undefined);
  const input = {
    request, sceneCount,
    slug: optional(body.slug), title: optional(body.title),
    aspect: optional(body.aspect), template: optional(body.template), voice: optional(body.voice),
  };
  const error = newProjectError(input);
  return error ? { error } : input;
};

// The writer's slug, made free of existing projects: "x", then "x-2", "x-3"…
const freeSlug = (base) => {
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!existsSync(projectPaths(slug).planMd)) return slug;
  }
};

// profile.json for a character the writer cast, in the hand-written profiles' shape. The drawing
// description goes to `interpretation`, which the character-image dialog starts from.
const castProfile = (c, reference) => ({
  character_id: c.id, name: c.name, display_name: c.display_name, aliases: c.aliases,
  country: c.country, period: c.period, dynasty: c.dynasty, role: c.role,
  known_facts: c.known_facts, interpretation: c.appearance, unknowns: [], reference,
});

// Write the whole video with the LLM, then make it a new active project. Nothing touches disk
// until the script is complete, and the profiles go in before the plan that makes the project
// exist (writeNewProject), so a cancel or a failure leaves no half-made project in the list. The
// write itself is not cancelled — the panel resyncs from /api/state after any unfinished run.
// Runs as a tracked job, so `activeJobs` is at least 1 here; any more means another client
// started a job meanwhile, and switching projects under it would land its files in this one.
const generateScriptProject = async (res, input) => {
  sseHead(res);
  const signal = cancelSignal(res);
  const log = (line) => sseSend(res, 'log', line);
  try {
    const { story, visuals, motions } = await writeVideo({
      request: input.request, sceneCount: input.sceneCount, signal, onLog: log,
      onProgress: (progress) => sseSend(res, 'progress', progress),
    });
    // Checked again now: the minutes the LLM took are long enough for the slug to be taken.
    const slug = freeSlug(input.slug ?? story.slug);
    if (input.slug && slug !== input.slug) log(`• Slug "${input.slug}" vừa có dự án khác dùng — đặt là "${slug}"`);
    const target = projectPaths(slug);
    const refPath = (id) => join(target.charDir, `${id}.jpg`);
    const plan = renderScenePlan({
      title: story.title,
      characters: Object.fromEntries(story.characters.map((c) => [c.id, refPath(c.id)])),
      scenes: story.scenes.map((s) => ({
        scene: s.scene, cue: s.cue, char: s.chars.join(', '), narration: s.narration, beat: s.visual,
        ...visuals.get(s.scene), // prompt, prompt_vi — absent when its batch failed
        ...motions.get(s.scene), // camera, action, env + their _vi — absent when its batch failed
      })),
    });
    signal.throwIfAborted();
    sseSend(res, 'progress', { phase: 'create' });
    log(`▶ Tạo dự án ${slug}…`);
    for (const c of story.characters) {
      mkdirSync(join(target.profilesDir, c.id), { recursive: true });
      writeFileSync(join(target.profilesDir, c.id, 'profile.json'), `${JSON.stringify(castProfile(c, refPath(c.id)), null, 2)}\n`);
    }
    writeNewProject({ ...input, slug, plan });
    const activated = activeJobs === 1;
    if (activated) await activateProject(slug);
    else log(`• Đang có job khác chạy — chưa mở "${slug}"; chọn nó ở danh sách dự án khi job xong`);
    sseSend(res, 'done', {
      slug,
      activated,
      scenes: story.scenes.length,
      characters: story.characters.length,
      missingPrompts: story.scenes.filter((s) => !visuals.has(s.scene)).map((s) => s.scene),
    });
  } catch (error) {
    if (!signal.aborted) sseSend(res, 'error', error.message);
  }
  res.end();
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(readFileSync(PANEL));
      return;
    }

    if (req.method === 'GET' && PANEL_ASSETS[pathname]) {
      const [file, type] = PANEL_ASSETS[pathname];
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(readFileSync(join(HERE, file)));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/state') {
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/notifications') {
      sendJson(res, 200, { items: readNotifications(P.notificationsFile) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/notifications') {
      const notification = sanitizeNotification(await readBody(req));
      if (!notification) { sendJson(res, 400, { error: 'notification needs an id and a message' }); return; }
      sendJson(res, 200, { items: appendNotification(P.notificationsFile, notification) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/notifications-clear') {
      clearNotifications(P.notificationsFile);
      sendJson(res, 200, { items: [] });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/jobs') {
      const list = [...jobs.values()].map(({ id, label, kind, scenes, done, lastLog, startedAt }) => ({
        id, label, kind, scenes, done: [...done], lastLog, startedAt,
      }));
      sendJson(res, 200, { jobs: list });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/cancel') {
      const { id } = await readBody(req);
      if (typeof id !== 'string' || !id) { sendJson(res, 400, { error: 'id required' }); return; }
      const job = jobs.get(id);
      if (job) job.controller.abort();
      else earlyCancels.add(id);
      sendJson(res, 200, { ok: true, found: Boolean(job) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/services') {
      sendJson(res, 200, { services: await listServices() });
      return;
    }

    const serviceAction = {
      '/api/services/start': startService,
      '/api/services/stop': stopService,
      '/api/services/restart': restartService,
    }[pathname];
    if (req.method === 'POST' && serviceAction) {
      const { id } = await readBody(req);
      try {
        sendJson(res, 200, await serviceAction(id));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/projects') {
      sendJson(res, 200, { active: P.slug, projects: listProjects().map((slug) => {
        const pp = projectPaths(slug);
        const md = existsSync(pp.planMd) ? readFileSync(pp.planMd, 'utf8') : '';
        const sceneCount = (md.match(/^##\s+scene\s+\d+/gim) ?? []).length;
        return { slug, title: projectTitle(slug), sceneCount };
      }) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/project') {
      const { slug } = await readBody(req);
      if (activeJobs > 0) { sendJson(res, 409, { error: JOBS_RUNNING_ERROR }); return; }
      if (!isValidSlug(slug)) { sendJson(res, 400, { error: 'invalid project slug' }); return; }
      const target = projectPaths(slug);
      if (!existsSync(target.planMd)) { sendJson(res, 404, { error: `project "${slug}" not found` }); return; }
      await activateProject(slug);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/project-create') {
      const { slug, title, aspect, template, voice, plan } = await readBody(req);
      if (activeJobs > 0) { sendJson(res, 409, { error: JOBS_RUNNING_ERROR }); return; }
      const error = isValidSlug(slug)
        ? newProjectError({ slug, aspect, template, voice })
        : 'slug must be lowercase letters, numbers and hyphens';
      if (error) { sendJson(res, 400, { error }); return; }
      try {
        writeNewProject({ slug, title, aspect, template, voice, plan });
      } catch (e) {
        sendJson(res, 400, { error: e.message });
        return;
      }
      await activateProject(slug);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/script-generate') {
      const input = scriptRequestInput(await readBody(req));
      if (input.error) { sendJson(res, 400, { error: input.error }); return; }
      if (activeJobs > 0) { sendJson(res, 409, { error: JOBS_RUNNING_ERROR }); return; }
      trackJob(res, () => generateScriptProject(res, input));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/voices') {
      sendJson(res, 200, { ...(await listVoices()), defaultVoice: DEFAULT_VOICE });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/project-voice') {
      const { voice } = await readBody(req);
      if (!isValidVoiceName(voice)) { sendJson(res, 400, { error: `tên giọng đọc không hợp lệ: "${voice}"` }); return; }
      writePlanHeader(P.planMd, 'voice', voice);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/images/')) {
      const name = decodeURIComponent(pathname.slice('/images/'.length));
      const path = join(P.imageDir, name);
      if (!name.includes('..') && existsSync(path)) {
        res.writeHead(200, { 'Content-Type': MIME[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(readFileSync(path));
      } else {
        res.writeHead(404).end('not found');
      }
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/audio/')) {
      const name = decodeURIComponent(pathname.slice('/audio/'.length));
      const path = join(P.audioDir, name);
      if (!name.includes('..') && existsSync(path)) {
        sendMedia(req, res, path, 'audio/mpeg');
      } else {
        res.writeHead(404).end('not found');
      }
      return;
    }

    // Character reference (v1) and puppet (v2) images for the gallery. /characters/v2/<file>
    // reaches the puppet subdirectory; same traversal guard as /images/.
    if (req.method === 'GET' && pathname.startsWith('/characters/')) {
      const name = decodeURIComponent(pathname.slice('/characters/'.length));
      const path = join(P.charDir, name);
      if (!name.includes('..') && existsSync(path)) {
        res.writeHead(200, { 'Content-Type': MIME[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(readFileSync(path));
      } else {
        res.writeHead(404).end('not found');
      }
      return;
    }

    // Another project's character reference, for the "pick from another project" library.
    if (req.method === 'GET' && pathname.startsWith('/library-characters/')) {
      const [slug, name, ...extra] = pathname.slice('/library-characters/'.length).split('/').map(decodeURIComponent);
      const path = isValidSlug(slug) && name && !extra.length && !name.includes('..')
        ? join(projectPaths(slug).charDir, name)
        : null;
      if (path && existsSync(path)) {
        res.writeHead(200, { 'Content-Type': MIME[name.split('.').pop().toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(readFileSync(path));
      } else {
        res.writeHead(404).end('not found');
      }
      return;
    }

    // The finished render, so the panel can offer a play/download link after finalize.
    if (req.method === 'GET' && pathname === '/preview.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(await previewBundle());
      return;
    }

    // Async so a rebuild (ffprobe + silence detection per scene) never blocks the other routes.
    if (req.method === 'GET' && pathname === '/api/preview-data') {
      await execFileAsync('node', [join(HERE, 'build-remotion.mjs'), '--project', P.slug]);
      sendJson(res, 200, { project: JSON.parse(readFileSync(join('src', 'projects-data', `${P.slug}.json`), 'utf8')) });
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/public/')) {
      const name = decodeURIComponent(pathname.slice('/public/'.length));
      const path = join(PUBLIC_DIR, name);
      const type = PUBLIC_MIME[name.split('.').pop().toLowerCase()];
      if (name.includes('..') || !type || !existsSync(path)) { res.writeHead(404).end('not found'); return; }
      sendMedia(req, res, path, type);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/outputs') {
      sendJson(res, 200, outputLibrary());
      return;
    }

    // Takes effect on the next render; videos already rendered stay where they are.
    if (req.method === 'POST' && pathname === '/api/output-dir') {
      const { dir } = await readBody(req);
      try { setOutputDir(dir); } catch (e) { sendJson(res, 400, { error: `không dùng được thư mục này: ${e.message}` }); return; }
      P = projectPaths(P.slug);
      sendJson(res, 200, outputLibrary());
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/output/')) {
      const name = decodeURIComponent(pathname.slice('/output/'.length));
      const path = join(P.outDir, name);
      if (!OUTPUT_VIDEO_RE.test(name) || !existsSync(path)) { res.writeHead(404).end('not found'); return; }
      sendMedia(req, res, path, 'video/mp4');
      return;
    }

    if (req.method === 'POST' && pathname === '/api/output-reveal') {
      // Show the file selected in Finder. The server runs on the user's own Mac, so this opens there.
      const { name } = await readBody(req);
      const path = join(P.outDir, String(name ?? ''));
      if (!OUTPUT_VIDEO_RE.test(name) || !existsSync(path)) { sendJson(res, 404, { error: 'không tìm thấy video' }); return; }
      execFile('open', ['-R', path], (err) => {
        if (err) sendJson(res, 500, { error: `không mở được thư mục: ${err.message}` });
        else sendJson(res, 200, { ok: true });
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/video') {
      const file = url.searchParams.get('f') === '9x16' ? outMp4Vertical() : outMp4();
      if (!existsSync(file)) { res.writeHead(404).end('no render yet'); return; }
      sendMedia(req, res, file, 'video/mp4');
      return;
    }

    // Images and motion clips already generated keep their old shape; the render covers-crops
    // them to the new frame and new generations follow the new aspect.
    if (req.method === 'POST' && pathname === '/api/project-aspect') {
      const { aspect } = await readBody(req);
      if (!ASPECTS[aspect]) { sendJson(res, 400, { error: `tỉ lệ khung phải là ${Object.keys(ASPECTS).join(', ')}` }); return; }
      writePlanHeader(P.planMd, 'aspect', aspect);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/motion-video/')) {
      const name = decodeURIComponent(pathname.slice('/motion-video/'.length));
      const path = join(P.sceneVideoDir, name);
      if (!name.includes('..') && existsSync(path)) sendMedia(req, res, path, 'video/mp4');
      else res.writeHead(404).end('not found');
      return;
    }

    // Model manager: provider endpoints / keys and the models offered in the pickers
    // (data/models.json). Keys are only ever returned masked.
    if (req.method === 'GET' && pathname === '/api/model-config') {
      sendJson(res, 200, describeModelConfig());
      return;
    }
    const modelConfigAction = pathname.match(/^\/api\/model-config\/([a-z-]+)$/)?.[1];
    if (req.method === 'POST' && modelConfigAction && isModelConfigAction(modelConfigAction)) {
      try {
        sendJson(res, 200, applyModelConfigAction(modelConfigAction, await readBody(req)));
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    // Corner logo + centre watermark for the final render; applied at the next Render MP4, whose
    // build step stamps branding.json into the Remotion bundle.
    if (req.method === 'GET' && pathname === '/api/branding') {
      sendJson(res, 200, { branding: readBranding(P.slug) });
      return;
    }
    if (req.method === 'POST' && pathname === '/api/branding') {
      sendJson(res, 200, { branding: writeBranding(P.slug, await readBody(req)) });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/templates') {
      sendJson(res, 200, { templates: getTemplates(), activeVersion: getTemplates().activeVersion, versions: listTemplateVersions() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/templates') {
      const body = await readBody(req);
      const templates = saveTemplates(body, body.version || 'default');
      sendJson(res, 200, { ok: true, templates, activeVersion: templates.activeVersion, versions: listTemplateVersions() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/templates/activate') {
      const body = await readBody(req);
      if (typeof body.version !== 'string') { sendJson(res, 400, { error: 'version required' }); return; }
      if (!listTemplateVersions().includes(body.version)) { sendJson(res, 400, { error: `Unknown template version: ${body.version}` }); return; }
      const templates = activateTemplateVersion(body.version);
      sendJson(res, 200, { ok: true, templates, activeVersion: templates.activeVersion, versions: listTemplateVersions() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/narration') {
      const { scene, narration } = await readBody(req);
      if (!Number.isFinite(scene) || typeof narration !== 'string') { sendJson(res, 400, { error: 'scene + narration required' }); return; }
      if (!narration.trim()) { sendJson(res, 400, { error: 'narration is empty' }); return; }
      const clean = writeSceneField(P.planMd, scene, 'narration', narration);
      // Prompt/motion (and their translations) are left untouched on a narration edit: the
      // author updates them deliberately — re-running the lsvn/trangca skill, or "Write from
      // narration" per scene — so a small narration fix never discards a hand-tuned prompt.
      sendJson(res, 200, { ok: true, scene, narration: clean, audioStale: sceneAudioStale(scene, clean) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/prompt') {
      const { scene, prompt } = await readBody(req);
      if (!Number.isFinite(scene) || typeof prompt !== 'string') { sendJson(res, 400, { error: 'scene + prompt required' }); return; }
      const clean = writeSceneField(P.planMd, scene, 'prompt', prompt);
      // prompt_vi is left intact: the author edits the translation deliberately (in the full-script
      // editor or via "Dịch"), so a hand-edited English prompt never silently drops its translation.
      sendJson(res, 200, { ok: true, scene, prompt: clean });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/scenes-update') {
      // Bulk patch writer for the full-script editor and its JSON import. Each row is a partial
      // patch keyed by scene: only the fields present are written, verbatim, with no derived-field
      // clearing (a prompt edit keeps prompt_vi, a narration edit keeps the prompt, etc.). New
      // scene numbers are appended. `char` accepts an id/comma-string/array/"both"/"none".
      const STRING_FIELDS = ['narration', 'cue', 'beat', 'prompt', 'prompt_vi', 'motion', 'motion_vi', ...MOTION_PART_KEYS];
      const body = await readBody(req);
      const rows = Array.isArray(body) ? body : Array.isArray(body?.scenes) ? body.scenes : null;
      if (!rows || !rows.length) { sendJson(res, 400, { error: 'expected an array of {scene, ...fields} or {scenes:[...]}' }); return; }
      const currentPlan = readPlan();
      const charIds = Object.keys(currentPlan.characters ?? {});
      const currentNarration = new Map(currentPlan.scenes.map((s) => [s.scene, s.narration]));
      const errors = [];
      const charByScene = new Map(); // scene → normalized comma id string (only when char provided)
      rows.forEach((row, i) => {
        if (!row || !Number.isFinite(row.scene) || row.scene < 1) { errors.push(`row ${i}: scene must be a positive number`); return; }
        for (const f of STRING_FIELDS) {
          if (f in row && typeof row[f] !== 'string') errors.push(`row ${i} (scene ${row.scene}): ${f} must be a string`);
        }
        // A filled narration may not be blanked and new scenes must carry one; a scene that is
        // already blank (just inserted) may stay blank, so an exported plan re-imports as it was.
        const isNew = !hasSceneHeading(P.planMd, row.scene);
        const blanksNarration = 'narration' in row && typeof row.narration === 'string' && !row.narration.trim() && (currentNarration.get(row.scene) ?? '').trim();
        if (blanksNarration || (isNew && !(typeof row.narration === 'string' && row.narration.trim()))) {
          errors.push(`row ${i} (scene ${row.scene}): narration is required and cannot be empty`);
        }
        const norm = normalizeImportChar(row.char, charIds);
        if (norm.error) errors.push(`row ${i} (scene ${row.scene}): ${norm.error}`);
        else if (!norm.skip) charByScene.set(row.scene, norm.ids.join(', '));
      });
      if (errors.length) { sendJson(res, 400, { error: errors.join('; ') }); return; }

      writeFileSync(`${P.planMd}.bak`, readFileSync(P.planMd, 'utf8'));

      const updated = [];
      const appended = [];
      for (const row of rows) {
        const char = charByScene.get(row.scene); // undefined when the row omitted char
        if (hasSceneHeading(P.planMd, row.scene)) {
          for (const f of STRING_FIELDS) if (f in row && !MOTION_PART_KEYS.includes(f)) writeSceneField(P.planMd, row.scene, f, row[f]);
          writeMotionParts(P.planMd, row.scene, row); // after motion/motion_vi, which it may retire
          if (char !== undefined) writeSceneField(P.planMd, row.scene, 'char', char);
          updated.push(row.scene);
        } else {
          appendScene(P.planMd, row.scene, { ...row, char });
          appended.push(row.scene);
        }
      }
      await rebuildBundles();
      sendJson(res, 200, { ok: true, updated, appended });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/scene-field') {
      const { scene, field, value } = await readBody(req);
      const allowed = ['char', 'host', 'title', 'cue'];
      if (!Number.isFinite(scene) || !allowed.includes(field) || typeof value !== 'string') {
        sendJson(res, 400, { error: 'scene, field (char|host|title|cue) and value required' });
        return;
      }
      writeSceneField(P.planMd, scene, field, value);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/merge-scenes') {
      // Merge two or more adjacent scenes into one: narration is concatenated into `keep`
      // (or the lowest scene number when omitted), every other scene's block — prompt, char,
      // motion, cue — is deleted, and later scenes move down to close the gap. The merged-away
      // scenes' media goes to tmp/deleted-scenes like a delete. Scenes must be contiguous in the
      // current plan; merging across a gap would silently swallow whatever sits between them.
      const { scenes, keep, narration } = await readBody(req);
      if (activeJobs > 0) { sendJson(res, 409, { error: 'Đang có job chạy trên server — chờ xong rồi gộp scene.' }); return; }
      const nums = Array.isArray(scenes)
        ? [...new Set(scenes.map(Number))].filter(Number.isFinite).sort((a, b) => a - b)
        : [];
      if (nums.length < 2) { sendJson(res, 400, { error: 'select at least 2 scenes to merge' }); return; }
      const keepScene = Number.isFinite(keep) ? Number(keep) : nums[0];
      if (!nums.includes(keepScene)) { sendJson(res, 400, { error: 'keep scene must be one of the selected scenes' }); return; }

      const allNums = readPlan().scenes.map((s) => s.scene).sort((a, b) => a - b);
      const at = allNums.indexOf(nums[0]);
      const contiguous = at >= 0 && nums.every((n, i) => allNums[at + i] === n);
      if (!contiguous) { sendJson(res, 400, { error: 'selected scenes must be adjacent, with no other scene between them' }); return; }

      writeFileSync(`${P.planMd}.bak`, readFileSync(P.planMd, 'utf8'));
      const removed = nums.filter((n) => n !== keepScene);
      let mergedNarration;
      try {
        // mergeScenes always writes its own auto-joined narration first; an edited preview from
        // the merge dialog then overwrites it, so a hand-tightened join is never lost.
        mergedNarration = mergeScenes(P.planMd, nums, keepScene);
        if (typeof narration === 'string' && narration.trim() && narration.trim() !== mergedNarration) {
          mergedNarration = writeSceneField(P.planMd, keepScene, 'narration', narration);
        }
        // Highest first, so the numbers of the scenes still to move stay valid.
        for (const n of [...removed].reverse()) {
          removeSceneMedia(P, n, join(DELETED_SCENES_DIR, P.slug, `${Date.now()}-merged-${sceneBase(n)}`));
        }
        closeSceneGap(P.planMd, removed);
      } catch (e) {
        sendJson(res, 400, { error: e.message });
        return;
      }
      await rebuildBundles();
      const mergedScene = keepScene - removed.filter((n) => n < keepScene).length;
      sendJson(res, 200, { ...buildState(), mergedScene, mergedNarration });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/insert-scene') {
      // Add one new scene numbered `at`; the scene that held `at` and every later one move down by
      // one, media files included. Refused while a job runs: it would write to the old numbers.
      const { at, narration = '' } = await readBody(req);
      if (activeJobs > 0) { sendJson(res, 409, { error: 'Đang có job chạy trên server — chờ xong rồi chèn scene.' }); return; }
      const lastScene = Math.max(0, ...readPlan().scenes.map((s) => s.scene));
      if (!Number.isInteger(at) || at < 1 || at > lastScene + 1) { sendJson(res, 400, { error: `vị trí chèn phải từ 1 đến ${lastScene + 1}` }); return; }
      if (typeof narration !== 'string') { sendJson(res, 400, { error: 'narration phải là chuỗi' }); return; }

      writeFileSync(`${P.planMd}.bak`, readFileSync(P.planMd, 'utf8'));
      try {
        shiftSceneMedia(P, at);
        insertScene(P.planMd, at, { narration });
      } catch (e) {
        sendJson(res, 500, { error: `chèn scene thất bại (bản sao plan: ${basename(P.planMd)}.bak): ${e.message}` });
        return;
      }
      await rebuildBundles();
      sendJson(res, 200, { ...buildState(), insertedScene: at });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/delete-scene') {
      // Remove one scene and close the gap: later scenes move down by one, media included. The
      // scene's own files go to tmp/deleted-scenes/<slug>/ instead of being erased.
      const { scene } = await readBody(req);
      if (activeJobs > 0) { sendJson(res, 409, { error: 'Đang có job chạy trên server — chờ xong rồi xoá scene.' }); return; }
      const sceneNos = readPlan().scenes.map((s) => s.scene);
      if (!sceneNos.includes(scene)) { sendJson(res, 404, { error: `không tìm thấy scene ${scene}` }); return; }
      if (sceneNos.length < 2) { sendJson(res, 400, { error: 'kịch bản phải còn ít nhất 1 scene' }); return; }

      writeFileSync(`${P.planMd}.bak`, readFileSync(P.planMd, 'utf8'));
      const trashDir = join(DELETED_SCENES_DIR, P.slug, `${Date.now()}-${sceneBase(scene)}`);
      try {
        removeSceneMedia(P, scene, trashDir);
        removeScene(P.planMd, scene);
      } catch (e) {
        sendJson(res, 500, { error: `xoá scene thất bại (bản sao plan: ${basename(P.planMd)}.bak): ${e.message}` });
        return;
      }
      await rebuildBundles();
      sendJson(res, 200, { ...buildState(), deletedScene: scene, trashDir });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/character-create') {
      const { id, name } = await readBody(req);
      if (!isValidSlug(id)) { sendJson(res, 400, { error: 'id must be lowercase letters, numbers and hyphens' }); return; }
      if (typeof name !== 'string' || !name.trim()) { sendJson(res, 400, { error: 'name is required' }); return; }
      const plan = readPlan();
      if (plan.characters[id]) { sendJson(res, 400, { error: `character "${id}" already exists` }); return; }
      const relPath = addCharacterToPlan(P.planMd, P.staticPrefix, id);
      const profileDir = join(P.profilesDir, id);
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(join(profileDir, 'profile.json'), `${JSON.stringify({
        character_id: id, name: name.trim(), display_name: name.trim(), aliases: [], reference: relPath,
      }, null, 2)}\n`);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/character-library') {
      sendJson(res, 200, { characters: characterLibrary() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/character-import') {
      const { project, sourceId, id, name, replace = false } = await readBody(req);
      if (!isValidSlug(project) || project === P.slug || !existsSync(projectPaths(project).planMd)) {
        sendJson(res, 400, { error: `invalid source project "${project}"` });
        return;
      }
      if (!isValidSlug(id)) { sendJson(res, 400, { error: 'id must be lowercase letters, numbers and hyphens' }); return; }
      if (typeof name !== 'string' || !name.trim()) { sendJson(res, 400, { error: 'name is required' }); return; }
      const exists = Object.hasOwn(readPlan().characters, id);
      if (replace && !exists) { sendJson(res, 404, { error: `character "${id}" not found` }); return; }
      if (!replace && exists) { sendJson(res, 400, { error: `character "${id}" already exists` }); return; }
      try {
        importCharacter({ project, sourceId, id, name: name.trim(), replace: Boolean(replace) });
      } catch (e) {
        sendJson(res, 400, { error: e.message });
        return;
      }
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/character-upload') {
      const id = url.searchParams.get('id');
      const plan = readPlan();
      const relPath = plan.characters[id];
      if (!relPath) { sendJson(res, 404, { error: `character "${id}" not found` }); return; }
      const buf = await readRawBody(req, MAX_IMAGE_UPLOAD, 'Image too large (max 15 MB).');
      if (!isSupportedImage(buf)) { sendJson(res, 400, { error: 'Upload a JPEG, PNG or WebP image.' }); return; }
      const uploadPath = `${relPath}.upload`;
      mkdirSync(dirname(uploadPath), { recursive: true });
      writeFileSync(uploadPath, buf);
      try {
        setCharacterReference(id, relPath, uploadPath);
      } finally {
        if (existsSync(uploadPath)) unlinkSync(uploadPath);
      }
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/character-source') {
      const id = url.searchParams.get('id');
      if (!planCharacterPath(id)) { sendJson(res, 404, { error: `character "${id}" not found` }); return; }
      const buf = await readRawBody(req, MAX_IMAGE_UPLOAD, 'Image too large (max 15 MB).');
      if (!isSupportedImage(buf)) { sendJson(res, 400, { error: 'Upload a JPEG, PNG or WebP image.' }); return; }
      mkdirSync(charDraftDir(), { recursive: true });
      const path = charSourcePath(id);
      const uploadPath = `${path}.upload`;
      writeFileSync(uploadPath, buf);
      try {
        optimizeSourceImage(uploadPath, path);
      } catch {
        sendJson(res, 400, { error: 'Không đọc được ảnh này — thử file JPEG/PNG khác.' });
        return;
      } finally {
        unlinkSync(uploadPath);
      }
      sendJson(res, 200, { ok: true, sourceUrl: charDraftUrl(path) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/character-generate') {
      // Draws a draft only; /api/character-apply makes it the reference, so a bad result never
      // replaces a good reference.
      const { id, model, description = '', source } = await readBody(req);
      const relPath = planCharacterPath(id);
      if (!relPath) { sendJson(res, 404, { error: `character "${id}" not found` }); return; }
      if (typeof model !== 'string' || !model.trim()) { sendJson(res, 400, { error: 'Chọn model ảnh.' }); return; }
      if (typeof description !== 'string' || description.length > MAX_CHARACTER_DESCRIPTION) {
        sendJson(res, 400, { error: `Mô tả tối đa ${MAX_CHARACTER_DESCRIPTION} ký tự.` });
        return;
      }
      if (source && !['upload', 'current'].includes(source)) { sendJson(res, 400, { error: "source must be 'upload' or 'current'" }); return; }
      const sourcePath = { upload: charSourcePath(id), current: relPath }[source];
      if (source && !existsSync(sourcePath)) { sendJson(res, 400, { error: source === 'upload' ? 'Chưa có ảnh nguồn — chọn ảnh trước.' : 'Nhân vật chưa có ảnh tham chiếu.' }); return; }
      if (!sourcePath && !description.trim()) { sendJson(res, 400, { error: 'Nhập mô tả nhân vật.' }); return; }
      sseHead(res);
      const signal = cancelSignal(res);
      const outPath = charDraftPath(id);
      await trackJob(res, async () => {
        try {
          mkdirSync(charDraftDir(), { recursive: true });
          await generateCharacterImage({
            description: description.trim(), sourcePath, model: model.trim(), outPath, signal,
            onLog: (line) => sseSend(res, 'log', line),
          });
          sseSend(res, 'done', { message: `Đã tạo ảnh nháp cho "${id}".`, draftUrl: charDraftUrl(outPath) });
        } catch (e) {
          if (signal.aborted) { console.log(`[character ${id}] cancelled`); return; }
          sseSend(res, 'error', e.message);
        }
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && pathname === '/api/character-apply') {
      const { id, from = 'draft' } = await readBody(req);
      const relPath = planCharacterPath(id);
      if (!relPath) { sendJson(res, 404, { error: `character "${id}" not found` }); return; }
      if (!['draft', 'source'].includes(from)) { sendJson(res, 400, { error: "from must be 'draft' or 'source'" }); return; }
      const image = from === 'source' ? charSourcePath(id) : charDraftPath(id);
      if (!existsSync(image)) {
        sendJson(res, 400, { error: from === 'source' ? 'Chưa có ảnh nguồn để áp dụng.' : 'Chưa có ảnh nháp để áp dụng.' });
        return;
      }
      // The reference it replaces may be the user's own upload: keep it beside it as <file>.bak.
      if (existsSync(relPath)) copyFileSync(relPath, `${relPath}.bak`);
      setCharacterReference(id, relPath, image, 'pad');
      // Either way the dialog's work is done: neither a leftover draft nor source is reused later.
      for (const leftover of [charDraftPath(id), charSourcePath(id)]) if (existsSync(leftover)) unlinkSync(leftover);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'GET' && pathname === '/api/character-profile') {
      const id = url.searchParams.get('id');
      if (!readPlan().characters[id]) { sendJson(res, 404, { error: `character "${id}" not found` }); return; }
      sendJson(res, 200, { id, profile: readProfile(id) ?? { character_id: id } });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/character-profile') {
      const { id, patch } = await readBody(req);
      const plan = readPlan();
      if (!plan.characters[id]) { sendJson(res, 404, { error: `character "${id}" not found` }); return; }
      if (!patch || typeof patch !== 'object') { sendJson(res, 400, { error: 'patch object required' }); return; }
      const existing = readProfile(id) ?? { character_id: id, reference: plan.characters[id] };
      const next = { ...existing, ...normalizeProfilePatch(patch), character_id: id };
      const dir = join(P.profilesDir, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'profile.json'), `${JSON.stringify(next, null, 2)}\n`);
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-puppets') {
      const { id } = await readBody(req);
      const args = id ? [String(id)] : [];
      trackJob(res, () => streamPuppets(res, args, id ? `Generating puppet for ${id}...` : 'Generating puppet references for every character...'));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-prompt') {
      // Write one scene's image prompt from its narration via OpenAI (scripts/lib/prompt-writer.mjs).
      const { scene } = await readBody(req);
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      if (target.image.kind !== 'ai') { sendJson(res, 400, { error: `scene ${scene} is a search scene, not AI` }); return; }
      if (!target.narration) { sendJson(res, 400, { error: `scene ${scene} has no narration yet` }); return; }
      const characters = buildCharacterContext(target.image.characters, P.profilesDir);
      const gi = plan.scenes.findIndex((s) => s.scene === scene);
      const context = { prev: plan.scenes[gi - 1]?.narration, next: plan.scenes[gi + 1]?.narration };
      await trackJob(res, async () => {
        const { text, vi } = await generateScenePrompt({ narration: target.narration, characters, identity: target.image.identity, context });
        writeSceneField(P.planMd, scene, 'prompt', text);
        writeSceneField(P.planMd, scene, 'prompt_vi', vi);
        sendJson(res, 200, { ok: true, scene, prompt: text, promptVi: vi });
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/social-generate') {
      const { note } = await readBody(req);
      const text = typeof note === 'string' ? note.trim() : '';
      if (text.length > MAX_SOCIAL_NOTE) { sendJson(res, 400, { error: `Ghi chú dài quá ${MAX_SOCIAL_NOTE} ký tự.` }); return; }
      const plan = readPlan();
      await trackJob(res, async () => {
        const posts = await writeSocialPosts({ title: plan.title, scenes: plan.scenes, note: text });
        sendJson(res, 200, { slug: plan.slug, posts });
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/thumbnail-ideas') {
      const plan = readPlan();
      await trackJob(res, async () => {
        const ideas = await writeThumbnailIdeas({
          title: plan.title, scenes: plan.scenes, cast: plan.characterRows.map(({ id, name }) => ({ id, name })),
        });
        sendJson(res, 200, ideas);
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/thumbnail-backgrounds') {
      sendJson(res, 200, { items: thumbnailBackgrounds() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/thumbnail-generate') {
      const { model, prompt, chars, side } = await readBody(req);
      if (typeof model !== 'string' || !model.trim()) { sendJson(res, 400, { error: 'Chọn model ảnh.' }); return; }
      const text = typeof prompt === 'string' ? prompt.trim() : '';
      if (!text) { sendJson(res, 400, { error: 'Nhập prompt nền — hoặc bấm Gợi ý bằng AI.' }); return; }
      if (text.length > MAX_THUMB_PROMPT) { sendJson(res, 400, { error: `Prompt tối đa ${MAX_THUMB_PROMPT} ký tự.` }); return; }
      if (!THUMB_SIDES.includes(side)) { sendJson(res, 400, { error: `side must be ${THUMB_SIDES.join(' | ')}` }); return; }
      trackJob(res, () => generateThumbnail(res, { model: model.trim(), prompt: text, chars, side }));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-prompts-batch') {
      const { scenes } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(res, () => generatePromptsBatch(res, list));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-motion-prompts-batch') {
      const { scenes } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(res, () => generateMotionPromptsBatch(res, list));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate') {
      // Streamed (SSE) so the Replicate call is logged in the panel console, matching the motion
      // and audio flows. Validation errors are sent as JSON before the stream opens.
      const { scene, model } = await readBody(req);
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      if (target.image.kind !== 'ai') { sendJson(res, 400, { error: `scene ${scene} is a search scene, not AI` }); return; }
      if (!target.image.prompt) { sendJson(res, 400, { error: `scene ${scene} has no prompt yet` }); return; }
      sseHead(res);
      const log = (line) => { console.log(`[image scene ${scene}] ${line}`); sseSend(res, 'log', line); };
      const signal = cancelSignal(res);
      await trackJob(res, async () => {
        try {
          log(`▶ generating scene ${scene}${model ? ` (model=${model})` : ' (auto route by reference count)'}`);
          const { via } = await trackMediaChange('image', scene, () => generateSceneImage(target, plan.characters, { model, signal, onLog: log }));
          sseSend(res, 'done', `Scene ${scene} image generated (${via})`);
        } catch (e) {
          if (signal.aborted) { console.log(`[image scene ${scene}] cancelled`); return; }
          log(`error: ${e.message}`);
          sseSend(res, 'error', e.message);
        }
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && pathname === '/api/upload') {
      const scene = Number(url.searchParams.get('scene'));
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      const buf = await readRawBody(req, MAX_IMAGE_UPLOAD, 'Image too large (max 15 MB).');
      if (!isSupportedImage(buf)) { sendJson(res, 400, { error: 'Upload a JPEG, PNG or WebP image.' }); return; }
      const file = sceneFile(scene);
      mkdirSync(P.imageDir, { recursive: true });
      const path = join(P.imageDir, file);
      await trackMediaChange('image', scene, () => {
        writeFileSync(path, buf);
        // Record the user's photo as the scene asset so it is never mislabelled as AI.
        upsertManifest({
          id: file.replace(/\.[^.]+$/, ''), scene, type: 'user_upload',
          subject: `User-uploaded image for scene ${scene}`, source: 'User upload (review UI)', sourceUrl: null,
          license: 'Provided by the user; ensure you hold the rights to use it.',
          credit: 'User-provided image', authenticity: 'USER_UPLOAD',
          characters: target.image.characters ?? [],
        });
      });
      sendJson(res, 200, { ok: true, scene, source: 'upload', imageUrl: `/images/${file}?v=${statSync(path).mtimeMs}` });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/upload-motion-video') {
      const scene = Number(url.searchParams.get('scene'));
      const plan = readPlan();
      if (!plan.scenes.some((s) => s.scene === scene)) {
        sendJson(res, 404, { error: `scene ${scene} not found` });
        return;
      }
      const buf = await readRawBody(req, MAX_VIDEO_UPLOAD, 'Video too large (max 500 MB).');
      mkdirSync(P.sceneVideoDir, { recursive: true });
      const path = motionPathFor(scene);
      const uploadPath = `${path}.upload`;
      writeFileSync(uploadPath, buf);
      try {
        probeSceneVideo(uploadPath);
        await trackMediaChange('motion', scene, () => renameSync(uploadPath, path));
      } catch (error) {
        if (existsSync(uploadPath)) unlinkSync(uploadPath);
        sendJson(res, 400, { error: error.message });
        return;
      }
      await rebuildBundles();
      sendJson(res, 200, {
        ok: true,
        scene,
        motionVideoUrl: `/motion-video/${sceneVideoFile(scene)}?v=${statSync(path).mtimeMs}`,
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/audio') {
      // Generate/regenerate narration audio for one scene (OmniVoice via generate-narration.mjs).
      const { scene } = await readBody(req);
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      if (!target.narration) { sendJson(res, 400, { error: `scene ${scene} has no narration` }); return; }
      trackJob(res, () => streamNarration(res, [String(scene)], `Generating audio for scene ${scene}...`));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/audio-batch') {
      // Generate audio for several scenes in one OmniVoice run (generate-narration accepts a list).
      const { scenes } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(res, () => streamNarration(res, list.map(String), `Generating audio for scenes ${list.join(', ')}...`));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-batch') {
      // Generate images for several selected AI scenes in turn.
      const { scenes, model } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(res, () => generateImagesBatch(res, list, model));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-motion-videos-batch') {
      const { scenes, model } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(res, () => generateMotionVideosBatch(res, list, model));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/finalize') {
      // After every image + audio exists: measure durations, align captions, audit, render MP4.
      const { format = 'wide' } = await readBody(req);
      if (!RENDER_FORMATS.includes(format)) { sendJson(res, 400, { error: `format phải là ${RENDER_FORMATS.join(', ')}` }); return; }
      const wrapVertical = activeAspect() === '16:9' && format !== 'wide';
      const plan = readPlan();
      const missImg = plan.scenes.filter((s) => !existsSync(join(P.imageDir, sceneFile(s.scene)))).map((s) => s.scene);
      const missAud = plan.scenes.filter((s) => !existsSync(join(P.audioDir, audioFile(s.scene)))).map((s) => s.scene);
      if (missImg.length || missAud.length) {
        sseHead(res);
        if (missImg.length) sseSend(res, 'log', `✗ missing images: scene ${missImg.join(', ')}`);
        if (missAud.length) sseSend(res, 'log', `✗ missing audio: scene ${missAud.join(', ')}`);
        sseSend(res, 'error', 'Generate every scene image and audio first.');
        res.end();
        return;
      }
      mkdirSync(P.outDir, { recursive: true });
      trackJob(res, () => runSteps(res, [
        { label: 'Audit assets', cmd: 'node', args: [join(HERE, 'check-assets.mjs')] },
        // Rebuild this project's Remotion bundle (measures audio + aligns captions into
        // src/projects-data/<slug>.json). The composition id is the active project's slug.
        { label: 'Build Remotion data → src/projects-data', cmd: 'node', args: [join(HERE, 'build-remotion.mjs'), '--project', P.slug] },
        {
          label: 'Render MP4 (H.264 CRF 17, this can take several minutes)',
          cmd: 'npx',
          args: [
            'remotion',
            'render',
            P.slug,
            outMp4(),
            '--codec=h264',
            '--crf=17',
            '--pixel-format=yuv420p',
            '--image-format=jpeg',
            '--jpeg-quality=100',
          ],
        },
        ...(wrapVertical
          ? [{ label: 'Wrap 16:9 → 9:16 1080x1920 (Shorts / TikTok)', cmd: 'node', args: [join(HERE, 'wrap-vertical.mjs'), '--project', P.slug] }]
          : []),
      ], `Finished. Rendered ${wrapVertical ? `${outMp4()} + ${outMp4Vertical()}` : outMp4()}`));
      return;
    }

    if (req.method === 'POST' && (pathname === '/api/undo' || pathname === '/api/redo')) {
      // Step one scene's image, audio or motion video back (undo) or forward (redo) through its
      // snapshots (see trackMediaChange). 400 when that direction has nothing left.
      const { scene, kind } = await readBody(req);
      if (!Number.isFinite(scene) || !Object.hasOwn(MEDIA_KINDS, kind)) {
        sendJson(res, 400, { error: `scene + kind (${Object.keys(MEDIA_KINDS).join('|')}) required` });
        return;
      }
      const action = pathname === '/api/undo' ? 'undo' : 'redo';
      if (!stepMedia(action === 'undo' ? undoChange : redoChange, kind, scene)) {
        sendJson(res, 400, { error: `nothing to ${action} for scene ${scene} ${kind}` });
        return;
      }
      // Durations, captions and the motion flag live in the Remotion bundle; an image step can flip
      // the motion flag too when the scene has a clip.
      if (kind !== 'image' || existsSync(motionPathFor(scene))) await rebuildBundles();
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/remove-motion-video') {
      const { scene } = await readBody(req);
      if (!Number.isFinite(scene)) {
        sendJson(res, 400, { error: 'scene required' });
        return;
      }
      const videoPath = motionPathFor(scene);
      if (!existsSync(videoPath)) {
        sendJson(res, 404, { error: `scene ${scene} has no motion video` });
        return;
      }
      await trackMediaChange('motion', scene, () => unlinkSync(videoPath));
      await rebuildBundles();
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-motion-video') {
      // camera / action / env, when sent, are the panel's current (possibly unsaved) edits.
      const body = await readBody(req);
      const { scene, model, duration } = body;
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      const editedParts = MOTION_FIELDS.some((f) => typeof body[f] === 'string') ? body : undefined;
      const imagePath = join(P.imageDir, sceneFile(scene));
      if (!existsSync(imagePath)) { sendJson(res, 400, { error: `scene ${scene} has no image yet` }); return; }
      const audioPath = join(P.audioDir, audioFile(scene));
      if (!existsSync(audioPath)) { sendJson(res, 400, { error: `scene ${scene} has no audio yet — generate audio first so the motion video's duration can match it` }); return; }
      let audioSeconds;
      try {
        audioSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', audioPath], { encoding: 'utf8' }).trim());
      } catch (e) { sendJson(res, 500, { error: `ffprobe failed: ${e.message}` }); return; }
      sseHead(res);
      const log = (line) => { console.log(`[motion-video scene ${scene}] ${line}`); sseSend(res, 'log', line); };
      const signal = cancelSignal(res);
      await trackJob(res, async () => {
        try {
          const motionPrompt = sceneMotionPrompt(target, editedParts, model);
          log(`motion prompt: ${motionPrompt.replace(/\s+/g, ' ').slice(0, 700)}`);
          log(`audio duration: ${audioSeconds.toFixed(1)}s`);
          if (Number.isFinite(duration) && duration > 0) log(`requested duration override: ${duration}s (snapped to the model's allowed lengths)`);
          const result = await trackMediaChange('motion', scene, () => generateSceneVideo({ scene, imagePath, outputDir: P.sceneVideoDir, prompt: motionPrompt, model, audioSeconds, duration, aspect: activeAspect(), signal, onLog: log }));
          // The final Remotion render plays this clip in place of the scene image — rebuild so
          // the bundle's motionVideo flag flips on without a separate manual step.
          await rebuildBundles((event, data) => sseSend(res, event, data));
          sseSend(res, 'done', `Scene ${scene} motion video ready: /motion-video/${sceneVideoFile(scene)} (${result.model})`);
        } catch (e) {
          if (signal.aborted) { console.log(`[motion-video scene ${scene}] cancelled`); return; }
          log(`error: ${e.message}`);
          sseSend(res, 'error', e.message);
        }
      });
      res.end();
      return;
    }

    res.writeHead(404).end('not found');
  } catch (err) {
    sendJson(res, 500, { error: String(err.message ?? err) });
  }
});

// Rebuild a project's bundle whenever one of its plan inputs changes on disk — including edits
// made outside the panel (IDE, a skill, a CLI script) and to projects that are not active, which
// no API call would otherwise notice. Debounced per project: one save often lands as several
// write events, and the panel's own multi-field edits arrive in bursts.
const WATCHED_INPUT = /^([a-z0-9][a-z0-9-]*)\/(scene-plan\.md|branding\.json|characters\/[^/]+\/profile\.json)$/;
const REBUILD_DEBOUNCE_MS = 1500;
const pendingRebuilds = new Map();
const watchProjectInputs = () => {
  watch(PROJECTS_DIR, { recursive: true }, (_event, filename) => {
    const slug = WATCHED_INPUT.exec(filename ?? '')?.[1];
    if (!slug || !existsSync(projectPaths(slug).planMd)) return;
    clearTimeout(pendingRebuilds.get(slug));
    pendingRebuilds.set(slug, setTimeout(() => {
      pendingRebuilds.delete(slug);
      rebuildBundles((_kind, line) => console.log(`[watch ${slug}] ${line}`), slug);
    }, REBUILD_DEBOUNCE_MS));
  });
};

server.listen(PORT, '127.0.0.1', () => {
  watchProjectInputs();
  process.stdout.write(`Review UI on http://127.0.0.1:${PORT}  (project: ${P.slug} — approve visuals, then audio is generated)\n`);
});
