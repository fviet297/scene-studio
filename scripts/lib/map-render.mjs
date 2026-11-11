// Map scenes drawn by code instead of an image model. A scene whose plan block carries `map:` (a
// one-line JSON map spec) is rendered by the H2 "Bản Đồ Sử" kit — the renderer of the
// h2-bandosu-studio plugin: a real relief map (NASA Blue Marble), Natural Earth coastlines, period
// territories, arrows that draw themselves, labels and the Hoàng Sa / Trường Sa islands always
// drawn as Vietnamese. It writes the scene's still and its motion clip, so a map scene needs no
// image model and no image-to-video model.
//
// The kit is installed per machine OUTSIDE this repo (scripts/setup-map-kit.mjs, `npm run
// setup-maps`): the plugin carries no licence and this repository is public, so none of its code
// or data may enter git. Its folder is H2_STUDIO_DIR, default ../h2-2d-studio, like the other local
// tools (OmniVoice, muse2api). The kit draws in headless Chromium (Playwright) and joins frames
// with ffmpeg, which must be on PATH (ensure-ffmpeg.mjs puts it there for the review server).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const MAP_KIT_ENV = 'H2_STUDIO_DIR';
export const mapKitDir = () => resolve(process.env[MAP_KIT_ENV] ?? '../h2-2d-studio');
export const isMapKitInstalled = (dir = mapKitDir()) => ['render.mjs', join('packs', 'bando', 'pack.js'), join('node_modules', 'playwright')]
  .every((p) => existsSync(join(dir, p)));
export const MAP_KIT_MISSING = `Chưa cài bộ vẽ bản đồ H2. Chạy: npm run setup-maps -- --plugin <đường dẫn h2-bandosu-studio.plugin>, hoặc đặt ${MAP_KIT_ENV} tới thư mục h2-2d-studio đã cài.`;

// The frame shapes the kit draws (it treats anything else as 16:9).
const KIT_ASPECTS = new Set(['16:9', '9:16']);
// The map template's own fields that a plan may set. Camera flight, chapter cards, big centre text
// and topic bars are left out on purpose: each map scene is one still frame of the video, and Scene
// Studio draws its own titles and captions on top.
const SPEC_SCALARS = ['view', 'year', 'drift'];
const SPEC_LISTS = ['regions', 'labels', 'names', 'arrows', 'lines', 'pins', 'rings', 'marks'];
const OVERLAYS = SPEC_LISTS.filter((k) => k !== 'regions');

// Check and trim a map spec (an object or its JSON text). Throws a message the panel can show.
export const normalizeMapSpec = (input) => {
  let spec = input;
  if (typeof input === 'string') {
    try { spec = JSON.parse(input); } catch { throw new Error('map: JSON không hợp lệ'); }
  }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('map: phải là một object JSON');
  if (!spec.view) throw new Error('map: thiếu "view" (tên khung nhìn, [tây, nam, đông, bắc] hoặc { "c": nơi, "span": độ })');
  const raw = { ...spec, regions: spec.regions ?? spec.add };
  const out = {};
  for (const k of SPEC_SCALARS) if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') out[k] = raw[k];
  if (out.year !== undefined) out.year = String(out.year);
  for (const k of SPEC_LISTS) {
    if (raw[k] === undefined) continue;
    if (!Array.isArray(raw[k])) throw new Error(`map: "${k}" phải là danh sách`);
    const isEntry = (o) => (o && typeof o === 'object' && !Array.isArray(o)) || (k === 'regions' && typeof o === 'string' && o);
    out[k] = raw[k].filter(isEntry);
  }
  return out;
};

// How long the kit takes to draw each kind of item when its spec gives no `dur` (kit defaults),
// and the share of the clip by which every item should be drawn, so the map then holds still.
const DRAW_SECONDS = { regions: 1.3, arrows: 1.4, lines: 1.2 };
const POP_SECONDS = 0.5;
const DEFAULT_AT = 0.15;
const DRAWN_BY = 0.6;
const numberOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const drawEnd = (key, o) => numberOr(o.at, key === 'regions' ? 0 : DEFAULT_AT) + numberOr(o.dur, DRAW_SECONDS[key] ?? POP_SECONDS);
// Scale every item's start and drawing time so the last one finishes by DRAWN_BY of the clip.
// A map shot is sized to its narration (shot-timing.mjs flexibleShotSeconds), so it can be short.
const fitTiming = (args, seconds) => {
  const ends = SPEC_LISTS.flatMap((k) => (args[k] ?? []).filter((o) => typeof o === 'object').map((o) => drawEnd(k, o)));
  const last = Math.max(0, ...ends);
  const factor = last > seconds * DRAWN_BY ? (seconds * DRAWN_BY) / last : 1;
  if (factor === 1) return args;
  const scaled = { ...args };
  for (const k of SPEC_LISTS) {
    if (!scaled[k]) continue;
    scaled[k] = scaled[k].map((o) => (typeof o !== 'object' ? o : {
      ...o,
      at: Number((numberOr(o.at, k === 'regions' ? 0 : DEFAULT_AT) * factor).toFixed(3)),
      dur: Number((numberOr(o.dur, DRAW_SECONDS[k] ?? POP_SECONDS) * factor).toFixed(3)),
    }));
  }
  return scaled;
};

