// Local review UI server for the per-scene image gate (the mandatory "approve visuals
// before audio" step). No framework — Node's built-in http only. Serves one self-contained
// control-panel page plus a small JSON/SSE API:
//
//   GET  /                    → the control panel (scripts/review-panel.html)
//   GET  /panel.css|/panel.js|/timeline.js → the panel's stylesheet and scripts
//   GET  /api/state           → scenes from src/scene-plan.json + which images exist
//   GET  /images/scene-NN.jpg → serve the current scene image (no-cache so regen shows)
//   GET  /characters/<file>   → serve a character reference/puppet image for the active project
//   GET  /api/projects        → list every projects/<slug> + which one is active
//   POST /api/project         → { slug } → switch the active project, reparse
//   POST /api/project-create  → { slug, title, aspect?, template?, plan? } → new project from a
//                               pasted scene-plan.md, or scaffolded from projects/_template
//   POST /api/prompt          → { scene, prompt } → write prompt back into the plan .md, reparse
//   POST /api/narration       → { scene, narration } → write narration back into the plan .md, reparse
//   POST /api/scenes-update   → { scenes:[{scene,narration?,cue?,char?,prompt?,prompt_vi?,motion?,motion_vi?}] } bulk patch (full-script editor + JSON import)
//   POST /api/scene-field     → { scene, field, value } → write title|cue|host|char back into the plan .md
//   POST /api/character-create → { id, name } → add a character to the plan + create its profile.json
//   POST /api/character-upload?id=<id> → raw image body → set/replace that character's reference image
//   POST /api/generate-puppets → { id? } → spawn generate-puppet-references.mjs, stream its log over SSE
//   POST /api/generate-prompt → { scene } → write that scene's image + motion prompt from narration via OpenAI
//   POST /api/generate-prompts-batch → { scenes:[...] } → same, sequential, streamed over SSE
//   POST /api/generate        → { scene } → run Replicate for that one AI scene
//   POST /api/upload?scene=N  → raw image body → use the user's own photo for that scene
//   POST /api/upload-motion-video?scene=N → raw MP4/MOV body → replace that scene's motion video
//   POST /api/remove-motion-video → { scene } → remove clip and use the source image instead
//   POST /api/approve         → spawn generate-narration.mjs, stream its log over SSE
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
//
// Run: node scripts/review-server.mjs   (then open http://127.0.0.1:8080)
// Env: REVIEW_PORT (default 8080). Reuses REPLICATE_* from ./.env via replicate-image.mjs.

import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateSceneImage, loadEnv, upsertManifest, manifestPath, getTemplates, saveTemplates, activateTemplateVersion, listTemplateVersions, setProjectPaths as setImageProjectPaths, IMAGE_MODELS, assemblePrompt, SEEDREAM_PROMPT_LIMIT } from './lib/replicate-image.mjs';
import { buildMotionPrompt, generateSceneVideo, MOTION_VIDEO_MODELS } from './lib/motion-video.mjs';
import { activePaths, ensureProjectDirs, isValidSlug, listProjects, projectPaths, projectTitle, sceneBase, setActiveSlug } from './lib/project-paths.mjs';
import { ASPECTS, aspectInfo, parsePlanAspect } from './lib/aspect.mjs';
import { addCharacterToPlan, appendScene, hasSceneHeading, mergeScenes, readPlanHeader, writeCharacterPath, writePlanHeader, writeSceneField } from './lib/plan-writer.mjs';
import { withAvailability } from './lib/providers.mjs';
import { buildCharacterContext, generateScenePrompt } from './lib/prompt-writer.mjs';
import { listServices, restartService, startService, stopService } from './lib/local-services.mjs';
import { readBranding, writeBranding } from './lib/branding.mjs';
import { previewBundle } from './lib/preview-bundle.mjs';

loadEnv();

// Motion prompt priority: a per-scene `motion:` authored in the scene plan wins over the
// auto-built one (narration + image prompt). Lets lsvn ship hand-tuned image-to-video prompts.
const sceneMotionPrompt = (scene) =>
  scene.image?.motion?.trim() ||
  buildMotionPrompt({ narration: scene.narration ?? '', scenePrompt: scene.image?.prompt ?? '' });

