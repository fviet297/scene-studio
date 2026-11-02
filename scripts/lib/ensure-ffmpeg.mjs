// Side-effect module: if `ffprobe` is not on PATH, append the ffmpeg binaries that ship with
// Remotion (@remotion/compositor-*) so every script and child process can still find them.
// A system ffmpeg always wins because the folder is appended, never prepended.
//
// It also moves the folder that holds ffprobe/ffmpeg to the front of PATH. Spawning a bare name
// makes the OS try every PATH entry in order, and on a machine with security tooling hooking each
// exec attempt that costs ~4ms per entry: a 27-entry PATH made every ffprobe call take ~95ms
// instead of ~25ms, so one bundle rebuild (50+ calls) spent seconds just looking for the binary.
// The folder moved is the first one that already had the binary, so the same one still wins.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);
const fromRoot = (...parts) => resolve(fileURLToPath(new URL('../..', import.meta.url)), ...parts);

const hasFfprobe = () => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const remotionBinDir = () => {
  const scope = fromRoot('node_modules', '@remotion');
  if (!existsSync(scope)) return null;
  const pkg = readdirSync(scope).find((name) => name.startsWith('compositor-') && existsSync(join(scope, name, exe('ffprobe'))));
  return pkg ? join(scope, pkg) : null;
};

// `pathValue` with the first folder that contains `exe` moved to the front (unchanged when none does).
export const pathWithFirst = (pathValue, exe, exists = existsSync) => {
  const entries = pathValue.split(delimiter);
  const index = entries.findIndex((dir) => dir && exists(join(dir, exe)));
  if (index <= 0) return pathValue;
  return [entries[index], ...entries.slice(0, index), ...entries.slice(index + 1)].join(delimiter);
};

// The ffmpeg folder that ships with Remotion: never counts as a system ffmpeg.
export const isRemotionBinDir = (dir) => /[\\/]@remotion[\\/]compositor-/.test(dir);

// `pathValue` with `localDir` first (and only once) when it holds `exe` and no other PATH folder
// does, the Remotion one aside, so a system ffmpeg still wins (unchanged otherwise). It ignores
// `localDir` and the Remotion folder when looking for a system ffmpeg, so a child process that
// inherits a PATH already holding both still puts the local build first.
export const pathWithLocalFfmpeg = (pathValue, localDir, exe, exists = existsSync) => {
  const others = pathValue.split(delimiter).filter((dir) => dir !== localDir);
  const onSystemPath = others.some((dir) => dir && !isRemotionBinDir(dir) && exists(join(dir, exe)));
  if (onSystemPath || !exists(join(localDir, exe))) return pathValue;
  return [localDir, ...others].join(delimiter);
};

const exeSuffix = process.platform === 'win32' ? '.exe' : '';

if (!hasFfprobe()) {
  const dir = remotionBinDir();
  if (dir) process.env.PATH = `${process.env.PATH ?? ''}${delimiter}${dir}`;
}

// ffmpeg first, then ffprobe, so a folder holding both ends up in front.
for (const name of ['ffmpeg', 'ffprobe']) process.env.PATH = pathWithFirst(process.env.PATH ?? '', `${name}${exeSuffix}`);
// Per-machine full ffmpeg (gitignored tools/ffmpeg/). The Remotion build lacks WebP decoding, lavfi
// sources, the pad filter and the null-output encoder (silencedetect), so it goes in front last:
// the ffprobe move above would otherwise put the Remotion ffmpeg back ahead of it.
process.env.PATH = pathWithLocalFfmpeg(process.env.PATH ?? '', fromRoot('tools', 'ffmpeg'), `ffmpeg${exeSuffix}`);
