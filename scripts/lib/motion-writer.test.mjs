// node --test scripts/lib/motion-writer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeMotionPrompt } from './motion-writer.mjs';

const parts = { camera: 'Slow push-in along the quay', action: 'Carpenters tap pegs into the hull', env: 'Water slaps the hulls' };

test('the default wrapper keeps the identity lock and the artifact ban', () => {
  const prompt = composeMotionPrompt(parts, { charCount: 1 });
  assert.match(prompt, /no text or watermark/);
  assert.match(prompt, /No face deformation, warped limbs, extra fingers/);
});

test('the plain wrapper asks for nothing to be absent and keeps the scene fields in order', () => {
  const prompt = composeMotionPrompt(parts, { plain: true });
  assert.doesNotMatch(prompt, /\b(no|not|without)\b|text|watermark|face|finger|limb/i);
  const at = (text) => prompt.indexOf(text);
  assert.ok(at('Slow push-in') < at('Carpenters tap') && at('Carpenters tap') < at('Water slaps'));
  assert.match(prompt, /^Animate this illustrated scene into a smooth cinematic shot/);
});

test('a somber cue gets the calm plain wrapper', () => {
  const prompt = composeMotionPrompt(parts, { cue: 'somber', plain: true });
  assert.match(prompt, /^Animate this illustrated scene into a calm cinematic shot/);
  assert.match(prompt, /Gentle, natural motion/);
});
