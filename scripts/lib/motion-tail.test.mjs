import test from 'node:test';
import assert from 'node:assert/strict';
import { deadTailSeconds, softHeadSeconds } from './motion-tail.mjs';

const FPS = 24;
const flat = (value, count) => new Array(count).fill(value);

test('a clip that keeps moving to the end has no dead tail', () => {
  assert.equal(deadTailSeconds(flat(10, 120), FPS), 0);
});

test('measures the seconds at the end where motion has died down', () => {
  const activity = [...flat(12, 96), ...flat(0.5, 24)];
  const tail = deadTailSeconds(activity, FPS);
  assert.ok(tail > 0.7 && tail <= 1, `tail ${tail}`);
});

test('a gradual ease-out counts only the part below a quarter of the peak', () => {
  const ramp = Array.from({ length: 48 }, (_, i) => 12 * (1 - i / 48));
  const tail = deadTailSeconds([...flat(12, 72), ...ramp], FPS);
  assert.ok(tail > 0.3 && tail < 1.2, `tail ${tail}`);
});

test('a clip that never moves, or has no frames, reports no tail', () => {
  assert.equal(deadTailSeconds(flat(0, 100), FPS), 0);
  assert.equal(deadTailSeconds([], FPS), 0);
});

test('the tail is capped so a mostly-still clip does not swallow the scene', () => {
  const activity = [...flat(12, 24), ...flat(0.2, 192)];
  assert.equal(deadTailSeconds(activity, FPS), 1.2);
});

test('skips the soft frames at the start of a clip until detail settles', () => {
  const edge = [...flat(70, 7), ...flat(100, 33)];
  assert.equal(softHeadSeconds(edge, FPS), 0.29);
});

test('a clip that is sharp from the first frame has no soft head', () => {
  assert.equal(softHeadSeconds(flat(100, 40), FPS), 0);
});

test('a clip that stays soft is capped, not trimmed away', () => {
  assert.equal(softHeadSeconds([...flat(60, 25), ...flat(100, 15)], FPS), 0.4);
});

test('a single dark first frame counts as a one-frame head', () => {
  assert.equal(softHeadSeconds([40, ...flat(100, 39)], FPS), 0.04);
});

test('too few frames to judge reports no head', () => {
  assert.equal(softHeadSeconds(flat(50, 10), FPS), 0);
});

test('catches a dip that starts a frame or two after a sharp first frame', () => {
  const edge = [91, 88, 85, 80, 78, 78, 80, 85, ...flat(101, 32)];
  assert.equal(softHeadSeconds(edge, FPS), 0.33);
});
