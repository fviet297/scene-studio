// Channel assets shared by every project: the corner logo and an optional intro video. They are
// uploaded in the review panel and kept in public/brand/custom/ (gitignored, per machine), so the
// next project picks them up as its default; whether a project plays the intro or draws the logo
// is still that project's own branding.json switch.
//
// Each upload gets a fresh file name (logo-<time>.png, intro-<time>.mp4) and replaces the older one.
// A new name means the preview and the render never serve a stale cached copy, which a fixed name
// plus a query string cannot guarantee through Remotion's staticFile().

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import './ensure-ffmpeg.mjs';
import { mediaDuration } from './media-duration.mjs';

export const BRAND_DIR = join('public', 'brand');
export const CUSTOM_DIR = join(BRAND_DIR, 'custom');
// Static path (relative to public/, as staticFile() wants it) of the logo shipped with the repo.
export const DEFAULT_LOGO = 'brand/logo.svg';

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export const MAX_INTRO_SECONDS = 60;

const NAME_PATTERN = {
  logo: /^logo-(\d+)\.(png|jpg|webp|svg)$/,
  intro: /^intro-(\d+)\.(mp4|webm)$/,
};

const startsWith = (buf, ascii, at = 0) => buf.subarray(at, at + ascii.length).toString('latin1') === ascii;

// File extension (with dot) of a logo upload, from magic bytes; '' when it is not a usable image.
export const detectLogoExt = (buf) => {
  if (buf.length < 12) return '';
  if (buf.subarray(0, 4).toString('hex') === '89504e47') return '.png';
  if (buf.subarray(0, 3).toString('hex') === 'ffd8ff') return '.jpg';
  if (startsWith(buf, 'RIFF') && startsWith(buf, 'WEBP', 8)) return '.webp';
  const head = buf.subarray(0, 1024).toString('utf8');
  if (/<svg[\s>]/i.test(head)) return '.svg';
  return '';
};

// An SVG is served from the panel's own origin, so anything that can run script is refused.
export const isSafeSvg = (buf) => {
  const text = buf.toString('utf8');
  return !/<script|<foreignObject|<iframe|<embed|<object|\son[a-z]+\s*=|javascript:/i.test(text);
};

// Container of an intro upload: MP4/MOV ('ftyp' box) or WebM/Matroska (EBML header).
export const detectVideoExt = (buf) => {
  if (buf.length < 12) return '';
  if (startsWith(buf, 'ftyp', 4)) return '.mp4';
  if (buf.subarray(0, 4).toString('hex') === '1a45dfa3') return '.webm';
  return '';
};

const customFiles = (kind, dir) => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ({ name, match: NAME_PATTERN[kind].exec(name) }))
    .filter((entry) => entry.match)
    .sort((a, b) => Number(b.match[1]) - Number(a.match[1]))
    .map((entry) => entry.name);
};

export const logoStaticPath = (dir = CUSTOM_DIR) => {
  const [name] = customFiles('logo', dir);
  return name ? `brand/custom/${name}` : DEFAULT_LOGO;
};

export const logoDiskPath = (dir = CUSTOM_DIR) => join('public', ...logoStaticPath(dir).split('/'));

export const hasCustomLogo = (dir = CUSTOM_DIR) => customFiles('logo', dir).length > 0;

const probeVideo = (path) => {
  const [width, height] = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
    { encoding: 'utf8' },
  ).trim().split(',').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Video không có luồng hình đọc được.');
  const seconds = mediaDuration(path);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Không đọc được độ dài video.');
  return { width, height, seconds };
};

// The saved intro with its length, or null when none was uploaded.
export const introInfo = (dir = CUSTOM_DIR) => {
  const [name] = customFiles('intro', dir);
  if (!name) return null;
  try {
    const { width, height, seconds } = probeVideo(join(dir, name));
    return { src: `brand/custom/${name}`, width, height, seconds };
  } catch {
    return null;
  }
};

// Throws when the staged intro cannot be used; returns what the panel shows about it.
export const validateIntro = (path) => {
  const info = probeVideo(path);
  if (info.seconds > MAX_INTRO_SECONDS) {
    throw new Error(`Intro dài ${info.seconds.toFixed(1)}s, tối đa ${MAX_INTRO_SECONDS}s.`);
  }
  return info;
};

const removeCustom = (kind, dir, keep = '') => {
  for (const name of customFiles(kind, dir)) if (name !== keep) unlinkSync(join(dir, name));
};

// Stage the bytes under a temporary name, let `validate` reject them, then promote the file and
// drop the previous upload. A rejected upload leaves the current asset untouched. `ext` carries the
// dot; the temporary name keeps it because ffprobe sniffs the container from it.
export const saveCustomAsset = (kind, buf, ext, validate = () => {}, dir = CUSTOM_DIR) => {
  mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const staged = join(dir, `staging-${stamp}${ext}`);
  writeFileSync(staged, buf);
  try {
    const checked = validate(staged);
    const name = `${kind}-${stamp}${ext}`;
    renameSync(staged, join(dir, name));
    removeCustom(kind, dir, name);
    return { name, checked };
  } catch (error) {
    if (existsSync(staged)) unlinkSync(staged);
    throw error;
  }
};

export const resetCustomAsset = (kind, dir = CUSTOM_DIR) => removeCustom(kind, dir);

// Newest mtime in the custom folder (and the folder itself, which moves when a file is removed),
// so build-remotion treats an upload or reset as a changed input.
export const customAssetsMtime = (dir = CUSTOM_DIR) => {
  if (!existsSync(dir)) return 0;
  return Math.max(statSync(dir).mtimeMs, ...readdirSync(dir).map((name) => statSync(join(dir, name)).mtimeMs));
};
