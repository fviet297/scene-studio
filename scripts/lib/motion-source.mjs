// Which image a scene's motion clip was animated from. A fingerprint of that image is kept in
// scene-NN.source.txt beside scene-NN.mp4, so it follows the clip through renumbering
// (scene-shift.mjs), deletion and the panel's motion undo. Comparing it with the scene's current
// image tells the preview and the render that the image was regenerated or replaced after the clip
// was made, so they show the new image instead of animating the old one.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sceneBase } from './project-paths.mjs';

const recordPath = (videoDir, scene) => join(videoDir, `${sceneBase(scene)}.source.txt`);
const clipPath = (videoDir, scene) => join(videoDir, `${sceneBase(scene)}.mp4`);

// Every panel state request checks every scene, so a file is hashed again only when it changed.
const fingerprintCache = new Map();

export const imageFingerprint = (imagePath) => {
  if (!existsSync(imagePath)) return null;
  const { mtimeMs, size } = statSync(imagePath);
  const cached = fingerprintCache.get(imagePath);
  if (cached?.mtimeMs === mtimeMs && cached.size === size) return cached.hash;
  const hash = createHash('sha1').update(readFileSync(imagePath)).digest('hex');
  fingerprintCache.set(imagePath, { mtimeMs, size, hash });
  return hash;
};

export const readMotionSource = (videoDir, scene) => {
  const file = recordPath(videoDir, scene);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
};

export const writeMotionSource = (videoDir, scene, fingerprint) => {
  if (fingerprint) writeFileSync(recordPath(videoDir, scene), fingerprint);
  else clearMotionSource(videoDir, scene);
};

export const clearMotionSource = (videoDir, scene) => {
  rmSync(recordPath(videoDir, scene), { force: true });
};

// A clip made before this record existed has nothing to compare, so it counts as made from the
// image only while that image is not newer than the clip itself.
export const isMotionStale = (videoDir, scene, imagePath) => {
  const clip = clipPath(videoDir, scene);
  if (!existsSync(clip) || !existsSync(imagePath)) return false;
  const recorded = readMotionSource(videoDir, scene);
  if (recorded === null) return statSync(imagePath).mtimeMs > statSync(clip).mtimeMs;
  return recorded !== imageFingerprint(imagePath);
};

// Called before a scene's image is overwritten: a clip without a record gets one naming the image
// it was made from, so the change about to happen is caught by fingerprint, not by mtime.
export const adoptMotionSource = (videoDir, scene, imagePath) => {
  if (!existsSync(clipPath(videoDir, scene)) || readMotionSource(videoDir, scene) !== null) return;
  if (isMotionStale(videoDir, scene, imagePath)) return;
  writeMotionSource(videoDir, scene, imageFingerprint(imagePath));
};
