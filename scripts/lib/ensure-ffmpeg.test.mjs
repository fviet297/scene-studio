import test from 'node:test';
import assert from 'node:assert/strict';
import { delimiter, join } from 'node:path';
import { pathWithFirst, pathWithLocalFfmpeg } from './ensure-ffmpeg.mjs';

const path = (...dirs) => dirs.join(delimiter);
const has = (...dirs) => (file) => dirs.some((dir) => file.startsWith(`${dir}/`));

test('moves the first folder that holds the binary to the front, keeping the others in order', () => {
  const result = pathWithFirst(path('/a', '/b', '/brew', '/c'), 'ffprobe', has('/brew'));
  assert.equal(result, path('/brew', '/a', '/b', '/c'));
});

test('leaves PATH alone when the binary is already in the first folder', () => {
  const original = path('/brew', '/a');
  assert.equal(pathWithFirst(original, 'ffprobe', has('/brew')), original);
});

test('leaves PATH alone when no folder has the binary', () => {
  const original = path('/a', '/b');
  assert.equal(pathWithFirst(original, 'ffprobe', () => false), original);
});

test('only the first match moves when several folders have the binary', () => {
  const result = pathWithFirst(path('/a', '/one', '/two'), 'ffprobe', has('/one', '/two'));
  assert.equal(result, path('/one', '/a', '/two'));
});

test('empty entries in PATH are skipped', () => {
  assert.equal(pathWithFirst(path('', '/a'), 'ffprobe', () => true), path('/a', ''));
});

const hasFile = (...files) => (file) => files.includes(file);

test('puts the per-machine ffmpeg folder first when no PATH folder has ffmpeg', () => {
  const local = join('/repo', 'tools', 'ffmpeg');
  const result = pathWithLocalFfmpeg(path('/a', '/remotion'), local, 'ffmpeg', hasFile(join(local, 'ffmpeg')));
  assert.equal(result, path(local, '/a', '/remotion'));
});

test('a system ffmpeg on PATH wins over the per-machine folder', () => {
  const local = join('/repo', 'tools', 'ffmpeg');
  const original = path('/a', '/usr/bin');
  const exists = hasFile(join('/usr/bin', 'ffmpeg'), join(local, 'ffmpeg'));
  assert.equal(pathWithLocalFfmpeg(original, local, 'ffmpeg', exists), original);
});

test('leaves PATH alone when the per-machine folder has no ffmpeg', () => {
  const original = path('/a');
  assert.equal(pathWithLocalFfmpeg(original, join('/repo', 'tools', 'ffmpeg'), 'ffmpeg', () => false), original);
});

test('a child process keeps the per-machine ffmpeg first even after the Remotion folder moved ahead', () => {
  const local = join('/repo', 'tools', 'ffmpeg');
  const remotion = join('/repo', 'node_modules', '@remotion', 'compositor-win32-x64-msvc');
  const exists = hasFile(join(local, 'ffmpeg'), join(remotion, 'ffmpeg'));
  const result = pathWithLocalFfmpeg(path(remotion, local, '/a'), local, 'ffmpeg', exists);
  assert.equal(result, path(local, remotion, '/a'));
});
