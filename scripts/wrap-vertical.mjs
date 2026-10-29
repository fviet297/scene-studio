// Wrap a 16:9 master into the 1080x1920 canvas TikTok/Reels/Shorts actually encode.
//
// Why this step exists: uploading a 1920x1080 file to a 9:16 feed makes the platform do the
// downscale AND the letterbox itself, with a fast scaler and ~2 Mbps for the whole canvas. A
// full 16:9 band on that canvas is only 1080x608 — the picture loses 44% of its vertical
// resolution before compression even starts. Doing the resample here (lanczos + a light
// unsharp to put back the edge energy a downscale eats) means the platform only re-compresses,
// never re-sizes.
//
// The band is a centered 3:2 crop, not the full 16:9: trading 15.6% of the frame width buys
// 720px of height instead of 608px (+18% linear resolution on the subject). Source images are
// 2560-2848px wide, so the crop costs no real pixels. Change BAND_RATIO to 16 / 9 to keep the
// whole frame, or 4 / 3 to crop harder.
//
// Run: node scripts/wrap-vertical.mjs [--project <slug>]

import './lib/ensure-ffmpeg.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { activePaths } from './lib/project-paths.mjs';

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const BAND_RATIO = 3 / 2;
const BAND_H = Math.round(CANVAS_W / BAND_RATIO);
const BAND_Y = Math.round((CANVAS_H - BAND_H) / 2);

const probe = (file, fields) =>
  execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', `stream=${fields}`, '-of', 'csv=p=0', file], { encoding: 'utf8' })
    .trim()
    .split(',');

const paths = activePaths();
const input = join(paths.outDir, `${paths.slug}.mp4`);
if (!existsSync(input)) {
  throw new Error(`No master render at ${input}. Render it first: npx remotion render ${paths.slug} ${input}`);
}

const [width, height] = probe(input, 'width,height').map(Number);
if (width <= height) {
  throw new Error(`${input} is ${width}x${height} (already vertical) — nothing to wrap.`);
}

const output = join(paths.outDir, `${paths.slug}-9x16.mp4`);
const filter = [
  `crop=ih*${BAND_RATIO}:ih`,
  `scale=${CANVAS_W}:${BAND_H}:flags=lanczos`,
  'unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4',
  `pad=${CANVAS_W}:${CANVAS_H}:0:${BAND_Y}:color=black`,
].join(',');

process.stdout.write(`${width}x${height} → ${CANVAS_W}x${CANVAS_H} (band ${CANVAS_W}x${BAND_H} at y=${BAND_Y})\n`);
execFileSync('ffmpeg', [
  '-y', '-i', input,
  '-vf', filter,
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-crf', '16', '-preset', 'slow',
  '-c:a', 'copy',
  '-movflags', '+faststart',
  output,
], { stdio: 'inherit' });

process.stdout.write(`\nWrote ${output}\n`);
