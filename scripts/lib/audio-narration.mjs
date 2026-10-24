// Which narration text a scene's audio was generated from. The text is kept in scene-NN.txt beside
// scene-NN.mp3, so it follows the mp3 through renumbering (scene-shift.mjs), deletion and the
// panel's audio undo. Comparing it with the plan's current narration tells the panel the audio is
// out of date after the narration was edited, merged or replaced.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sceneBase } from './project-paths.mjs';

const recordPath = (audioDir, scene) => join(audioDir, `${sceneBase(scene)}.txt`);
const normalise = (text) => text.replace(/\s+/g, ' ').trim();

export const readAudioNarration = (audioDir, scene) => {
  const file = recordPath(audioDir, scene);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

export const writeAudioNarration = (audioDir, scene, narration) => {
  writeFileSync(recordPath(audioDir, scene), narration);
};

export const clearAudioNarration = (audioDir, scene) => {
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
