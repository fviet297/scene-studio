// Which narration text a scene's audio was generated from. The text is kept in scene-NN.txt beside
// scene-NN.mp3, so it follows the mp3 through renumbering (scene-shift.mjs), deletion and the
// panel's audio undo. Comparing it with the plan's current narration tells the panel the audio is
// out of date after the narration was edited, merged or replaced.

import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sceneBase } from './project-paths.mjs';

const recordPath = (audioDir, scene) => join(audioDir, `${sceneBase(scene)}.txt`);
const normalise = (text) => text.replace(/\s+/g, ' ').trim();

// /api/state asks this for every scene; the file only changes when audio is (re)generated, so the
// text is cached against its mtime and this module's own writes drop the entry.
const textCache = new Map();

export const readAudioNarration = (audioDir, scene) => {
  const file = recordPath(audioDir, scene);
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return null;
  }
  const hit = textCache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.text;
  const text = readFileSync(file, 'utf8');
  textCache.set(file, { mtimeMs, text });
  return text;
};

export const writeAudioNarration = (audioDir, scene, narration) => {
  const file = recordPath(audioDir, scene);
  textCache.delete(file);
  writeFileSync(file, narration);
};

export const clearAudioNarration = (audioDir, scene) => {
  textCache.delete(recordPath(audioDir, scene));
  rmSync(recordPath(audioDir, scene), { force: true });
};

// Call only for a scene whose mp3 exists. Audio generated before this record existed has no
// source text to compare, so it is adopted as up to date with the narration it has now.
export const isAudioStale = (audioDir, scene, narration) => {
  const recorded = readAudioNarration(audioDir, scene);
  if (recorded === null) {
    writeAudioNarration(audioDir, scene, narration);
    return false;
  }
  return normalise(recorded) !== normalise(narration);
};
