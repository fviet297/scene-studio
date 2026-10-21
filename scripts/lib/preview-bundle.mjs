// Bundles src/preview/preview-entry.tsx (the real ScenePlanVideo composition inside
// @remotion/player) for the review panel's "as rendered" preview. Built in memory with esbuild and
// rebuilt only when a .ts/.tsx file under src/ is newer than the last build (the JSON there is
// rewritten on every reparse and is not part of the bundle), so an edit to the composition
// shows up on the next panel reload without a separate build step.

import { build } from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'src';
const ENTRY = join(SRC_DIR, 'preview', 'preview-entry.tsx');

let cache = null; // { builtAt, code }

const newestMtime = (dir) => {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(path));
    else if (/\.tsx?$/.test(entry.name)) newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
};

export const previewBundle = async () => {
  const sourceMtime = newestMtime(SRC_DIR);
  if (cache && cache.builtAt >= sourceMtime) return cache.code;
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  cache = { builtAt: sourceMtime, code: result.outputFiles[0].text };
  return cache.code;
};
