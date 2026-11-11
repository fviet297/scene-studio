// Install the H2 "Bản Đồ Sử" map kit (scripts/lib/map-render.mjs) from the h2-bandosu-studio
// plugin file into a folder OUTSIDE this repo — H2_STUDIO_DIR, default ../h2-2d-studio — then its
// npm packages and the Chromium build its Playwright drives. The plugin carries no licence and this
// repository is public, so the kit is never copied into the repo; every machine installs its own.
//
//   npm run setup-maps -- --plugin <path to h2-bandosu-studio.plugin>   (default ./h2-bandosu-studio.plugin)
//
// Re-running updates the kit's code and keeps the kit's own projects/ folder.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isMapKitInstalled, MAP_KIT_ENV, mapKitDir } from './lib/map-render.mjs';

const argv = process.argv.slice(2);
const argOf = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const plugin = resolve(argOf('plugin') ?? 'h2-bandosu-studio.plugin');
const target = argOf('dir') ? resolve(argOf('dir')) : mapKitDir();
const KIT_IN_PLUGIN = join('skills', 'lam-video-bandosu', 'kit');

// npm / npx are .cmd shims on Windows, which Node only runs through a shell; the command lines here
// are fixed strings (no user input), passed whole so Node does not warn about unescaped arguments.
const run = (cmd, args, opts = {}) => {
  const line = [cmd, ...args].join(' ');
  const r = process.platform === 'win32'
    ? spawnSync(line, { stdio: 'inherit', shell: true, ...opts })
    : spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${line} failed (exit ${r.status})`);
};
// Windows' own bsdtar reads zip; a GNU tar first on PATH (Git Bash) does not, and reads "D:" as a host.
const TAR = process.platform === 'win32' && existsSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'))
  ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  : 'tar';

// Copy a folder tree, overwriting files, leaving out the top-level names in `skip`. Hand-rolled:
// fs.cpSync killed this process outright (exit 127, no error) on Node 24 / Windows.
const copyTree = (from, to, skip = new Set()) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else copyFileSync(src, dst);
  }
};

if (!existsSync(plugin)) {
  process.stderr.write(`Không thấy file plugin: ${plugin}\nDùng: npm run setup-maps -- --plugin <đường dẫn h2-bandosu-studio.plugin>\n`);
  process.exit(1);
}

// The .plugin file is a zip. bsdtar (Windows 10+, macOS) reads zip; elsewhere fall back to unzip.
const unpacked = mkdtempSync(join(tmpdir(), 'h2-plugin-'));
try {
  const tar = spawnSync(TAR, ['-xf', plugin, '-C', unpacked], { stdio: 'pipe' });
  if (tar.status !== 0) {
    const unzip = spawnSync('unzip', ['-q', '-o', plugin, '-d', unpacked], { stdio: 'inherit' });
    if (unzip.status !== 0) throw new Error(`Không giải nén được ${plugin}: ${tar.stderr?.toString().trim() || 'tar và unzip đều lỗi'}`);
  }
  const kit = join(unpacked, KIT_IN_PLUGIN);
  if (!existsSync(join(kit, 'render.mjs'))) throw new Error(`Plugin không có ${KIT_IN_PLUGIN}/render.mjs — không phải gói h2-bandosu-studio?`);
  process.stdout.write(`▶ chép bộ vẽ vào ${target}\n`);
  // Keep the kit's own projects/ on an update (the kit's install guide asks for the same).
  const skip = existsSync(join(target, 'projects')) ? new Set(['projects']) : new Set();
  copyTree(kit, target, skip);
} finally {
  rmSync(unpacked, { recursive: true, force: true });
}

process.stdout.write('▶ npm install (bộ vẽ, font, dữ liệu bản đồ Natural Earth)\n');
run('npm', ['install', '--no-audit', '--no-fund'], { cwd: target });
process.stdout.write('▶ tải Chromium cho Playwright của bộ vẽ\n');
run('npx', ['playwright', 'install', 'chromium'], { cwd: target });

if (!isMapKitInstalled(target)) {
  process.stderr.write('✗ Cài xong nhưng thiếu file cần thiết của bộ vẽ.\n');
  process.exit(1);
}
const envNote = target === mapKitDir() ? '' : `\nĐặt ${MAP_KIT_ENV}=${target} trong .env để Scene Studio tìm thấy bộ vẽ.`;
process.stdout.write(`✓ Bộ vẽ bản đồ sẵn sàng ở ${target}.${envNote}\nCần ffmpeg trên PATH (Scene Studio tự thêm khi chạy panel).\n`);
