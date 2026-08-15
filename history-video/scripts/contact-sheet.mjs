// Build one review contact sheet from the per-scene images so the user can approve the
// visuals BEFORE any audio is generated. Tiles public/images/scene-01.jpg .. scene-NN.jpg
// into public/review/contact-sheet.jpg (4 columns). Run: node scripts/contact-sheet.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';

const IMAGE_DIR = 'public/images';
const OUT_DIR = 'public/review';
const OUT = `${OUT_DIR}/contact-sheet.jpg`;
const COLS = 4;
const CELL_W = 320;
const CELL_H = 568; // 9:16

const scenes = readdirSync(IMAGE_DIR)
  .filter((f) => /^scene-\d+\.(jpe?g|png)$/i.test(f))
  .sort();
if (!scenes.length) { process.stderr.write('No scene-NN images in public/images.\n'); process.exit(1); }

mkdirSync(OUT_DIR, { recursive: true });

const rows = Math.ceil(scenes.length / COLS);
const cell = `scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=decrease,pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:color=0x1a1a1a`;

// Pass every image as an independent input. Image-sequence input breaks when source
// dimensions vary because FFmpeg reconfigures the filter graph mid-stream.
const inputs = scenes.flatMap((f) => ['-i', `${IMAGE_DIR}/${f}`]);
const chain = scenes.map((_, i) => `[${i}:v]${cell}[c${i}]`).join(';');
const stack = `${scenes.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${scenes.length}:layout=${gridLayout(scenes.length, COLS, CELL_W, CELL_H)}:fill=0x111111[out]`;
execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', `${chain};${stack}`, '-map', '[out]', '-frames:v', '1', '-update', '1', OUT], { stdio: 'inherit' });

function gridLayout(n, cols, w, h) {
  return Array.from({ length: n }, (_, i) => `${(i % cols) * (w + 8)}_${Math.floor(i / cols) * (h + 8)}`).join('|');
}

if (existsSync(OUT)) process.stdout.write(`✓ ${OUT} (${scenes.length} scenes, ${COLS}×${rows}). Show to the user and get approval before generating audio.\n`);