// The kit project for one scene: a single "map" shot lasting the whole clip. Overlays are kept to
// the last frame (the kit otherwise fades a shot's labels out in its final 0.2 s) and there is no
// fade from black, so the clip's last frame is the finished map — the scene's still.
export const mapProjectFiles = ({ spec, aspect, seconds, fps = 30 }) => {
  if (!KIT_ASPECTS.has(aspect)) throw new Error(`Bản đồ vẽ bằng code chỉ hỗ trợ khung 16:9 và 9:16 (dự án đang là ${aspect}).`);
  const args = { ...fitTiming(spec, seconds), fly: 0 };
  for (const k of OVERLAYS) if (args[k]) args[k] = args[k].map((o) => ({ ...o, keep: true }));
  return {
    config: { title: 'Scene Studio map', aspect, resolution: '1080p', fps, pack: 'bando', style: 'flat', captions: false, lang: 'vi', nen: 'nhat', fadeIn: 0, fadeOut: 0 },
    shots: { duration: seconds, shots: [{ id: 'map', start: 0, end: seconds, tpl: 'map', line: '', args }] },
  };
};

const STILL_LEAD_SECONDS = 0.2;
export const mapStillSeconds = (seconds) => Number((seconds - STILL_LEAD_SECONDS).toFixed(2));

// Clip length: the scene's motion length (project setting or its narration's share), at least the
// scene's minimum, never shorter than the overlays need to draw in.
const MIN_MAP_SECONDS = 4;
const DEFAULT_MAP_SECONDS = 8;
export const mapClipSeconds = ({ target, minimum = 0 }) => {
  const base = Number.isFinite(target) && target > 0 ? target : DEFAULT_MAP_SECONDS;
  return Number(Math.max(base, minimum ?? 0, MIN_MAP_SECONDS).toFixed(2));
};

// Lines the kit prints that are noise here (missing optional fonts and sound files).
const KIT_NOISE = /\[404\]|Failed to load resource/;

const runKit = (kitDir, workDir, args, { signal, onLog }) => new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, [join(kitDir, 'render.mjs'), '--project', workDir, ...args], { cwd: kitDir, env: process.env });
  const abort = () => child.kill();
  signal?.addEventListener('abort', abort, { once: true });
  const tail = [];
  const pipe = (stream) => stream.on('data', (b) => b.toString().split(/\r?\n/).filter((l) => l.trim() && !KIT_NOISE.test(l)).forEach((line) => {
    tail.push(line);
    if (tail.length > 8) tail.shift();
    onLog(line.trim());
  }));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('error', (e) => { signal?.removeEventListener('abort', abort); reject(e); });
  child.on('close', (code) => {
    signal?.removeEventListener('abort', abort);
    if (signal?.aborted) reject(new Error('cancelled'));
    else if (code === 0) resolveRun();
    else reject(new Error(`bộ vẽ bản đồ dừng (exit ${code}): ${tail.slice(-3).join(' | ')}`));
  });
});

const runFfmpeg = (args, signal) => new Promise((resolveRun, reject) => {
  const child = spawn('ffmpeg', ['-v', 'error', '-y', ...args], { signal });
  let err = '';
  child.stderr.on('data', (b) => { err += b.toString(); });
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolveRun() : reject(new Error(`ffmpeg: ${err.trim().slice(0, 300)}`))));
});

// Render one map scene into workDir. Returns { image, video }: a JPEG still (the finished map) and
// the MP4 clip, both inside workDir; the caller moves them into the project (with undo tracking).
export const renderMapScene = async ({ spec, aspect, seconds, fps = 30, workDir, kitDir = mapKitDir(), signal, onLog = () => {} }) => {
  if (!isMapKitInstalled(kitDir)) throw new Error(MAP_KIT_MISSING);
  const { config, shots } = mapProjectFiles({ spec, aspect, seconds, fps });
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(join(workDir, 'story'), { recursive: true });
  writeFileSync(join(workDir, 'config.json'), JSON.stringify(config, null, 1));
  writeFileSync(join(workDir, 'story', 'shots.json'), JSON.stringify(shots, null, 1));

  const still = mapStillSeconds(seconds);
  onLog(`vẽ ảnh tĩnh (${aspect}, giây ${still})`);
  await runKit(kitDir, workDir, ['--stills', String(still)], { signal, onLog });
  const png = join(workDir, 'build', 'stills', `t_${still.toFixed(2)}.png`);
  if (!existsSync(png)) throw new Error('bộ vẽ bản đồ không xuất được ảnh tĩnh');
  const image = join(workDir, 'still.jpg');
  await runFfmpeg(['-i', png, '-q:v', '2', image], signal);

  onLog(`vẽ clip ${seconds}s @${fps}fps`);
  await runKit(kitDir, workDir, ['--from', '0', '--to', String(seconds)], { signal, onLog });
  const video = join(workDir, 'build', 'preview.mp4');
  if (!existsSync(video)) throw new Error('bộ vẽ bản đồ không xuất được clip');
  return { image, video };
};
