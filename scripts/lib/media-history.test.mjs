import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beginChange, historyCounts, settleChange, undoChange } from './media-history.mjs';

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'history-'));
  return { file: join(root, 'scene-01.jpg'), dir: join(root, 'history') };
};

const write = ({ file, dir }, content) => {
  const pending = beginChange(dir, file);
  writeFileSync(file, content);
  settleChange(dir, file, pending);
};

test('the first version of a file has nothing to undo to, so no undo step is offered', () => {
  const target = setup();
  write(target, 'first');
  assert.deepEqual(historyCounts(target.dir, target.file), { undo: 0, redo: 0 });
});

test('a second version offers one undo step that restores the first', () => {
  const target = setup();
  write(target, 'first');
  write(target, 'second');
  assert.deepEqual(historyCounts(target.dir, target.file), { undo: 1, redo: 0 });
  undoChange(target.dir, target.file);
  assert.equal(readFileSync(target.file, 'utf8'), 'first');
  assert.deepEqual(historyCounts(target.dir, target.file), { undo: 0, redo: 1 });
});

test('undo steps beyond the first version are counted without the empty start', () => {
  const target = setup();
  ['one', 'two', 'three'].forEach((content) => write(target, content));
  assert.equal(historyCounts(target.dir, target.file).undo, 2);
});
