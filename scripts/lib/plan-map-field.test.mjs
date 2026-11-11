// node --test scripts/lib/plan-map-field.test.mjs
// The `map:` scene field (map-render.mjs): written as one JSON line, read back as an object.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeSceneField, renderScenePlan, writeSceneField } from './plan-writer.mjs';
import { parsePlan } from './parse-plan.mjs';

const planWith = (text) => {
  const file = join(mkdtempSync(join(tmpdir(), 'plan-map-')), 'scene-plan.md');
  writeFileSync(file, text);
  return file;
};
const PLAN = '# T\n\n## scene 1\n\nnarration: Năm 1627.\nprompt: Wide top-down map of the coast, 1627\ncamera: glide\n\n## scene 2\n\nnarration: y\nprompt: z\n';

test('a map spec is written as one line after the existing fields and read back as an object', () => {
  const file = planWith(PLAN);
  writeSceneField(file, 1, 'map', JSON.stringify({ view: 'bac-trung-bo', year: '1627' }));
  const text = readFileSync(file, 'utf8');
  assert.match(text, /camera: glide\nmap: \{"view":"bac-trung-bo","year":"1627"\}\n\n## scene 2/);
  const { scenes, warnings } = parsePlan('t', file);
  assert.deepEqual(scenes[0].image.map, { view: 'bac-trung-bo', year: '1627' });
  assert.equal(scenes[1].image.map, undefined);
  assert.deepEqual(warnings.filter((w) => /map/.test(w)), []);
});

test('rewriting the map spec replaces its line instead of adding a second one', () => {
  const file = planWith(PLAN);
  writeSceneField(file, 1, 'map', '{"view":"viet-nam"}');
  writeSceneField(file, 1, 'map', '{"view":"bac-trung-bo"}');
  assert.equal(readFileSync(file, 'utf8').match(/^map:/gm).length, 1);
  removeSceneField(file, 1, 'map');
  assert.doesNotMatch(readFileSync(file, 'utf8'), /^map:/m);
});

test('a broken map spec is reported and ignored, never thrown', () => {
  const file = planWith(PLAN.replace('camera: glide', 'map: {"view":'));
  const { scenes, warnings } = parsePlan('t', file);
  assert.equal(scenes[0].image.map, undefined);
  assert.ok(warnings.some((w) => /scene 1: map: JSON không hợp lệ/.test(w)));
});

test('a map scene with a spec but no prompt raises no missing-prompt warning', () => {
  const file = planWith('# T\n\n## scene 1\n\nnarration: x\nmap: {"view":"viet-nam"}\n');
  assert.deepEqual(parsePlan('t', file).warnings, []);
});

test('a new plan written from scenes keeps their map spec', () => {
  const text = renderScenePlan({ title: 'T', characters: [], scenes: [{ scene: 1, narration: 'x', prompt: 'p', map: '{"view":"viet-nam"}' }] });
  assert.match(text, /prompt: p\nmap: \{"view":"viet-nam"\}/);
});
