// node --test scripts/lib/scene-image-edit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEditPrompt, editedManifestEntry } from './scene-image-edit.mjs';

test('the edit prompt carries the typed change and tells the model to keep everything else', () => {
  const prompt = buildEditPrompt('  đổi áo của vua sang màu đỏ  ');
  assert.match(prompt, /CHANGE \(may be written in Vietnamese[^)]*\): đổi áo của vua sang màu đỏ\n/);
  assert.match(prompt, /Change ONLY what the CHANGE below asks for/);
  assert.match(prompt, /KEEP IDENTICAL: the composition/);
  assert.match(prompt, /Everything not named in the CHANGE stays identical/);
  assert.match(prompt, /^NO TEXT:/, 'the no-lettering policy still leads the prompt');
});

test('an edited picture is labelled AI even when the image before it was the person\'s upload', () => {
  const upload = { id: 'scene-03', scene: 3, type: 'user_upload', authenticity: 'USER_UPLOAD', license: 'Provided by the user', characters: ['char-a'], subject: 'photo' };
  const entry = editedManifestEntry(upload, { scene: 3, id: 'scene-03', model: 'xai/grok-imagine-image' });
  assert.equal(entry.authenticity, 'AI_RECONSTRUCTION');
  assert.equal(entry.type, 'ai_reconstruction');
  assert.match(entry.license, /AI-generated/);
  assert.deepEqual(entry.characters, ['char-a']);
  assert.equal(entry.subject, 'photo');
});

test('a scene without a manifest entry gets one from the plan characters', () => {
  const entry = editedManifestEntry(undefined, { scene: 5, id: 'scene-05', model: 'muse:muse-image', characters: ['char-b'] });
  assert.equal(entry.id, 'scene-05');
  assert.deepEqual(entry.characters, ['char-b']);
  assert.equal(entry.credit, 'AI reconstruction (muse:muse-image edit)');
});
