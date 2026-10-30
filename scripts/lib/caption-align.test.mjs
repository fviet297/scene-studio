import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './ensure-ffmpeg.mjs';
import { alignCaptions, analyseAudio } from './caption-align.mjs';

// 1s tone, 1s silence, 1s tone.
const makeNarration = (dir, name) => {
  const file = join(dir, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-filter_complex', '[0][1][2]concat=n=3:v=0:a=1', file]);
  return file;
};

test('finds the speech regions around a silence and caches the analysis next to the audio', () => {
  const dir = mkdtempSync(join(tmpdir(), 'align-'));
  const file = makeNarration(dir, 'scene-01.mp3');
  const first = analyseAudio(file);
  assert.equal(first.speech.length, 2);
  assert.ok(first.duration > 2.9 && first.duration < 3.2, `duration ${first.duration}`);
  assert.ok(existsSync(join(dir, '.speech-regions.json')));
  assert.deepEqual(analyseAudio(file), first);
});

test('a cache hit does not re-run the analysis: it is served even when the cached value is changed on disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'align-'));
  const file = makeNarration(dir, 'scene-01.mp3');
  analyseAudio(file);
  const cachePath = join(dir, '.speech-regions.json');
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  cache.files['scene-01.mp3'].speech = [[0, 0.5]];
  execFileSync('node', ['-e', `require('node:fs').writeFileSync(${JSON.stringify(cachePath)}, ${JSON.stringify(JSON.stringify(cache))})`]);
  assert.deepEqual(analyseAudio(file).speech, [[0, 0.5]]);
});

test('a changed audio file is analysed again', () => {
  const dir = mkdtempSync(join(tmpdir(), 'align-'));
  const file = makeNarration(dir, 'scene-01.mp3');
  const before = analyseAudio(file);
  const later = new Date(Date.now() + 5000);
  utimesSync(file, later, later);
  assert.deepEqual(analyseAudio(file), before);
  assert.notEqual(JSON.parse(readFileSync(join(dir, '.speech-regions.json'), 'utf8')).files['scene-01.mp3'].mtimeMs, undefined);
});

test('alignCaptions still spreads the words over the speech and reports them in order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'align-'));
  makeNarration(dir, 'scene-01.mp3');
  const { groups } = alignCaptions([{ scene: 1, text: 'một hai ba bốn năm sáu' }], dir);
  const words = groups.flat();
  assert.equal(words.length, 6);
  assert.ok(words.every((w, i) => i === 0 || w.start >= words[i - 1].start));
});
