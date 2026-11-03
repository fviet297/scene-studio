import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioSourceOf, isAudioSource, isValidVoiceFor } from './audio-source.mjs';

test('audioSourceOf defaults to omnivoice when the header is absent or unknown', () => {
  assert.equal(audioSourceOf('# Title\n\nvoice: history-v2\n'), 'omnivoice');
  assert.equal(audioSourceOf('# Title\n\naudio: nope\n'), 'omnivoice');
});

test('audioSourceOf reads the audio header', () => {
  assert.equal(audioSourceOf('# Title\n\naudio: vieneu\nvoice: Mai Anh\n'), 'vieneu');
});

test('isAudioSource accepts only known engines', () => {
  assert.ok(isAudioSource('vieneu'));
  assert.ok(isAudioSource('elevenlabs'));
  assert.equal(audioSourceOf('# Title\n\naudio: elevenlabs\n'), 'elevenlabs');
  assert.ok(!isAudioSource('azure'));
});

test('voice names are validated per engine', () => {
  assert.ok(isValidVoiceFor('vieneu', 'Hải Đăng'));
  assert.ok(!isValidVoiceFor('omnivoice', 'Hải Đăng'));
  assert.ok(isValidVoiceFor('omnivoice', 'history-v2'));
  assert.ok(!isValidVoiceFor('vieneu', 'a/b'));
  assert.ok(isValidVoiceFor('elevenlabs', '21m00Tcm4TlvDq8ikWAM'));
  assert.ok(!isValidVoiceFor('elevenlabs', 'a/b'));
  assert.ok(!isValidVoiceFor('elevenlabs', 'Hải Đăng'));
});
