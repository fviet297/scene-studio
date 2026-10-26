// node --test scripts/lib/motion-source.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adoptMotionSource, clearMotionSource, imageFingerprint, isMotionStale, readMotionSource, writeMotionSource } from './motion-source.mjs';

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion-source-'));
  const image = join(dir, 'scene-03.jpg');
  const clip = join(dir, 'scene-03.mp4');
  return { dir, image, clip };
};

// Sets a file's mtime to `seconds` after the epoch, so tests do not depend on write timing.
const at = (file, seconds) => utimesSync(file, seconds, seconds);

test('a clip recorded with the current image is not stale; a replaced image makes it stale', () => {
  const { dir, image, clip } = setup();
  writeFileSync(image, 'old image');
  writeFileSync(clip, 'clip');
  writeMotionSource(dir, 3, imageFingerprint(image));
  assert.equal(isMotionStale(dir, 3, image), false);

  writeFileSync(image, 'new image');
  assert.equal(isMotionStale(dir, 3, image), true);
});

test('restoring the original image (undo) makes the clip current again', () => {
  const { dir, image, clip } = setup();
  writeFileSync(image, 'original');
  writeFileSync(clip, 'clip');
  writeMotionSource(dir, 3, imageFingerprint(image));
  writeFileSync(image, 'regenerated');
  assert.equal(isMotionStale(dir, 3, image), true);

  writeFileSync(image, 'original');
  assert.equal(isMotionStale(dir, 3, image), false);
});

test('a clip without a record falls back to mtimes: stale only when the image is newer', () => {
  const { dir, image, clip } = setup();
  writeFileSync(image, 'image');
  writeFileSync(clip, 'clip');
  at(image, 1000);
  at(clip, 2000);
  assert.equal(isMotionStale(dir, 3, image), false);

  at(image, 3000);
  assert.equal(isMotionStale(dir, 3, image), true);
});

test('adopting before an image change records the image the clip was made from', () => {
  const { dir, image, clip } = setup();
  writeFileSync(image, 'source image');
  writeFileSync(clip, 'clip');
  at(image, 1000);
  at(clip, 2000);

  adoptMotionSource(dir, 3, image);
  assert.equal(readMotionSource(dir, 3), imageFingerprint(image));

  writeFileSync(image, 'regenerated');
  at(image, 1500); // older than the clip: only the fingerprint can tell
  assert.equal(isMotionStale(dir, 3, image), true);
});

test('adopting never blesses an image that is already newer than the clip', () => {
  const { dir, image, clip } = setup();
  writeFileSync(image, 'replaced image');
  writeFileSync(clip, 'clip');
  at(clip, 1000);
  at(image, 2000);

  adoptMotionSource(dir, 3, image);
  assert.equal(readMotionSource(dir, 3), null);
  assert.equal(isMotionStale(dir, 3, image), true);
});

test('no clip or no image is never stale, and clearing removes the record', () => {
  const { dir, image, clip } = setup();
  writeFileSync(image, 'image');
  assert.equal(isMotionStale(dir, 3, image), false);

  writeFileSync(clip, 'clip');
  writeMotionSource(dir, 3, 'abc');
  assert.equal(isMotionStale(dir, 3, join(dir, 'missing.jpg')), false);

  clearMotionSource(dir, 3);
  assert.equal(readMotionSource(dir, 3), null);
});

test('writing a null fingerprint clears the record (undo to a state without one)', () => {
  const { dir } = setup();
  writeMotionSource(dir, 3, 'abc');
  writeMotionSource(dir, 3, null);
  assert.equal(readMotionSource(dir, 3), null);
});
