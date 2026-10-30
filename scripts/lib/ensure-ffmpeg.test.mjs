import test from 'node:test';
import assert from 'node:assert/strict';
import { delimiter } from 'node:path';
import { pathWithFirst } from './ensure-ffmpeg.mjs';

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
