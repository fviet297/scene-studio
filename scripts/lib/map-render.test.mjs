import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMapKitInstalled, mapClipSeconds, mapProjectFiles, mapStillSeconds, normalizeMapSpec } from './map-render.mjs';

test('a map spec needs a view and keeps only the fields the kit draws', () => {
  const spec = normalizeMapSpec('{"view":"bac-trung-bo","year":1627,"regions":[{"r":"goc","color":"#e0a526"}],"big":{"text":"X"},"script":"alert(1)"}');
  assert.deepEqual(spec, { view: 'bac-trung-bo', year: '1627', regions: [{ r: 'goc', color: '#e0a526' }] });
});

test('a region may be a bare region id, and add is read as regions', () => {
  assert.deepEqual(normalizeMapSpec({ view: 'viet-nam', add: ['dang-ngoai'] }).regions, ['dang-ngoai']);
});

test('broken or incomplete map specs are refused with a Vietnamese message', () => {
  assert.throws(() => normalizeMapSpec('{view:'), /map: JSON không hợp lệ/);
  assert.throws(() => normalizeMapSpec('[]'), /map: phải là một object JSON/);
  assert.throws(() => normalizeMapSpec({ year: '1613' }), /map: thiếu "view"/);
  assert.throws(() => normalizeMapSpec({ view: 'viet-nam', arrows: 'x' }), /"arrows" phải là danh sách/);
});

test('list entries that are not objects are dropped', () => {
  assert.deepEqual(normalizeMapSpec({ view: 'viet-nam', labels: [null, 3, { text: 'Huế', place: 'hue' }] }).labels, [{ text: 'Huế', place: 'hue' }]);
});

test('the kit project is one shot that holds every overlay to its last frame, with no fades', () => {
  const { config, shots } = mapProjectFiles({ spec: { view: 'viet-nam', arrows: [{ from: 'vinh', to: 'hue' }] }, aspect: '16:9', seconds: 8, fps: 30 });
  assert.equal(config.pack, 'bando');
  assert.equal(config.aspect, '16:9');
  assert.equal(config.fps, 30);
  assert.equal(config.fadeIn, 0);
  assert.equal(config.fadeOut, 0);
  assert.equal(config.captions, false);
  assert.equal(shots.duration, 8);
  assert.equal(shots.shots.length, 1);
  const [shot] = shots.shots;
  assert.deepEqual([shot.start, shot.end, shot.tpl], [0, 8, 'map']);
  assert.equal(shot.args.fly, 0);
  assert.equal(shot.args.arrows[0].keep, true);
});

test('in a short clip the overlays are timed to finish drawing by 60 % of it', () => {
  const spec = { view: 'viet-nam', regions: [{ r: 'goc', at: 0.3 }], arrows: [{ from: 'vinh', to: 'hue', at: 3, dur: 1.6 }], labels: [{ text: 'Huế', place: 'hue' }] };
  const { shots } = mapProjectFiles({ spec, aspect: '16:9', seconds: 4 });
  const { args } = shots.shots[0];
  const arrow = args.arrows[0];
  assert.ok(arrow.at + arrow.dur <= 2.4 + 1e-9, `arrow ends at ${arrow.at + arrow.dur}`);
  assert.ok(arrow.at < 3 && arrow.dur < 1.6);
  assert.ok(args.regions[0].at < 0.3);
  assert.equal(spec.arrows[0].at, 3, 'the spec itself is not changed');
});

test('in a long clip the overlay timing is left as written', () => {
  const { shots } = mapProjectFiles({ spec: { view: 'viet-nam', arrows: [{ from: 'vinh', to: 'hue', at: 3, dur: 1.6 }] }, aspect: '16:9', seconds: 10 });
  assert.deepEqual([shots.shots[0].args.arrows[0].at, shots.shots[0].args.arrows[0].dur], [3, 1.6]);
});

test('only the frame shapes the kit can draw are accepted', () => {
  assert.equal(mapProjectFiles({ spec: { view: 'viet-nam' }, aspect: '9:16', seconds: 6 }).config.aspect, '9:16');
  assert.throws(() => mapProjectFiles({ spec: { view: 'viet-nam' }, aspect: '1:1', seconds: 6 }), /16:9 và 9:16/);
});

test('the still is taken just before the end of the clip, once every overlay is drawn', () => {
  assert.equal(mapStillSeconds(8), 7.8);
  assert.equal(mapStillSeconds(4), 3.8);
});

test('clip length follows the scene, never shorter than the minimum, with a default when unknown', () => {
  assert.equal(mapClipSeconds({ target: 10 }), 10);
  assert.equal(mapClipSeconds({ target: 2 }), 4);
  assert.equal(mapClipSeconds({ target: 6, minimum: 9 }), 9);
  assert.equal(mapClipSeconds({ target: null }), 8);
  assert.equal(mapClipSeconds({ target: Number.NaN }), 8);
});

test('the kit counts as installed only with its renderer, the map pack and its dependencies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mapkit-'));
  try {
    assert.equal(isMapKitInstalled(dir), false);
    writeFileSync(join(dir, 'render.mjs'), '');
    mkdirSync(join(dir, 'packs', 'bando'), { recursive: true });
    writeFileSync(join(dir, 'packs', 'bando', 'pack.js'), '');
    assert.equal(isMapKitInstalled(dir), false);
    mkdirSync(join(dir, 'node_modules', 'playwright'), { recursive: true });
    assert.equal(isMapKitInstalled(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
