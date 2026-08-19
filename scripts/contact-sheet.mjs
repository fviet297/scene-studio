// Build one review contact sheet from the per-scene images so the user can approve the
// visuals BEFORE any audio is generated. Tiles public/images/scene-01.jpg .. scene-NN.jpg
// into public/review/contact-sheet.jpg (4 columns). Run: node scripts/contact-sheet.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { activePaths } from './lib/project-paths.mjs';

const paths = activePaths();
const IMAGE_DIR = paths.imageDir;
const OUT_DIR = paths.reviewDir;
const OUT = `${OUT_DIR}/contact-sheet.jpg`;
const COLS = 4;
const CELL_W = 320;
const CELL_H = 568; // 9:16

const scenes = readdirSync(IMAGE_DIR)
  .filter((f) => /^scene-\d+\.(jpe?g|png)$/i.test(f))
  .sort();
if (!scenes.length) { process.stderr.write(`No scene-NN images in ${IMAGE_DIR}.\n`); process.exit(1); }

// Contiguous scene-01.jpg.. is required for the %02d sequence input; verify.
const contiguous = scenes.every((f, i) => f.startsWith(`scene-${String(i + 1).padStart(2, '0')}.`));
mkdirSync(OUT_DIR, { recursive: true });

const rows = Math.ceil(scenes.length / COLS);
const cell = `scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=decrease,pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:color=0x1a1a1a`;

if (contiguous && !scenes.some((f) => /\.png$/i.test(f))) {
  execFileSync('ffmpeg', ['-y', '-i', `${IMAGE_DIR}/scene-%02d.jpg`,
    '-vf', `${cell},tile=${COLS}x${rows}:padding=8:margin=8:color=0x111111`, '-frames:v', '1', OUT], { stdio: 'inherit' });
} else {
  // Mixed extensions or gaps: pass each file explicitly and tile via filter_complex.
  const inputs = scenes.flatMap((f) => ['-i', `${IMAGE_DIR}/${f}`]);
  const chain = scenes.map((_, i) => `[${i}:v]${cell}[c${i}]`).join(';');
  const stack = `${scenes.map((_, i) => `[c${i}]`).join('')}xstack=inputs=${scenes.length}:layout=${gridLayout(scenes.length, COLS, CELL_W, CELL_H)}:fill=0x111111[out]`;
  execFileSync('ffmpeg', ['-y', ...inputs, '-filter_complex', `${chain};${stack}`, '-map', '[out]', '-frames:v', '1', OUT], { stdio: 'inherit' });
}

function gridLayout(n, cols, w, h) {
  return Array.from({ length: n }, (_, i) => `${(i % cols) * (w + 8)}_${Math.floor(i / cols) * (h + 8)}`).join('|');
}

if (existsSync(OUT)) process.stdout.write(`✓ ${OUT} (${scenes.length} scenes, ${COLS}×${rows}). Show to the user and get approval before generating audio.\n`);