const PORT = Number(process.env.REVIEW_PORT ?? 9000);
// Fixed mirrors Remotion statically imports — regenerated by reparse() on every project switch.
const PLAN_JSON = 'src/scene-plan.json';
const TEMPLATE_MD = join('projects', '_template', 'scene-plan.md');
const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL = join(HERE, 'review-panel.html');
// The panel's stylesheet and script, served as-is next to the page.
const PANEL_ASSETS = {
  '/panel.css': ['review-panel.css', 'text/css; charset=utf-8'],
  '/panel.js': ['review-panel.js', 'text/javascript; charset=utf-8'],
  '/timeline.js': ['review-timeline.js', 'text/javascript; charset=utf-8'],
  '/brand-logo.svg': ['../public/brand/logo.svg', 'image/svg+xml'],
};

// The active project's paths. Mutable: POST /api/project and /api/project-create reassign it,
// which is why every handler below reads through `P` instead of a frozen const.
let P = activePaths();
setImageProjectPaths(P);
// The active project's aspect ('9:16' default, '16:9', …), read fresh from its plan so image/video
// generation and the upload check match the composition ratio even right after a project switch.
const activeAspect = () => (existsSync(P.planMd) ? parsePlanAspect(readFileSync(P.planMd, 'utf8')) : '9:16');

const sceneFile = (n) => `${sceneBase(n)}.jpg`;
const audioFile = (n) => `${sceneBase(n)}.mp3`;
const sceneVideoFile = (n) => `${sceneBase(n)}.mp4`;
const outMp4 = () => join(P.outDir, `${P.slug}.mp4`);
// Written by wrap-vertical.mjs from a 16:9 master (same name it uses).
const outMp4Vertical = () => join(P.outDir, `${P.slug}-9x16.mp4`);
// Export formats a 16:9 project can render: the YouTube master alone, or the master plus its
// Shorts/TikTok wrap (the panel picks it from the timeline's preview mode).
const RENDER_FORMATS = ['wide', 'vertical'];
const imagePathFor = (n) => join(P.imageDir, sceneFile(n));
const motionPathFor = (n) => join(P.sceneVideoDir, sceneVideoFile(n));

// One-level undo for scene media: before an overwrite (generate/upload/motion) we snapshot the
// current file to a sibling `.bak`; /api/undo restores it. A second overwrite replaces the
// snapshot, so only the most recent change is reversible.
//
// The scene image also carries a manifest entry (authenticity: AI vs USER_UPLOAD, characters),
// so its snapshot includes a `.bak.json` sidecar to keep the tag correct after an undo.
const backupImage = (n) => {
  const img = imagePathFor(n);
  if (!existsSync(img)) return; // first generation — nothing to revert to
  copyFileSync(img, `${img}.bak`);
  const manifest = existsSync(manifestPath()) ? JSON.parse(readFileSync(manifestPath(), 'utf8')) : [];
  const entry = manifest.find((m) => m.id === sceneBase(n)) ?? null;
  writeFileSync(`${img}.bak.json`, JSON.stringify(entry));
};
const backupMotion = (n) => {
  const v = motionPathFor(n);
  if (existsSync(v)) copyFileSync(v, `${v}.bak`);
};
const undoImage = (n) => {
  const img = imagePathFor(n);
  if (!existsSync(`${img}.bak`)) return false;
  renameSync(`${img}.bak`, img);
  const sidecar = `${img}.bak.json`;
  if (existsSync(sidecar)) {
    const entry = JSON.parse(readFileSync(sidecar, 'utf8'));
    if (entry) upsertManifest(entry); // restore authenticity + characters for the prior image
    unlinkSync(sidecar);
  }
  return true;
};
const undoMotion = (n) => {
  const v = motionPathFor(n);
  if (!existsSync(`${v}.bak`)) return false;
  renameSync(`${v}.bak`, v);
  return true;
};

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
const optimizeCharacterImage = (source, target) => {
  execFileSync('ffmpeg', [
    '-y', '-i', source,
    '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=1024:1024:flags=lanczos",
    '-frames:v', '1', '-q:v', '3', target,
  ], { stdio: 'pipe' });
};
// Rebuild shared JSON from active project's markdown before every read. Prevents stale scene N
// data leaking across project switches or external narration imports.
const readPlan = () => {
  reparse();
  return JSON.parse(readFileSync(PLAN_JSON, 'utf8'));
};

