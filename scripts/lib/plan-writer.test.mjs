// node --test scripts/lib/plan-writer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addCharacterToPlan } from './plan-writer.mjs';

const planWith = (text) => {
  const file = join(mkdtempSync(join(tmpdir(), 'plan-writer-')), 'scene-plan.md');
  writeFileSync(file, text);
  return file;
};

test('a character is appended to the existing "## characters" block', () => {
  const file = planWith('# T\n\n## characters\n\nchar-a = public/projects/t/characters/char-a.jpg\n\n## scene 1\n\nnarration: x\n');
  addCharacterToPlan(file, 'projects/t', 'char-b');
  assert.match(readFileSync(file, 'utf8'), /char-a = .*\nchar-b = public\/projects\/t\/characters\/char-b\.jpg\n\n## scene 1/);
});

test('a plan without a characters block gets one ahead of its first scene', () => {
  const file = planWith('# T\n\naspect: 16:9\n\n## scene 1\n\nnarration: x\n');
  addCharacterToPlan(file, 'projects/t', 'char-a');
  assert.equal(
    readFileSync(file, 'utf8'),
    '# T\n\naspect: 16:9\n\n## characters\n\nchar-a = public/projects/t/characters/char-a.jpg\n\n## scene 1\n\nnarration: x\n',
  );
});
