// Local review UI server for the per-scene image gate (the mandatory "approve visuals
// before audio" step). No framework — Node's built-in http only. Serves one self-contained
// control-panel page plus a small JSON/SSE API:
//
//   GET  /                    → the control panel (scripts/review-panel.html)
//   GET  /panel.css|/panel.js → the panel's stylesheet and script
//   GET  /api/state           → scenes from src/scene-plan.json + which images exist
//   GET  /images/scene-NN.jpg → serve the current scene image (no-cache so regen shows)
//   POST /api/prompt          → { scene, prompt } → write prompt back into the plan .md, reparse
//   POST /api/generate        → { scene } → run Replicate for that one AI scene
//   POST /api/upload?scene=N  → raw image body → use the user's own photo for that scene
//   POST /api/approve         → spawn generate-narration.mjs, stream its log over SSE
//
// Run: node scripts/review-server.mjs   (then open http://127.0.0.1:8080)
// Env: REVIEW_PORT (default 8080). Reuses REPLICATE_* from ./.env via replicate-image.mjs.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateSceneImage, loadEnv, upsertManifest, MANIFEST, getTemplates, saveTemplates } from './lib/replicate-image.mjs';

loadEnv();

const PORT = Number(process.env.REVIEW_PORT ?? 8080);
const PLAN_MD = 'scene-plan.md';
const PLAN_JSON = 'src/scene-plan.json';
const IMAGE_DIR = 'public/images';
const AUDIO_DIR = 'public/audio';
const OUT_DIR = 'out';
const OUT_MP4 = `${OUT_DIR}/ScenePlanVideo.mp4`;
const FPS = 30;
const HERE = dirname(fileURLToPath(import.meta.url));
const PANEL = join(HERE, 'review-panel.html');
// The panel's stylesheet and script, served as-is next to the page.
const PANEL_ASSETS = {
  '/panel.css': ['review-panel.css', 'text/css; charset=utf-8'],
  '/panel.js': ['review-panel.js', 'text/javascript; charset=utf-8'],
};

const sceneFile = (n) => `scene-${String(n).padStart(2, '0')}.jpg`;
const audioFile = (n) => `scene-${String(n).padStart(2, '0')}.mp3`;
const sceneVideoFile = (n) => `scene-${String(n).padStart(2, '0')}.mp4`;
const readPlan = () => JSON.parse(readFileSync(PLAN_JSON, 'utf8'));

// Which scenes use a user-uploaded photo vs an AI reconstruction, read from the manifest
// (the single source of truth for authenticity). Returns { [scene]: authenticity }.
const readAuthenticity = () => {
  if (!existsSync(MANIFEST)) return {};
  const rows = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  return Object.fromEntries(rows.map((r) => [r.scene, r.authenticity]));
};

// Reparse scene-plan.md → scene-plan.json + narration-segments.mjs (same as the CLI step).
const reparse = () => execFileSync('node', [join(HERE, 'parse-scene-plan.mjs'), PLAN_MD], { stdio: 'ignore' });

// Write a scene's prompt back into scene-plan.md under its "## scene N" heading, replacing an
// existing `prompt:` line or inserting one after `narration:`. Leaves every other line intact.
const writePromptToPlan = (sceneNo, prompt) => {
  const clean = prompt.replace(/\s*\n\s*/g, ' ').trim();
  const lines = readFileSync(PLAN_MD, 'utf8').split('\n');
  const headRe = new RegExp(`^##\\s+scene\\s+${sceneNo}\\b`, 'i');
  const start = lines.findIndex((l) => headRe.test(l.trim()));
  if (start < 0) throw new Error(`scene ${sceneNo} not found in ${PLAN_MD}`);
  let end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l));
  if (end < 0) end = lines.length;

  const promptLine = `prompt: ${clean}`;
  const pi = lines.findIndex((l, i) => i > start && i < end && /^prompt\s*:/i.test(l));
  if (pi >= 0) {
    lines[pi] = promptLine;
    // Prompt is a single parser field. Remove stale markdown continuation lines
    // left by older saves, while preserving any recognized scene fields after it.
    const fieldRe = /^(time|char|identity|narration|prompt|search|title|cue|host)\s*:/i;
    let next = pi + 1;
    while (next < end && (!lines[next].trim() || !fieldRe.test(lines[next].trim()))) next++;
    lines.splice(pi + 1, next - pi - 1);
  } else {
    const ni = lines.findIndex((l, i) => i > start && i < end && /^narration\s*:/i.test(l));
    lines.splice((ni >= 0 ? ni : start) + 1, 0, promptLine);
  }
  writeFileSync(PLAN_MD, lines.join('\n'));
  return clean;
};