// Which scenes use a user-uploaded photo vs an AI reconstruction, read from the manifest
// (the single source of truth for authenticity). Returns { [scene]: authenticity }.
const readAuthenticity = () => {
  if (!existsSync(manifestPath())) return {};
  const rows = JSON.parse(readFileSync(manifestPath(), 'utf8'));
  return Object.fromEntries(rows.map((r) => [r.scene, r.authenticity]));
};

// Reparse the active project's scene-plan.md → scene-plan.json + narration-segments.mjs +
// characters-data.json + asset-manifest.json (same as the CLI step).
const reparse = () => execFileSync('node', [join(HERE, 'parse-scene-plan.mjs'), P.planMd], { stdio: 'ignore' });

// Rebuild the active project's Remotion bundle (src/projects-data) so newly generated audio,
// motion clips, or a switched/created project show up in the studio without a manual
// build-remotion run. Only the active project is rebuilt — the other bundles on disk stay in the
// index untouched, so a rebuild costs seconds instead of re-measuring every project.
// SSE callers pass `send` so the browser sees the rebuild step. Always resolves — a rebuild
// failure is surfaced as a log line, never as a failure of the job or API call that asked for it.
// Rebuilds are chained, never concurrent: two jobs finishing close together (e.g. an audio batch
// and a motion clip) would otherwise run build-remotion.mjs at once and race on the same files.
let rebuildChain = Promise.resolve();
const rebuildBundles = (send = () => {}) => {
  const slug = P.slug;
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

// Generation jobs still running server-side. A job outlives its browser connection (the scene
// already in flight finishes after a cancel), and every job writes through the active project's
// paths — so a project switch while this is non-zero would land its files in the wrong project.
let activeJobs = 0;
const trackJob = async (work) => {
  activeJobs++;
  try { await work(); } finally { activeJobs--; }
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
  const title = existsSync(P.planMd) ? (readFileSync(P.planMd, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Scenes') : 'Scenes';

  const sceneCharMap = new Map();
  for (const s of scenes) for (const id of s.image.characters ?? []) {
    sceneCharMap.set(id, [...(sceneCharMap.get(id) ?? []), s.scene]);
  }
  const charactersData = existsSync('src/characters-data.json')
    ? JSON.parse(readFileSync('src/characters-data.json', 'utf8')).characters
    : [];
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
    project: { slug: P.slug, title, aspect: activeAspect(), template: templates.activeVersion },
    // Corner logo + watermark, so the timeline preview shows what the render will draw.
    branding: readBranding(P.slug),
    imageModels: withAvailability(IMAGE_MODELS),
    motionVideoModels: withAvailability(MOTION_VIDEO_MODELS),
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
        motionPrompt: sceneMotionPrompt(s),
        // Raw authored `motion:` (empty when the scene has none) — the full-script editor writes
        // this field verbatim, unlike motionPrompt which falls back to an auto-built prompt.
        motion: s.image.motion ?? '',
        motionVi: s.image.motionVi ?? '',
        query: s.image.query ?? '',
        characters: s.image.characters ?? [],
        hasImage: has,
        imageUrl: has ? `/images/${file}?v=${statSync(path).mtimeMs}` : null,
        hasAudio,
        audioUrl: hasAudio ? `/audio/${audioFile(s.scene)}?v=${statSync(apath).mtimeMs}` : null,
        hasMotionVideo,
        motionVideoUrl: hasMotionVideo ? `/motion-video/${sceneVideoFile(s.scene)}?v=${statSync(motionPath).mtimeMs}` : null,
        hasImageBackup: existsSync(`${path}.bak`),
        hasMotionBackup: existsSync(`${motionPath}.bak`),
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

// Aborts when the browser drops the stream before it is finished — the panel's Cancel, or a closed
// tab. Watches `res`, not `req`: once the request body has been read, req never emits 'close'
// again, so a req listener attached after readBody() would never fire.
const disconnectSignal = (res) => {
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  return controller.signal;
};

// Run generate-narration.mjs (optionally for specific scene numbers) and stream its log to the
// browser as SSE. Shared by "generate one scene" and "approve → all scenes". Resolves once the
// child has exited (and the bundle is rebuilt), so trackJob counts the whole run.
const streamNarration = (res, args, startMsg) => new Promise((resolve) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('log', startMsg);
  const child = spawn('node', [join(HERE, 'generate-narration.mjs'), ...args], { cwd: process.cwd() });
  const pipe = (stream) => stream.on('data', (b) => b.toString().split('\n').filter(Boolean).forEach((line) => send('log', line)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('close', async (code) => {
    if (code !== 0) { send('error', `Exited with code ${code}`); res.end(); resolve(); return; }
    await rebuildBundles(send); // new audio → refresh hasAudio/durations/captions in the bundle
    send('done', 'Audio generation finished.');
    res.end();
    resolve();
  });
  disconnectSignal(res).addEventListener('abort', () => { if (!child.killed) child.kill(); });
});

// --- shared SSE helpers --------------------------------------------------------------------
const sseHead = (res) => res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
const sseSend = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

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
  disconnectSignal(res).addEventListener('abort', () => { if (!child.killed) child.kill(); });
});

// Run shell steps in order, streaming each step's log; stop at the first non-zero exit.
// Resolves once the last step (or the aborted one) has exited.
const runSteps = (res, steps, doneMsg) => {
  sseHead(res);
  let current = null;
  const signal = disconnectSignal(res);
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
  const signal = disconnectSignal(res);
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
      backupImage(n); // snapshot the current image so /api/undo can restore it
      const { via } = await generateSceneImage(target, plan.characters, { model, signal, onLog: (line) => sseSend(res, 'log', `  ${line}`) });
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
  const signal = disconnectSignal(res);
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
      backupMotion(n);
      await generateSceneVideo({
        scene: n,
        imagePath,
        outputDir: P.sceneVideoDir,
        prompt: sceneMotionPrompt(target),
        model,
        audioSeconds,
        aspect: activeAspect(),
        signal,
        onLog: (line) => sseSend(res, 'log', `  ${line}`),
      });
      ok++;
      sseSend(res, 'log', `✓ scene ${n} motion video ready — ${ok}/${sceneNos.length} video thành công`);
    } catch (e) {
      if (signal.aborted) { console.log(`[motion batch] cancelled at scene ${n}`); break; }
      sseSend(res, 'log', `✗ scene ${n}: ${e.message}`);
    }
  }
  if (ok) {
    reparse();
    await rebuildBundles((event, data) => sseSend(res, event, data));
  }
  sseSend(res, ok === attempted ? 'done' : 'error', `Generated ${ok}/${attempted} motion video(s).`);
  res.end();
};

// Write prompts for several AI scenes in turn via OpenAI (scripts/lib/prompt-writer.mjs). One
// LLM call per scene, sequential; a failure on one does not abort the rest. Reparses once at the
// end so every written prompt shows up together.
const generatePromptsBatch = async (res, sceneNos) => {
  sseHead(res);
  const signal = disconnectSignal(res);
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
      const { text, vi, motion, motionVi } = await generateScenePrompt({ narration: target.narration, characters, identity: target.image.identity, context });
      writeSceneField(P.planMd, n, 'prompt', text);
      writeSceneField(P.planMd, n, 'prompt_vi', vi);
      if (motion) writeSceneField(P.planMd, n, 'motion', motion);
      if (motionVi) writeSceneField(P.planMd, n, 'motion_vi', motionVi);
      ok++;
      sseSend(res, 'log', `✓ scene ${n}: ${text.slice(0, 90)}${text.length > 90 ? '…' : ''}`);
    } catch (e) { sseSend(res, 'log', `✗ scene ${n}: ${e.message}`); }
  }
  if (ok) reparse();
  sseSend(res, ok === attempted ? 'done' : 'error', `Wrote ${ok}/${attempted} prompt(s).`);
  res.end();
};

