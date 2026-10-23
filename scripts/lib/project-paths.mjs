// Multi-project support: every comparison "content" (e.g. Lý Thái Tổ vs Lý Thế Dân) lives in
// its own projects/<slug>/ (scene-plan.md + character profiles) and public/projects/<slug>/
// (images, audio, character references, scene videos). Exactly one project is "active" at a
// time — its slug is resolved by parseProjectArg/resolveSlug and used to build every path.
//
// Precedence for which project a script acts on: --project <slug> in argv > PROJECT env var
// > projects/active.json. Resolution throws instead of silently defaulting, because writing
// generated audio/images into the wrong project is the one mistake this module exists to
// prevent.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const PROJECTS_DIR = 'projects';
export const ACTIVE_FILE = join(PROJECTS_DIR, 'active.json');

// Rendered master + vertical MP4s land here (flat, named <slug>.mp4 / <slug>-9x16.mp4) instead of
// the repo's out/ so finished videos sync via iCloud. Single source for both the review-server
// render step and wrap-vertical.mjs. This is only the default: the panel can point renders
// elsewhere (see readOutputDir), a per-machine choice kept out of git.
export const OUTPUT_DIR = '/Users/fviet/Library/Mobile Documents/com~apple~CloudDocs/Video';
export const OUTPUT_DIR_FILE = join(PROJECTS_DIR, 'output-dir.json');

export const readOutputDir = () => {
  try { return JSON.parse(readFileSync(OUTPUT_DIR_FILE, 'utf8')).dir || OUTPUT_DIR; } catch { return OUTPUT_DIR; }
};

// Persist a new render folder ('~/' expands to home) and return it. Empty/null restores the
// default. The folder is created now so a bad path (relative, a file, no permission) fails here
// rather than at the end of a long render.
export const setOutputDir = (input) => {
  if (input == null || String(input).trim() === '') {
    rmSync(OUTPUT_DIR_FILE, { force: true });
    return OUTPUT_DIR;
  }
  const raw = String(input).trim();
  const dir = raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw;
  if (!isAbsolute(dir)) throw new Error('đường dẫn phải là đường dẫn tuyệt đối (bắt đầu bằng / hoặc ~/)');
  mkdirSync(dir, { recursive: true });
  writeFileSync(OUTPUT_DIR_FILE, `${JSON.stringify({ dir }, null, 2)}\n`);
  return dir;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const isValidSlug = (s) => typeof s === 'string' && SLUG_RE.test(s);

// Extract `--project <slug>` (or `--project=<slug>`) from argv, returning the slug and the
// remaining args with the flag removed — so positional args after it (scene numbers, paths)
// are unaffected by its position.
export const parseProjectArg = (argv) => {
  const rest = [];
  let slug = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') { slug = argv[++i] ?? null; continue; }
    if (argv[i]?.startsWith('--project=')) { slug = argv[i].slice('--project='.length); continue; }
    rest.push(argv[i]);
  }
  return { slug, rest };
};

export const readActiveSlug = () => {
  if (!existsSync(ACTIVE_FILE)) return null;
  try { return JSON.parse(readFileSync(ACTIVE_FILE, 'utf8')).active ?? null; } catch { return null; }
};

export const setActiveSlug = (slug) => {
  if (!isValidSlug(slug)) throw new Error(`invalid project slug "${slug}"`);
  mkdirSync(PROJECTS_DIR, { recursive: true });
  writeFileSync(ACTIVE_FILE, `${JSON.stringify({ active: slug }, null, 2)}\n`);
};

export const resolveSlug = (argv = process.argv.slice(2)) => {
  const { slug: fromArgv } = parseProjectArg(argv);
  const slug = fromArgv ?? process.env.PROJECT ?? readActiveSlug();
  if (!slug) throw new Error('No active project. Pass --project <slug>, set PROJECT env, or create projects/active.json (see projects/_template).');
  if (!isValidSlug(slug)) throw new Error(`invalid project slug "${slug}"`);
  return slug;
};

// Every dir under projects/ that has a scene-plan.md, excluding scaffolding dirs (leading _).
export const listProjects = () => {
  if (!existsSync(PROJECTS_DIR)) return [];
  return readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .filter((slug) => existsSync(join(PROJECTS_DIR, slug, 'scene-plan.md')))
    .sort();
};

export const projectTitle = (slug) => {
  const md = join(PROJECTS_DIR, slug, 'scene-plan.md');
  if (!existsSync(md)) return slug;
  return readFileSync(md, 'utf8').match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
};

// Single home for the scene-NN naming convention (was duplicated across every script + server).
export const sceneBase = (n) => `scene-${String(n).padStart(2, '0')}`;

export const projectPaths = (slug) => {
  const root = join(PROJECTS_DIR, slug);
  const publicRoot = join('public', 'projects', slug);
  return {
    slug,
    planMd: join(root, 'scene-plan.md'),
    profilesDir: join(root, 'characters'),
    publicRoot,
    imageDir: join(publicRoot, 'images'),
    audioDir: join(publicRoot, 'audio'),
    charDir: join(publicRoot, 'characters'),
    charV2Dir: join(publicRoot, 'characters', 'v2'),
    charOriginalDir: join(publicRoot, 'characters', '_original'),
    sceneVideoDir: join(publicRoot, 'scene-videos'),
    reviewDir: join(publicRoot, 'review'),
    manifest: join(publicRoot, 'images', 'asset-manifest.json'),
    // Undo/redo snapshots of scene media. Outside public/ so they never ship in the Remotion bundle.
    historyDir: join('tmp', 'media-history', slug),
    outDir: readOutputDir(),
    // staticFile()-relative prefix (no leading "public/") for Remotion components.
    staticPrefix: `projects/${slug}`,
  };
};

export const activePaths = (argv) => projectPaths(resolveSlug(argv));

export const ensureProjectDirs = (paths) => {
  for (const dir of [paths.imageDir, paths.audioDir, paths.charDir, paths.charV2Dir, paths.sceneVideoDir, paths.reviewDir, paths.profilesDir]) {
    mkdirSync(dir, { recursive: true });
  }
};
