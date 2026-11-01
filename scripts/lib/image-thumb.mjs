// Small JPEG copies of scene images for the panel's strips (timeline clips, scene rail). Those
// strips show ~100 images at a few dozen pixels wide; serving the 2048px originals makes the browser
// decode ~9 MB each, overflows its decode cache and re-decodes them whenever the strip repaints,
// which stalled the player at every scene change.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const THUMB_WIDTHS = [160, 320];
const JPEG_QUALITY = '5'; // ffmpeg -q:v, 2 (best) .. 31

// Largest allowed width not smaller than the one asked for; null = serve the original.
export const thumbWidth = (requested) => {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return null;
  return THUMB_WIDTHS.find((w) => w >= n) ?? null;
};

// Sources ffmpeg could not resize, by cache key: a strip repaint asks for every thumbnail again, and
// re-running a doomed ffmpeg per image (e.g. WebP on an ffmpeg built without a WebP decoder) stalls
// the server on each repaint. The key holds the source's mtime, so a regenerated image is retried.
const failures = new Map();

// Path of the resized copy of `source` (created on first use, rebuilt when the source changes).
// Rejects with the same error, without running ffmpeg again, while an unreadable source is unchanged.
export const ensureThumbnail = async ({ source, cacheDir, width }) => {
  const { mtimeMs } = statSync(source);
  const key = createHash('sha1').update(`${source}|${mtimeMs}|${width}`).digest('hex').slice(0, 16);
  const target = join(cacheDir, `${key}.jpg`);
  if (existsSync(target)) return target;
  if (failures.has(key)) throw failures.get(key);
  mkdirSync(cacheDir, { recursive: true });
  const partial = `${target}.${process.pid}.tmp.jpg`;
  try {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', `scale=${width}:-2`, '-frames:v', '1', '-q:v', JPEG_QUALITY, partial]);
  } catch (error) {
    failures.set(key, error);
    throw error;
  }
  renameSync(partial, target);
  return target;
};