// Write a scene's narration back into scene-plan.md, replacing its single `narration:` line.
// Narration must stay one line (the parser reads it per line), so newlines collapse to spaces.
const writeNarrationToPlan = (sceneNo, narration) => {
  const clean = narration.replace(/\s*\n\s*/g, ' ').trim();
  const lines = readFileSync(PLAN_MD, 'utf8').split('\n');
  const headRe = new RegExp(`^##\\s+scene\\s+${sceneNo}\\b`, 'i');
  const start = lines.findIndex((l) => headRe.test(l.trim()));
  if (start < 0) throw new Error(`scene ${sceneNo} not found in ${PLAN_MD}`);
  let end = lines.findIndex((l, i) => i > start && /^##\s+/.test(l));
  if (end < 0) end = lines.length;
  const ni = lines.findIndex((l, i) => i > start && i < end && /^narration\s*:/i.test(l));
  const narrationLine = `narration: ${clean}`;
  if (ni >= 0) lines[ni] = narrationLine;
  else lines.splice(start + 1, 0, narrationLine);
  writeFileSync(PLAN_MD, lines.join('\n'));
  return clean;
};

// Build the per-scene view the panel renders: prompt, char refs, image kind, whether the
// image/audio exist yet (with an mtime cache-buster so a regenerated file reloads).
const buildState = () => {
  const { characters, scenes } = readPlan();
  const authenticity = readAuthenticity();
  return {
    title: existsSync(PLAN_MD) ? (readFileSync(PLAN_MD, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Scenes') : 'Scenes',
    scenes: scenes.map((s) => {
      const file = sceneFile(s.scene);
      const path = join(IMAGE_DIR, file);
      const has = existsSync(path);
      const apath = join(AUDIO_DIR, audioFile(s.scene));
      const hasAudio = existsSync(apath);
      const vpath = join(OUT_DIR, sceneVideoFile(s.scene));
      const hasSceneVideo = existsSync(vpath);
      // uploaded photo, AI reconstruction, or a sourced search image — drives the AI tag.
      const source = authenticity[s.scene] === 'USER_UPLOAD' ? 'upload' : s.image.kind;
      return {
        scene: s.scene,
        narration: s.narration ?? '',
        kind: s.image.kind,
        source,
        prompt: s.image.prompt ?? '',
        query: s.image.query ?? '',
        characters: s.image.characters ?? [],
        hasImage: has,
        imageUrl: has ? `/images/${file}?v=${statSync(path).mtimeMs}` : null,
        hasAudio,
        audioUrl: hasAudio ? `/audio/${audioFile(s.scene)}?v=${statSync(apath).mtimeMs}` : null,
        hasSceneVideo,
        sceneVideoUrl: hasSceneVideo ? `/scene-video/${sceneVideoFile(s.scene)}?v=${statSync(vpath).mtimeMs}` : null,
      };
    }),
    characters,
  };
};

// --- tiny http helpers ---------------------------------------------------------------------
const sendJson = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
};
const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
});
const MAX_UPLOAD = 15 * 1024 * 1024; // 15 MB — a still image, not a video
const readRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_UPLOAD) { reject(new Error('Image too large (max 15 MB).')); req.destroy(); return; }
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

