// Pull a project's generated media (public/projects/<slug>/) from another copy of this repo, e.g.
// the one on the Mac shared over SMB. public/projects/ is gitignored, so git never carries it.
//
// Rules: a file is copied when it is missing locally or the source copy is newer. A local file that
// is newer, or the same age, is never overwritten, and nothing is ever deleted. Copies keep the
// source mtime, so a second run finds every file up to date.
//
// Env: MEDIA_SYNC_SOURCE = root of the other repo copy (default DEFAULT_SOURCE below).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isValidSlug } from './project-paths.mjs';

export const DEFAULT_SOURCE = '\\\\192.168.1.6\\pet\\scene-studio';
// SMB shares and FAT-style filesystems round mtimes; a smaller gap is not a real difference.
const MTIME_TOLERANCE_MS = 2000;

export const sourceRoot = () => process.env.MEDIA_SYNC_SOURCE || DEFAULT_SOURCE;
const mediaDir = (root, slug) => join(root, 'public', 'projects', slug);

// Project slugs that have media at the source.
export const listSourceProjects = (root = sourceRoot()) => {
  const dir = join(root, 'public', 'projects');
  if (!existsSync(dir)) throw new Error(`không thấy thư mục media ở nguồn: ${dir}`);
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidSlug(entry.name))
    .map((entry) => entry.name)
    .sort();
};

const walk = (dir, prefix = '') => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const rel = prefix ? join(prefix, entry.name) : entry.name;
  return entry.isDirectory() ? walk(join(dir, entry.name), rel) : [rel];
});

// Compare one project's source folder with the local one. Returns what would be copied.
export const planProjectSync = (slug, { root = sourceRoot(), localBase = '.' } = {}) => {
  if (!isValidSlug(slug)) throw new Error(`slug không hợp lệ: "${slug}"`);
  const from = mediaDir(root, slug);
  const to = mediaDir(localBase, slug);
  if (!existsSync(from)) throw new Error(`nguồn không có media cho project "${slug}": ${from}`);
  const copy = [];
  let upToDate = 0;
  let localNewer = 0;
  for (const rel of walk(from)) {
    const source = statSync(join(from, rel));
    const target = join(to, rel);
    if (!existsSync(target)) {
      copy.push({ rel, size: source.size, mtime: source.mtime, reason: 'missing' });
      continue;
    }
    const gap = source.mtimeMs - statSync(target).mtimeMs;
    if (gap > MTIME_TOLERANCE_MS) copy.push({ rel, size: source.size, mtime: source.mtime, reason: 'newer' });
    else if (gap < -MTIME_TOLERANCE_MS) localNewer += 1;
    else upToDate += 1;
  }
  return { slug, from, to, copy, upToDate, localNewer, bytes: copy.reduce((sum, file) => sum + file.size, 0) };
};

// Copy the files a plan lists. `onFile(file, index)` fires after each one, for progress output.
export const applyProjectSync = (plan, onFile = () => {}) => {
  plan.copy.forEach((file, index) => {
    const target = join(plan.to, file.rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(plan.from, file.rel), target);
    utimesSync(target, file.mtime, file.mtime);
    onFile(file, index);
  });
  return plan;
};