// Switch the active project: persist it, point every path at it, reparse, and rebuild the
// Remotion bundles so the Studio shows this project (measured durations + captions when its audio
// is complete). Never triggers TTS itself (OmniVoice may not be running).
const activateProject = async (slug) => {
  setActiveSlug(slug);
  P = projectPaths(slug);
  setImageProjectPaths(P);
  syncProjectTemplate();
  reparse();
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

// The prompt-template version is one global setting, but projects use different styles (chibi,
// pixar, flat…). A project records its style as a `template:` header line, and becoming active
// re-activates that version so its images keep their look. A project without the line (or naming
// a version that no longer exists) keeps whatever version is active.
const syncProjectTemplate = () => {
  if (!existsSync(P.planMd)) return;
  const version = readPlanHeader(readFileSync(P.planMd, 'utf8'), 'template');
  if (!version || version === getTemplates().activeVersion) return;
  if (!listTemplateVersions().includes(version)) {
    process.stdout.write(`⚠ ${P.slug}: template "${version}" not found, keeping "${getTemplates().activeVersion}"\n`);
    return;
  }
  activateTemplateVersion(version);
};

// Remember the active template version on the active project (see syncProjectTemplate).
const recordProjectTemplate = (version) => {
  if (existsSync(P.planMd)) writePlanHeader(P.planMd, 'template', version);
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
      const { slug, title, aspect, template, plan } = await readBody(req);
      if (activeJobs > 0) { sendJson(res, 409, { error: JOBS_RUNNING_ERROR }); return; }
      if (!isValidSlug(slug)) { sendJson(res, 400, { error: 'slug must be lowercase letters, numbers and hyphens' }); return; }
      const target = projectPaths(slug);
      if (existsSync(target.planMd)) { sendJson(res, 400, { error: `project "${slug}" already exists` }); return; }
      if (aspect !== undefined && !ASPECTS[aspect]) { sendJson(res, 400, { error: `tỉ lệ khung phải là ${Object.keys(ASPECTS).join(', ')}` }); return; }
      if (template !== undefined && !listTemplateVersions().includes(template)) { sendJson(res, 400, { error: `không có style version "${template}"` }); return; }
      const content = buildNewPlan({ slug, title, plan });
      if (content.error) { sendJson(res, 400, { error: content.error }); return; }
      mkdirSync(dirname(target.planMd), { recursive: true });
      writeFileSync(target.planMd, content.text);
      if (aspect) writePlanHeader(target.planMd, 'aspect', aspect);
      if (template) writePlanHeader(target.planMd, 'template', template);
      ensureProjectDirs(target);
      await activateProject(slug);
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
      recordProjectTemplate(templates.activeVersion);
      sendJson(res, 200, { ok: true, templates, activeVersion: templates.activeVersion, versions: listTemplateVersions() });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/templates/activate') {
      const body = await readBody(req);
      if (typeof body.version !== 'string') { sendJson(res, 400, { error: 'version required' }); return; }
      if (!listTemplateVersions().includes(body.version)) { sendJson(res, 400, { error: `Unknown template version: ${body.version}` }); return; }
      const templates = activateTemplateVersion(body.version);
      recordProjectTemplate(templates.activeVersion);
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
      reparse();
      sendJson(res, 200, { ok: true, scene, narration: clean });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/prompt') {
      const { scene, prompt } = await readBody(req);
      if (!Number.isFinite(scene) || typeof prompt !== 'string') { sendJson(res, 400, { error: 'scene + prompt required' }); return; }
      const clean = writeSceneField(P.planMd, scene, 'prompt', prompt);
      // prompt_vi is left intact: the author edits the translation deliberately (in the full-script
      // editor or via "Dịch"), so a hand-edited English prompt never silently drops its translation.
      reparse();
      sendJson(res, 200, { ok: true, scene, prompt: clean });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/scenes-update') {
      // Bulk patch writer for the full-script editor and its JSON import. Each row is a partial
      // patch keyed by scene: only the fields present are written, verbatim, with no derived-field
      // clearing (a prompt edit keeps prompt_vi, a narration edit keeps the prompt, etc.). New
      // scene numbers are appended. `char` accepts an id/comma-string/array/"both"/"none".
      const STRING_FIELDS = ['narration', 'cue', 'prompt', 'prompt_vi', 'motion', 'motion_vi'];
      const body = await readBody(req);
      const rows = Array.isArray(body) ? body : Array.isArray(body?.scenes) ? body.scenes : null;
      if (!rows || !rows.length) { sendJson(res, 400, { error: 'expected an array of {scene, ...fields} or {scenes:[...]}' }); return; }
      const charIds = Object.keys(readPlan().characters ?? {});
      const errors = [];
      const charByScene = new Map(); // scene → normalized comma id string (only when char provided)
      rows.forEach((row, i) => {
        if (!row || !Number.isFinite(row.scene) || row.scene < 1) { errors.push(`row ${i}: scene must be a positive number`); return; }
        for (const f of STRING_FIELDS) {
          if (f in row && typeof row[f] !== 'string') errors.push(`row ${i} (scene ${row.scene}): ${f} must be a string`);
        }
        // narration may not be blanked; new scenes must carry one.
        const isNew = !hasSceneHeading(P.planMd, row.scene);
        if (('narration' in row && typeof row.narration === 'string' && !row.narration.trim()) || (isNew && !(typeof row.narration === 'string' && row.narration.trim()))) {
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
          for (const f of STRING_FIELDS) if (f in row) writeSceneField(P.planMd, row.scene, f, row[f]);
          if (char !== undefined) writeSceneField(P.planMd, row.scene, 'char', char);
          updated.push(row.scene);
        } else {
          appendScene(P.planMd, row.scene, { ...row, char });
          appended.push(row.scene);
        }
      }
      reparse();
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
      reparse();
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/merge-scenes') {
      // Merge two or more adjacent scenes into one: narration is concatenated into `keep`
      // (or the lowest scene number when omitted), every other scene's block — prompt, char,
      // motion, cue, its generated image/audio/video files stay on disk but drop out of the
      // plan — is deleted outright. Scenes must be contiguous in the current plan; merging
      // across a gap would silently swallow whatever sits between them.
      const { scenes, keep, narration } = await readBody(req);
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
      let mergedNarration;
      try {
        // mergeScenes always writes its own auto-joined narration first; an edited preview from
        // the merge dialog then overwrites it, so a hand-tightened join is never lost.
        mergedNarration = mergeScenes(P.planMd, nums, keepScene);
        if (typeof narration === 'string' && narration.trim() && narration.trim() !== mergedNarration) {
          mergedNarration = writeSceneField(P.planMd, keepScene, 'narration', narration);
        }
      } catch (e) {
        sendJson(res, 400, { error: e.message });
        return;
      }
      reparse();
      await rebuildBundles();
      sendJson(res, 200, { ...buildState(), mergedScene: keepScene, mergedNarration });
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
      reparse();
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
      const targetPath = relPath.replace(/\.[^.]+$/, '.jpg');
      const uploadPath = `${targetPath}.upload`;
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(uploadPath, buf);
      try {
        optimizeCharacterImage(uploadPath, targetPath);
      } finally {
        if (existsSync(uploadPath)) unlinkSync(uploadPath);
      }
      if (targetPath !== relPath) {
        writeCharacterPath(P.planMd, id, targetPath);
      }
      reparse();
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
      reparse(); // characters-data.json picks up display_name/aliases for the gallery
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-puppets') {
      const { id } = await readBody(req);
      const args = id ? [String(id)] : [];
      trackJob(() => streamPuppets(res, args, id ? `Generating puppet for ${id}...` : 'Generating puppet references for every character...'));
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
      await trackJob(async () => {
        const { text, vi, motion, motionVi } = await generateScenePrompt({ narration: target.narration, characters, identity: target.image.identity, context });
        writeSceneField(P.planMd, scene, 'prompt', text);
        writeSceneField(P.planMd, scene, 'prompt_vi', vi);
        // Skipped when the reply had no motion sections, so a hand-authored `motion:` is not lost.
        if (motion) writeSceneField(P.planMd, scene, 'motion', motion);
        if (motionVi) writeSceneField(P.planMd, scene, 'motion_vi', motionVi);
        reparse();
        sendJson(res, 200, { ok: true, scene, prompt: text, promptVi: vi, motion, motionVi });
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-prompts-batch') {
      const { scenes } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(() => generatePromptsBatch(res, list));
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
      const signal = disconnectSignal(res);
      await trackJob(async () => {
        try {
          log(`▶ generating scene ${scene}${model ? ` (model=${model})` : ' (auto route by reference count)'}`);
          backupImage(scene); // snapshot the current image so /api/undo can restore it
          const { via } = await generateSceneImage(target, plan.characters, { model, signal, onLog: log });
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
      backupImage(scene); // snapshot the current image so /api/undo can restore it
      writeFileSync(path, buf);
      // Record the user's photo as the scene asset so it is never mislabelled as AI.
      upsertManifest({
        id: file.replace(/\.[^.]+$/, ''), scene, type: 'user_upload',
        subject: `User-uploaded image for scene ${scene}`, source: 'User upload (review UI)', sourceUrl: null,
        license: 'Provided by the user; ensure you hold the rights to use it.',
        credit: 'User-provided image', authenticity: 'USER_UPLOAD',
        characters: target.image.characters ?? [],
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
        backupMotion(scene);
        renameSync(uploadPath, path);
      } catch (error) {
        if (existsSync(uploadPath)) unlinkSync(uploadPath);
        sendJson(res, 400, { error: error.message });
        return;
      }
      reparse();
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
      trackJob(() => streamNarration(res, [String(scene)], `Generating audio for scene ${scene}...`));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/audio-batch') {
      // Generate audio for several scenes in one OmniVoice run (generate-narration accepts a list).
      const { scenes } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(() => streamNarration(res, list.map(String), `Generating audio for scenes ${list.join(', ')}...`));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-batch') {
      // Generate images for several selected AI scenes in turn.
      const { scenes, model } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(() => generateImagesBatch(res, list, model));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-motion-videos-batch') {
      const { scenes, model } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      trackJob(() => generateMotionVideosBatch(res, list, model));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/approve') {
      // Stream generate-narration.mjs (all scenes) to the browser as it runs (SSE).
      trackJob(() => streamNarration(res, [], 'Approved. Generating narration audio (all scenes)...'));
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
      trackJob(() => runSteps(res, [
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

    if (req.method === 'POST' && pathname === '/api/undo') {
      // Restore the previous scene image or motion video from its `.bak` snapshot (see backupImage/
      // backupMotion). One level deep; 400 when there is nothing to revert.
      const { scene, kind } = await readBody(req);
      if (!Number.isFinite(scene) || !['image', 'motion'].includes(kind)) {
        sendJson(res, 400, { error: "scene + kind ('image'|'motion') required" });
        return;
      }
      const restored = kind === 'image' ? undoImage(scene) : undoMotion(scene);
      if (!restored) { sendJson(res, 400, { error: `nothing to undo for scene ${scene} ${kind}` }); return; }
      if (kind === 'motion') { reparse(); await rebuildBundles(); }
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
      backupMotion(scene);
      unlinkSync(videoPath);
      reparse();
      await rebuildBundles();
      sendJson(res, 200, buildState());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-motion-video') {
      const { scene, prompt, model, duration } = await readBody(req);
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
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
      const signal = disconnectSignal(res);
      await trackJob(async () => {
        try {
          const motionPrompt = prompt || sceneMotionPrompt(target);
          log(`motion prompt: ${motionPrompt.replace(/\s+/g, ' ').slice(0, 700)}`);
          log(`audio duration: ${audioSeconds.toFixed(1)}s`);
          if (Number.isFinite(duration) && duration > 0) log(`requested duration override: ${duration}s (snapped to the model's allowed lengths)`);
          backupMotion(scene); // snapshot the current motion video so /api/undo can restore it
          const result = await generateSceneVideo({ scene, imagePath, outputDir: P.sceneVideoDir, prompt: motionPrompt, model, audioSeconds, duration, aspect: activeAspect(), signal, onLog: log });
          // The final Remotion render plays this clip in place of the scene image — reparse +
          // rebuild so the bundle's motionVideo flag flips on without a separate manual step.
          reparse();
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

syncProjectTemplate();
server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Review UI on http://127.0.0.1:${PORT}  (project: ${P.slug} — approve visuals, then audio is generated)\n`);
});
