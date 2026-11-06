import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateNarrationSeconds, groupShotSeconds, MIN_STILL_SECONDS, MIN_TAIL_SHOT_SECONDS, parseMotionDuration, shotCountFor, shotGroups } from './shot-timing.mjs';

test('scenes without narration join the narration before them as extra shots', () => {
  const scenes = [{ narration: 'a' }, { narration: '' }, { narration: '' }, { narration: 'b' }, { narration: 'c' }, { narration: '' }];
  assert.deepEqual(shotGroups(scenes), [
    { head: 0, members: [0, 1, 2] },
    { head: 3, members: [3] },
    { head: 4, members: [4, 5] },
  ]);
});

test('a leading scene without narration starts its own group', () => {
  assert.deepEqual(shotGroups([{ narration: '' }, { narration: '' }, { narration: 'a' }]), [
    { head: 0, members: [0, 1] },
    { head: 2, members: [2] },
  ]);
});

test('stills with no motion split the narration evenly', () => {
  assert.deepEqual(groupShotSeconds({ audio: 22, shots: [{ clip: 0 }, { clip: 0 }] }), [11, 11]);
});

test('a single shot behaves like the old one-image scene', () => {
  assert.deepEqual(groupShotSeconds({ audio: 7, shots: [{ clip: 0 }] }), [7]);
  assert.deepEqual(groupShotSeconds({ audio: 7, shots: [{ clip: 10 }] }), [7]);
  assert.deepEqual(groupShotSeconds({ audio: 12, shots: [{ clip: 10 }] }), [12]);
  assert.deepEqual(groupShotSeconds({ audio: 7, shots: [{ clip: 0, minDuration: 9 }] }), [9]);
});

test('motion shots keep their clip length and the stills share the rest', () => {
  assert.deepEqual(groupShotSeconds({ audio: 22, shots: [{ clip: 10 }, { clip: 0 }, { clip: 0 }] }), [10, 6, 6]);
});

test('stills get a minimum when the clips already fill the narration', () => {
  assert.deepEqual(groupShotSeconds({ audio: 12, shots: [{ clip: 10 }, { clip: 10 }, { clip: 0 }] }), [10, 10, MIN_STILL_SECONDS]);
});

test('clips shorter than the narration are stretched to span it', () => {
  assert.deepEqual(groupShotSeconds({ audio: 22, shots: [{ clip: 10 }, { clip: 10 }] }), [11, 11]);
});

test('clips longer than the narration have the last shot cut at its end', () => {
  assert.deepEqual(groupShotSeconds({ audio: 24, shots: [{ clip: 10 }, { clip: 10 }, { clip: 10 }] }), [10, 10, 4]);
});

test('the cut last shot keeps a minimum, and a minimum duration still wins', () => {
  assert.deepEqual(groupShotSeconds({ audio: 20, shots: [{ clip: 10 }, { clip: 10 }, { clip: 10 }] }), [10, 10, MIN_TAIL_SHOT_SECONDS]);
  assert.deepEqual(groupShotSeconds({ audio: 22, shots: [{ clip: 10 }, { clip: 10 }, { clip: 10, minDuration: 5 }] }), [10, 10, 5]);
});

test('without audio a still holds its minimum or the placeholder, a clip its length', () => {
  assert.deepEqual(groupShotSeconds({ audio: null, shots: [{ clip: 0 }, { clip: 6 }, { clip: 0, minDuration: 3 }] }), [4, 6, 3]);
});

test('shot count rounds down so clips are stretched, not left running past the narration', () => {
  assert.equal(shotCountFor(22, 10), 2);
  assert.equal(shotCountFor(22.2, 10), 2);
  assert.equal(shotCountFor(20, 10), 2);
  assert.equal(shotCountFor(12, 10), 1);
  assert.equal(shotCountFor(3, 10), 1);
  assert.equal(shotCountFor(22, undefined), 1);
});

test('shot count adds a shot when stretching would slow the clips too much', () => {
  assert.equal(shotCountFor(26, 10), 3);
  assert.equal(shotCountFor(16, 10), 2);
});

test('narration length is estimated from its letters, ignoring diacritics, spaces and punctuation', () => {
  // 24 letters and digits
  assert.equal(estimateNarrationSeconds('Năm 1533, giữa đất Ai Lao người'), 24 / 13.5);
});

test('motion-duration accepts seconds within the bounds', () => {
  assert.deepEqual(parseMotionDuration('10'), { value: 10 });
  assert.deepEqual(parseMotionDuration('7,5s'), { value: 7.5 });
  assert.deepEqual(parseMotionDuration(''), { value: undefined });
  assert.match(parseMotionDuration('0').error, /motion-duration/);
  assert.match(parseMotionDuration('abc').error, /motion-duration/);
});
