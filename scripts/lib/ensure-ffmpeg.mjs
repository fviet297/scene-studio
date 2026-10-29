// Side-effect module: if `ffprobe` is not on PATH, append the ffmpeg binaries that ship with
// Remotion (@remotion/compositor-*) so every script and child process can still find them.
// A system ffmpeg always wins because the folder is appended, never prepended.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const hasFfprobe = () => {
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const remotionBinDir = () => {
  const scope = resolve(fileURLToPath(new URL('../../node_modules/@remotion', import.meta.url)));
  if (!existsSync(scope)) return null;
  const exe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const pkg = readdirSync(scope).find((name) => name.startsWith('compositor-') && existsSync(join(scope, name, exe)));
  return pkg ? join(scope, pkg) : null;
};

if (!hasFfprobe()) {
  const dir = remotionBinDir();
  if (dir) process.env.PATH = `${process.env.PATH ?? ''}${delimiter}${dir}`;
}
