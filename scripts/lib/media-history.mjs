// Undo / redo for scene media (image, audio, motion video). Before a file is overwritten or
// removed, its current state is copied into a per-file history folder; undo swaps the file back
// and parks what it replaced on a redo stack, redo does the reverse. A new change after an undo
// drops the redo stack, like any editor. Each stack keeps the last MAX_HISTORY states.
//
// An entry is { id, meta }: id names the copied file inside the history folder (null = the file
// did not exist, so restoring it deletes the file); meta is caller data to put back alongside the
// file (the image's manifest entry).
//
// A caller wraps every write in beginChange → write → settleChange. settleChange keeps the snapshot
// only when the file really changed, so a failed or cancelled generation never leaves a no-op step
// behind.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, extname, join } from 'node:path';

export const MAX_HISTORY = 10;

const INDEX = 'index.json';

const readIndex = (dir) => {
  try {
    return JSON.parse(readFileSync(join(dir, INDEX), 'utf8'));
  } catch {
    return { undo: [], redo: [] };
  }
};

const writeIndex = (dir, index) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, INDEX), JSON.stringify(index));
};

const dropEntry = (dir, entry) => {
  if (entry.id) rmSync(join(dir, entry.id), { force: true });
};

const capture = (dir, file, meta) => {
  if (!existsSync(file)) return { id: null, meta };
  mkdirSync(dir, { recursive: true });
  const id = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}${extname(file)}`;
  copyFileSync(file, join(dir, id));
  return { id, meta };
};

const apply = (dir, file, entry) => {
  if (!entry.id) {
    rmSync(file, { force: true });
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(join(dir, entry.id), file);
  rmSync(join(dir, entry.id), { force: true });
};

const matchesFile = (dir, file, entry) => {
  if (!entry.id) return !existsSync(file);
  const copy = join(dir, entry.id);
  if (!existsSync(file) || !existsSync(copy)) return false;
  return statSync(file).size === statSync(copy).size && readFileSync(file).equals(readFileSync(copy));
};

// A single `<file>.bak` from the old one-level undo becomes the first undo step.
const ingestLegacyBackup = (dir, file, index) => {
  const legacy = `${file}.bak`;
  if (!existsSync(legacy)) return index;
  mkdirSync(dir, { recursive: true });
  const id = `legacy-${randomBytes(3).toString('hex')}${extname(file)}`;
  copyFileSync(legacy, join(dir, id));
  const sidecar = `${legacy}.json`;
  let meta = null;
  if (existsSync(sidecar)) {
    try { meta = JSON.parse(readFileSync(sidecar, 'utf8')); } catch { meta = null; }
    rmSync(sidecar, { force: true });
  }
  rmSync(legacy, { force: true });
  const next = { ...index, undo: [{ id, meta }, ...index.undo] };
  writeIndex(dir, next);
  return next;
};

const loadIndex = (dir, file) => ingestLegacyBackup(dir, file, readIndex(dir));

export const beginChange = (dir, file, meta = null) => capture(dir, file, meta);

// Returns true when the file differs from the snapshot taken by beginChange and the step was kept.
export const settleChange = (dir, file, pending) => {
  if (matchesFile(dir, file, pending)) {
    dropEntry(dir, pending);
    return false;
  }
  const index = loadIndex(dir, file);
  index.redo.forEach((entry) => dropEntry(dir, entry));
  index.undo.push(pending);
  while (index.undo.length > MAX_HISTORY) dropEntry(dir, index.undo.shift());
  writeIndex(dir, { undo: index.undo, redo: [] });
  return true;
};

// Steps the panel offers. An undo entry with no file (id null) is the state before the very first
// version existed: undoing it would delete the media, so it is not offered as a step.
export const historyCounts = (dir, file) => {
  const { undo, redo } = loadIndex(dir, file);
  return { undo: undo.filter((entry) => entry.id).length, redo: redo.length };
};

// Move one step along `from` → `to`. Returns { meta } of the restored state, or null when `from`
// is empty. A step identical to the file as it is now is skipped, so every press changes something.
const step = (dir, file, currentMeta, fromKey, toKey) => {
  const index = loadIndex(dir, file);
  let target = index[fromKey].pop();
  while (target && matchesFile(dir, file, target)) {
    dropEntry(dir, target);
    target = index[fromKey].pop();
  }
  if (!target) {
    writeIndex(dir, index);
    return null;
  }
  index[toKey].push(capture(dir, file, currentMeta));
  apply(dir, file, target);
  writeIndex(dir, index);
  return { meta: target.meta };
};

export const undoChange = (dir, file, currentMeta = null) => step(dir, file, currentMeta, 'undo', 'redo');
export const redoChange = (dir, file, currentMeta = null) => step(dir, file, currentMeta, 'redo', 'undo');
