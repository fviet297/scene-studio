// Duration in seconds of an audio/video file, from ffprobe, cached next to the file by size + mtime.
// A bundle rebuild (every plan edit, undo, audio or clip change) needs the length of every scene's
// audio and clip; spawning ffprobe for ~50 files that have not changed cost over a second each time.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import './ensure-ffmpeg.mjs';

const CACHE_FILE = '.durations.json';

const probe = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim());

const readCache = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
};

export const mediaDuration = (file) => {
  const cachePath = join(dirname(file), CACHE_FILE);
  const cache = readCache(cachePath);
  const { size, mtimeMs } = statSync(file);
  const key = basename(file);
  const hit = cache[key];
  if (hit?.size === size && hit?.mtimeMs === mtimeMs) return hit.seconds;
  const seconds = probe(file);
  if (Number.isFinite(seconds)) writeFileSync(cachePath, `${JSON.stringify({ ...cache, [key]: { size, mtimeMs, seconds } })}\n`);
  return seconds;
};
