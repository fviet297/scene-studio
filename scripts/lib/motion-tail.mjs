// Image-to-video models leave two artefacts at the ends of every clip:
//  - the first fraction of a second is soft and jittery (detail drops to ~70-85% before it settles),
//    which reads as a blur at the start of each scene: `headSeconds`, skipped when the clip plays;
//  - the last second or more eases to a near stop, which reads as a stall just before the next scene:
//    `tailSeconds`, covered by starting the next scene's transition early (src/ScenePlanVideo.tsx).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const SMOOTH_RADIUS_FRAMES = 6;
// A frame is in the stalling tail when its smoothed motion has dropped below this share of the
// clip's peak: models ease out gradually, and the clip already reads as slowing at about half speed.
const DEAD_SHARE_OF_PEAK = 0.5;
// Longest tail reported: beyond this the clip is mostly still anyway, and a longer dissolve would
// start the next scene visibly before its narration.
export const MAX_DEAD_TAIL_SECONDS = 1.2;

// The soft head is judged on edge energy (how much fine detail a frame has) against the clip's own
// steady level, measured over the first frames only.
const HEAD_ANALYSIS_FRAMES = 40;
const HEAD_SEARCH_FRAMES = 12;
const HEAD_STEADY_FROM_FRAME = 15;
const SOFT_HEAD_SHARE_OF_STEADY = 0.9;
export const MAX_SOFT_HEAD_SECONDS = 0.4;

const CACHE_FILE = '.motion-tail.json';

const smoothed = (values) =>
  values.map((_, i) => {
    const window = values.slice(Math.max(0, i - SMOOTH_RADIUS_FRAMES), i + SMOOTH_RADIUS_FRAMES + 1);
    return window.reduce((sum, v) => sum + v, 0) / window.length;
  });

// `activity` = mean absolute difference between consecutive frames, one value per frame.
export const deadTailSeconds = (activity, fps) => {
  const motion = smoothed(activity);
  const peak = Math.max(0, ...motion);
  if (!(peak > 0) || !(fps > 0)) return 0;
  let deadFrames = 0;
  for (let i = motion.length - 1; i >= 0 && motion[i] < DEAD_SHARE_OF_PEAK * peak; i -= 1) deadFrames += 1;
  return Math.min(MAX_DEAD_TAIL_SECONDS, Number((deadFrames / fps).toFixed(2)));
};

// `edgeEnergy` = mean edge-detect luma of each of the first frames. The head ends after the last
// frame below 90% of the clip's steady detail (median of frames 15+) within the first
// HEAD_SEARCH_FRAMES: the dip often starts a frame or two in, so the leading run alone misses it.
// Capped so a clip that is merely soft throughout does not lose its start.
export const softHeadSeconds = (edgeEnergy, fps) => {
  const steadyFrames = edgeEnergy.slice(HEAD_STEADY_FROM_FRAME).sort((a, b) => a - b);
  if (!steadyFrames.length || !(fps > 0)) return 0;
  const steady = steadyFrames[Math.floor(steadyFrames.length / 2)];
  if (!(steady > 0)) return 0;
  const softLimit = SOFT_HEAD_SHARE_OF_STEADY * steady;
  const lastSoft = edgeEnergy.slice(0, HEAD_SEARCH_FRAMES).findLastIndex((value) => value < softLimit);
  const softFrames = lastSoft + 1;
  return Math.min(MAX_SOFT_HEAD_SECONDS, Number((softFrames / fps).toFixed(2)));
};

const clipFps = (file) => {
  const rate = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim();
  const [num, den] = rate.split('/').map(Number);
  return num / (den || 1);
};

const yavgPerFrame = (file, filter, frameLimit) => {
  const limit = frameLimit ? ['-frames:v', String(frameLimit)] : [];
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `${filter},signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`, ...limit, '-f', 'null', '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter((line) => line.includes('YAVG='))
    .map((line) => Number(line.split('=').pop()));
};

const clipActivity = (file) => yavgPerFrame(file, 'scale=320:-1,tblend=all_mode=difference');
const clipEdgeEnergy = (file) => yavgPerFrame(file, 'scale=640:-1,edgedetect=low=0.1:high=0.3', HEAD_ANALYSIS_FRAMES);

const readCache = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
};

// { headSeconds, tailSeconds } of one clip, cached next to it by size + mtime so a rebuild only
// re-measures clips that changed. A clip ffmpeg cannot read reports zeros (nothing trimmed or
// overlapped) instead of failing the build.
export const clipMotionTrim = (file) => {
  const none = { headSeconds: 0, tailSeconds: 0 };
  if (!existsSync(file)) return none;
  const cachePath = join(dirname(file), CACHE_FILE);
  const cache = readCache(cachePath);
  const { size, mtimeMs } = statSync(file);
  const key = basename(file);
  const cached = cache[key];
  if (cached?.size === size && cached?.mtimeMs === mtimeMs && cached.headSeconds !== undefined) {
    return { headSeconds: cached.headSeconds, tailSeconds: cached.tailSeconds };
  }
  let trim;
  try {
    const fps = clipFps(file);
    trim = { headSeconds: softHeadSeconds(clipEdgeEnergy(file), fps), tailSeconds: deadTailSeconds(clipActivity(file), fps) };
  } catch {
    return none;
  }
  writeFileSync(cachePath, `${JSON.stringify({ ...cache, [key]: { size, mtimeMs, ...trim } })}\n`);
  return trim;
};
