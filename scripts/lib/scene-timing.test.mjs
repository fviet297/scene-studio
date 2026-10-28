// node --test scripts/lib/scene-timing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACEHOLDER_SCENE_SECONDS, parseMinDuration, sceneContentSeconds } from './scene-timing.mjs';

test('a scene with no minimum lasts as long as its audio or its clip, whichever is longer', () => {
  assert.equal(sceneContentSeconds({ audio: 6.2, clip: 5 }), 6.2);
  assert.equal(sceneContentSeconds({ audio: 6.2, clip: 8 }), 8);
});

test('a scene without audio holds for the placeholder length', () => {
  assert.equal(sceneContentSeconds({ audio: null, clip: 0 }), PLACEHOLDER_SCENE_SECONDS);
});

test('a minimum longer than the audio and clip holds the scene for the minimum', () => {
  assert.equal(sceneContentSeconds({ audio: 6.2, clip: 5, minDuration: 9 }), 9);
});

test('a minimum never cuts narration: audio longer than the minimum wins', () => {
  assert.equal(sceneContentSeconds({ audio: 6.2, clip: 0, minDuration: 3 }), 6.2);
});

test('a scene without audio holds for its minimum instead of the placeholder', () => {
  assert.equal(sceneContentSeconds({ audio: null, clip: 0, minDuration: 2.5 }), 2.5);
  assert.equal(sceneContentSeconds({ audio: null, clip: 7, minDuration: 2.5 }), 7);
});

test('parseMinDuration reads seconds, with or without a trailing "s" or a decimal comma', () => {
  assert.deepEqual(parseMinDuration('8'), { value: 8 });
  assert.deepEqual(parseMinDuration('7.5s'), { value: 7.5 });
  assert.deepEqual(parseMinDuration(' 4,5 '), { value: 4.5 });
});

test('parseMinDuration treats a blank value as "no minimum"', () => {
  assert.deepEqual(parseMinDuration(''), { value: undefined });
  assert.deepEqual(parseMinDuration('   '), { value: undefined });
});

test('parseMinDuration rejects zero, negatives, text and absurd lengths', () => {
  for (const raw of ['0', '-3', 'abc', '8 giây nữa', '601']) {
    assert.ok(parseMinDuration(raw).error, `expected an error for ${JSON.stringify(raw)}`);
  }
});
