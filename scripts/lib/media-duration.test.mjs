import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './ensure-ffmpeg.mjs';
import { mediaDuration } from './media-duration.mjs';

const tone = (dir, name, seconds) => {
  const file = join(dir, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, file]);
  return file;
};

test('measures a file and caches the length next to it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duration-'));
  const file = tone(dir, 'scene-01.mp3', 2);
  const seconds = mediaDuration(file);
  assert.ok(seconds > 1.9 && seconds < 2.2, `seconds ${seconds}`);
  assert.ok(existsSync(join(dir, '.durations.json')));
});

test('an unchanged file is served from the cache', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duration-'));
  const file = tone(dir, 'scene-01.mp3', 2);
  mediaDuration(file);
  const cachePath = join(dir, '.durations.json');
  const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
  cache['scene-01.mp3'].seconds = 99;
  writeFileSync(cachePath, JSON.stringify(cache));
  assert.equal(mediaDuration(file), 99);
});

test('a replaced file is measured again', () => {
  const dir = mkdtempSync(join(tmpdir(), 'duration-'));
  const file = tone(dir, 'scene-01.mp3', 2);
  mediaDuration(file);
  tone(dir, 'scene-01.mp3', 4);
  const seconds = mediaDuration(file);
  assert.ok(seconds > 3.9 && seconds < 4.2, `seconds ${seconds}`);
});