// Run generate-narration.mjs (optionally for specific scene numbers) and stream its log to the
// browser as SSE. Shared by "generate one scene" and "approve → all scenes".
const streamNarration = (req, res, args, startMsg) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('log', startMsg);
  const child = spawn('node', [join(HERE, 'generate-narration.mjs'), ...args], { cwd: process.cwd() });
  const pipe = (stream) => stream.on('data', (b) => b.toString().split('\n').filter(Boolean).forEach((line) => send('log', line)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('close', (code) => { send(code === 0 ? 'done' : 'error', code === 0 ? 'Audio generation finished.' : `Exited with code ${code}`); res.end(); });
  req.on('close', () => { if (!child.killed) child.kill(); });
};

// --- shared SSE helpers --------------------------------------------------------------------
const sseHead = (res) => res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
const sseSend = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

// Run shell steps in order, streaming each step's log; stop at the first non-zero exit.
const runSteps = (req, res, steps, doneMsg) => {
  sseHead(res);
  let aborted = false;
  let current = null;
  req.on('close', () => { aborted = true; if (current && !current.killed) current.kill(); });
  (async () => {
    for (const step of steps) {
      if (aborted) return;
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
// image per frame, so scenes run sequentially; a failure on one does not abort the rest.
const generateImagesBatch = async (req, res, sceneNos) => {
  sseHead(res);
  let aborted = false;
  req.on('close', () => { aborted = true; });
  const plan = readPlan();
  let ok = 0;
  let attempted = 0;
  for (const n of sceneNos) {
    if (aborted) return;
    const target = plan.scenes.find((s) => s.scene === n);
    if (!target) { sseSend(res, 'log', `✗ scene ${n} not found`); continue; }
    if (target.image.kind !== 'ai') { sseSend(res, 'log', `• scene ${n} is a search scene — skipped`); continue; }
    if (!target.image.prompt) { sseSend(res, 'log', `✗ scene ${n} has no prompt — skipped`); continue; }
    attempted++;
    sseSend(res, 'log', `▶ generating scene ${n}...`);
    try {
      const { via } = await generateSceneImage(target, plan.characters);
      ok++;
      sseSend(res, 'log', `✓ scene ${n} (${via})`);
    } catch (e) { sseSend(res, 'log', `✗ scene ${n}: ${e.message}`); }
  }
  sseSend(res, ok === attempted ? 'done' : 'error', `Generated ${ok}/${attempted} scene image(s).`);
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

    if (req.method === 'GET' && pathname.startsWith('/images/')) {
      const name = decodeURIComponent(pathname.slice('/images/'.length));
      const path = join(IMAGE_DIR, name);
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
      const path = join(AUDIO_DIR, name);
      if (!name.includes('..') && existsSync(path)) {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
        res.end(readFileSync(path));
      } else {
        res.writeHead(404).end('not found');
      }
      return;
    }

    // The finished render, so the panel can offer a play/download link after finalize.
    if (req.method === 'GET' && pathname === '/video') {
      if (!existsSync(OUT_MP4)) { res.writeHead(404).end('no render yet'); return; }
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
      res.end(readFileSync(OUT_MP4));
      return;
    }

    // A per-scene preview render (out/scene-NN.mp4).
    if (req.method === 'GET' && pathname.startsWith('/scene-video/')) {
      const name = decodeURIComponent(pathname.slice('/scene-video/'.length));
      const path = join(OUT_DIR, name);
      if (!name.includes('..') && existsSync(path)) {
        res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
        res.end(readFileSync(path));
      } else {
        res.writeHead(404).end('not found');
      }
      return;
    }

    if (req.method === 'GET' && pathname === '/api/templates') {
      sendJson(res, 200, getTemplates());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/templates') {
      const body = await readBody(req);
      const templates = saveTemplates(body);
      sendJson(res, 200, { ok: true, templates });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/narration') {
      const { scene, narration } = await readBody(req);
      if (!Number.isFinite(scene) || typeof narration !== 'string') { sendJson(res, 400, { error: 'scene + narration required' }); return; }
      if (!narration.trim()) { sendJson(res, 400, { error: 'narration is empty' }); return; }
      const clean = writeNarrationToPlan(scene, narration);
      reparse();
      sendJson(res, 200, { ok: true, scene, narration: clean });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/prompt') {
      const { scene, prompt } = await readBody(req);
      if (!Number.isFinite(scene) || typeof prompt !== 'string') { sendJson(res, 400, { error: 'scene + prompt required' }); return; }
      const clean = writePromptToPlan(scene, prompt);
      reparse();
      sendJson(res, 200, { ok: true, scene, prompt: clean });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate') {
      const { scene } = await readBody(req);
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      if (target.image.kind !== 'ai') { sendJson(res, 400, { error: `scene ${scene} is a search scene, not AI` }); return; }
      if (!target.image.prompt) { sendJson(res, 400, { error: `scene ${scene} has no prompt yet` }); return; }
      const { file, via } = await generateSceneImage(target, plan.characters);
      const path = join(IMAGE_DIR, file);
      sendJson(res, 200, { ok: true, scene, via, imageUrl: `/images/${file}?v=${statSync(path).mtimeMs}` });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/upload') {
      const scene = Number(url.searchParams.get('scene'));
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      const buf = await readRawBody(req);
      if (!isSupportedImage(buf)) { sendJson(res, 400, { error: 'Upload a JPEG, PNG or WebP image.' }); return; }
      const file = sceneFile(scene);
      const path = join(IMAGE_DIR, file);
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

    if (req.method === 'POST' && pathname === '/api/audio') {
      // Generate/regenerate narration audio for one scene (OmniVoice via generate-narration.mjs).
      const { scene } = await readBody(req);
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      if (!target.narration) { sendJson(res, 400, { error: `scene ${scene} has no narration` }); return; }
      streamNarration(req, res, [String(scene)], `Generating audio for scene ${scene}...`);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/audio-batch') {
      // Generate audio for several scenes in one OmniVoice run (generate-narration accepts a list).
      const { scenes } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      streamNarration(req, res, list.map(String), `Generating audio for scenes ${list.join(', ')}...`);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/generate-batch') {
      // Generate images for several selected AI scenes in turn.
      const { scenes } = await readBody(req);
      const list = Array.isArray(scenes) ? scenes.filter((n) => Number.isFinite(n)) : [];
      if (!list.length) { sendJson(res, 400, { error: 'scenes[] required' }); return; }
      generateImagesBatch(req, res, list);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/approve') {
      // Stream generate-narration.mjs (all scenes) to the browser as it runs (SSE).
      streamNarration(req, res, [], 'Approved. Generating narration audio (all scenes)...');
      return;
    }

    if (req.method === 'POST' && pathname === '/api/finalize') {
      // After every image + audio exists: measure durations, align captions, audit, render MP4.
      const plan = readPlan();
      const missImg = plan.scenes.filter((s) => !existsSync(join(IMAGE_DIR, sceneFile(s.scene)))).map((s) => s.scene);
      const missAud = plan.scenes.filter((s) => !existsSync(join(AUDIO_DIR, audioFile(s.scene)))).map((s) => s.scene);
      if (missImg.length || missAud.length) {
        sseHead(res);
        if (missImg.length) sseSend(res, 'log', `✗ missing images: scene ${missImg.join(', ')}`);
        if (missAud.length) sseSend(res, 'log', `✗ missing audio: scene ${missAud.join(', ')}`);
        sseSend(res, 'error', 'Generate every scene image and audio first.');
        res.end();
        return;
      }
      runSteps(req, res, [
        { label: 'Measure audio durations → src/audio-durations.ts', cmd: 'node', args: [join(HERE, 'measure-audio.mjs')] },
        { label: 'Align captions → src/caption-data.ts', cmd: 'node', args: [join(HERE, 'align-captions.mjs')] },
        { label: 'Audit assets', cmd: 'node', args: [join(HERE, 'check-assets.mjs')] },
        { label: 'Render MP4 (this can take several minutes)', cmd: 'npx', args: ['remotion', 'render', 'ScenePlanVideo', OUT_MP4] },
      ], `Finished. Rendered ${OUT_MP4}`);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/render-scene') {
      // Render one scene (its cinematic image + overlay + audio) to out/scene-NN.mp4. Works
      // independently of the full timeline — duration comes from the scene's own audio.
      const { scene } = await readBody(req);
      const plan = readPlan();
      const target = plan.scenes.find((s) => s.scene === scene);
      if (!target) { sendJson(res, 404, { error: `scene ${scene} not found` }); return; }
      if (!existsSync(join(IMAGE_DIR, sceneFile(scene)))) { sendJson(res, 400, { error: `scene ${scene} has no image yet` }); return; }
      if (!existsSync(join(AUDIO_DIR, audioFile(scene)))) { sendJson(res, 400, { error: `scene ${scene} has no audio yet` }); return; }
      let seconds;
      try {
        seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', join(AUDIO_DIR, audioFile(scene))], { encoding: 'utf8' }).trim());
      } catch (e) { sendJson(res, 500, { error: `ffprobe failed: ${e.message}` }); return; }
      const frames = Math.max(1, Math.round(seconds * FPS));
      const out = join(OUT_DIR, sceneVideoFile(scene));
      const props = JSON.stringify({ scene, durationInFrames: frames });
      runSteps(req, res, [
        { label: `Render scene ${scene} MP4 (${seconds.toFixed(1)}s, ${frames}f)`, cmd: 'npx', args: ['remotion', 'render', 'SceneOne', out, `--props=${props}`] },
      ], `Rendered ${out}`);
      return;
    }

    res.writeHead(404).end('not found');
  } catch (err) {
    sendJson(res, 500, { error: String(err.message ?? err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Review UI on http://127.0.0.1:${PORT}  (approve visuals, then audio is generated)\n`);
});
