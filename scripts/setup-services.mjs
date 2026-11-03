// Optional helper services (separate repos, sibling folders). For each one: ask, clone, set up.
// Skipping a service is fine — see README "Dịch vụ phụ trợ".
//
// Run: node scripts/setup-services.mjs                  (asks per service)
//      node scripts/setup-services.mjs --yes            (install all without asking)
//      node scripts/setup-services.mjs --only omnivoice,muse2api
//      node scripts/setup-services.mjs --list           (status only)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { omnivoiceDir } from './lib/omnivoice-client.mjs';
import { vieneuDir } from './lib/vieneu-client.mjs';

const IS_WIN = process.platform === 'win32';
const PYTHON = IS_WIN ? 'python' : 'python3';
const venvPython = (dir, venv) => join(dir, venv, ...(IS_WIN ? ['Scripts', 'python.exe'] : ['bin', 'python']));

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: IS_WIN && /\.(bat|cmd)$/i.test(command) });
  if (result.status !== 0) throw new Error(`lệnh thất bại: ${command} ${args.join(' ')}`);
};

const SERVICES = [
  {
    id: 'omnivoice',
    label: 'OmniVoice',
    purpose: 'giọng đọc narration (audio: omnivoice)',
    repo: 'https://github.com/thanhng8/omnivoice-tool.git',
    dir: omnivoiceDir,
    ready: (dir) => existsSync(venvPython(dir, '.venv')),
    install: (dir) => (IS_WIN
      ? run(join(dir, 'tool', 'setup_omnivoice.bat'), [], dir)
      : run('bash', ['tool/setup_omnivoice.sh'], dir)),
  },
  {
    id: 'muse2api',
    label: 'muse2api (museapivn)',
    purpose: 'tạo ảnh/video qua muse.ai (muse:muse-image) — repo private, cần quyền truy cập',
    repo: 'git@github.com:fviet297/museapivn.git',
    dir: () => resolve(process.env.MUSE2API_DIR ?? '../museapivn'),
    ready: (dir) => existsSync(venvPython(dir, 'venv')),
    install: (dir) => {
      run(PYTHON, ['-m', 'venv', 'venv'], dir);
      run(venvPython(dir, 'venv'), ['-m', 'pip', 'install', '-r', 'requirements.txt'], dir);
    },
  },
  {
    id: 'vieneu',
    label: 'VieNeu-TTS',
    purpose: 'giọng đọc narration (audio: vieneu)',
    repo: 'https://github.com/pnnbao97/VieNeu-TTS.git',
    dir: vieneuDir,
    // Runtime (Python + venv + model cache) is assembled by hand, so only the clone is automated.
    ready: (dir) => existsSync(join(dir, 'runtime', 'python')),
    install: (dir) => process.stdout.write(`  Đã clone. Dựng runtime theo ${join(dir, 'README.vi.md')} (cần thư mục runtime/python và runtime/venv).\n`),
  },
];

const parseArgs = (argv) => {
  const options = { yes: false, list: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--yes') options.yes = true;
    else if (argv[i] === '--list') options.list = true;
    else if (argv[i] === '--only') options.only = (argv[++i] ?? '').split(',').filter(Boolean);
    else throw new Error(`tham số không hợp lệ: ${argv[i]}`);
  }
  return options;
};

const statusOf = (service) => {
  const dir = service.dir();
  if (!existsSync(dir)) return 'chưa clone';
  return service.ready(dir) ? 'đã cài' : 'đã clone, chưa cài';
};

const setUp = (service) => {
  const dir = service.dir();
  if (!existsSync(dir)) run('git', ['clone', service.repo, dir], process.cwd());
  if (!service.ready(dir)) service.install(dir);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const unknown = (options.only ?? []).filter((id) => !SERVICES.some((s) => s.id === id));
  if (unknown.length) throw new Error(`service không tồn tại: ${unknown.join(', ')} (có: ${SERVICES.map((s) => s.id).join(', ')})`);
  const chosen = SERVICES.filter((s) => !options.only || options.only.includes(s.id));

  if (options.list) {
    for (const s of chosen) process.stdout.write(`${s.id.padEnd(10)} ${statusOf(s).padEnd(20)} ${s.dir()}\n`);
    return;
  }
  if (!options.yes && !process.stdin.isTTY) throw new Error('không phải terminal tương tác — dùng --yes hoặc --only <id>.');

  const rl = options.yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const s of chosen) {
      process.stdout.write(`\n${s.label} — ${s.purpose}\n  thư mục: ${s.dir()} · trạng thái: ${statusOf(s)}\n`);
      if (statusOf(s) === 'đã cài') continue;
      if (rl && !/^(y|yes|c|có)$/i.test((await rl.question('  Cài đặt? [y/N] ')).trim())) {
        process.stdout.write('  Bỏ qua.\n');
        continue;
      }
      try {
        setUp(s);
        process.stdout.write('  Xong.\n');
      } catch (error) {
        process.stdout.write(`  Lỗi: ${error.message}\n`);
        process.exitCode = 1;
      }
    }
  } finally {
    rl?.close();
  }
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
