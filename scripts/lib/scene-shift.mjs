// Renumber scenes on disk when one is inserted or removed. A scene's number is its identity
// (scene-NN.jpg/.mp3/.mp4, the image manifest row, its undo history), so the plan block alone
// cannot be renumbered — the media has to follow or it would sit under the wrong scene.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sceneBase } from './project-paths.mjs';

const SCENE_NAME_RE = /^scene-(\d+)(\..+)?$/;
const HISTORY_KINDS = ['image', 'audio', 'motion'];

const sceneEntries = (dir) => (existsSync(dir)
  ? readdirSync(dir)
    .map((name) => ({ name, match: SCENE_NAME_RE.exec(name) }))
    .filter(({ match }) => match)
    .map(({ name, match }) => ({ name, scene: Number(match[1]), ext: match[2] ?? '' }))
  : []);

// Rename every scene-NN[.ext] entry of `dir` with NN >= from to NN+delta. Moving up goes highest
// first, moving down lowest first, so a rename never lands on an entry that has not moved yet.
// Returns the new numbers it produced.
const shiftEntries = (dir, from, delta) => sceneEntries(dir)
  .filter(({ scene }) => scene >= from)
  .sort((a, b) => (delta > 0 ? b.scene - a.scene : a.scene - b.scene))
  .map(({ name, scene, ext }) => {
    const next = scene + delta;
    renameSync(join(dir, name), join(dir, `${sceneBase(next)}${ext}`));
    return next;
  });

const renumberRow = (row, scene) => ({ ...row, scene, id: sceneBase(scene) });

// Drop the row of `removed` (when given) and move every later row by `delta`.
const shiftManifest = (manifestFile, from, delta, removed = null) => {
  if (!existsSync(manifestFile)) return null;
  const rows = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const droppedRow = rows.find((row) => row.scene === removed) ?? null;
  const next = rows
    .filter((row) => row.scene !== removed)
    .map((row) => (row.scene >= from ? renumberRow(row, row.scene + delta) : row))
    .sort((a, b) => a.scene - b.scene || a.id.localeCompare(b.id));
  writeFileSync(manifestFile, `${JSON.stringify(next, null, 2)}\n`);
  return droppedRow;
};

// An image undo step carries the manifest row to restore; it must name the scene's new number.
const shiftImageHistoryMeta = (imageHistoryDir, shiftedScenes) => {
  for (const scene of shiftedScenes) {
    const indexFile = join(imageHistoryDir, sceneBase(scene), 'index.json');
    if (!existsSync(indexFile)) continue;
    const index = JSON.parse(readFileSync(indexFile, 'utf8'));
    const renumber = (entry) => (entry.meta ? { ...entry, meta: renumberRow(entry.meta, scene) } : entry);
    writeFileSync(indexFile, JSON.stringify({ undo: index.undo.map(renumber), redo: index.redo.map(renumber) }));
  }
};

const shiftAll = (paths, from, delta, removed = null) => {
  for (const dir of [paths.imageDir, paths.audioDir, paths.sceneVideoDir]) shiftEntries(dir, from, delta);
  for (const kind of HISTORY_KINDS) {
    const shifted = shiftEntries(join(paths.historyDir, kind), from, delta);
    if (kind === 'image') shiftImageHistoryMeta(join(paths.historyDir, kind), shifted);
  }
  return shiftManifest(paths.manifest, from, delta, removed);
};

// Make room for a new scene `at`: scenes >= at move up by one.
export const shiftSceneMedia = (paths, at) => { shiftAll(paths, at, 1); };

// Take scene `n` out of the media tree and close the gap. Its files are moved into `trashDir`
// (not deleted: generated images and audio cost money), then later scenes move down by one.
export const removeSceneMedia = (paths, n, trashDir) => {
  const stash = (label, dir) => {
    for (const { name, scene } of sceneEntries(dir)) {
      if (scene !== n) continue;
      mkdirSync(join(trashDir, label), { recursive: true });
      renameSync(join(dir, name), join(trashDir, label, name));
    }
  };
  stash('images', paths.imageDir);
  stash('audio', paths.audioDir);
  stash('scene-videos', paths.sceneVideoDir);
  for (const kind of HISTORY_KINDS) stash(`history-${kind}`, join(paths.historyDir, kind));
  const droppedRow = shiftAll(paths, n + 1, -1, n);
  if (droppedRow) {
    mkdirSync(trashDir, { recursive: true });
    writeFileSync(join(trashDir, 'manifest-row.json'), `${JSON.stringify(droppedRow, null, 2)}\n`);
  }
};
