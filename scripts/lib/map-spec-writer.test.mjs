import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapSpecSystem, mapSpecUser, parseMapSpecsReply, validateMapSpec } from './map-spec-writer.mjs';

// A stand-in for the kit's places.js vocabulary (the real one lives outside the repo).
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PLACES = { 'thang-long': [105.85, 21.03], 'hoi-an': [108.33, 15.88], 'song-gianh': [106.47, 17.7] };
const vocab = {
  views: { 'viet-nam': [99.5, 7.2, 118.5, 23.8], 'bac-trung-bo': [104, 16.8, 108, 20.6] },
  regions: { goc: 'Dai Viet toi Hoanh Son', 'dang-ngoai': 'Dang Ngoai, bac song Gianh' },
  countries: ['Campuchia'],
  places: Object.keys(PLACES),
  place: (p) => (Array.isArray(p) ? p : PLACES[slug(p)] ?? null),
  slug,
};

test('the system prompt lists the kit vocabulary and the sovereignty rule', () => {
  const system = mapSpecSystem(vocab);
  assert.match(system, /viet-nam/);
  assert.match(system, /dang-ngoai: Dang Ngoai, bac song Gianh/);
  assert.match(system, /thang-long, hoi-an, song-gianh/);
  assert.match(system, /Hoàng Sa/);
  assert.match(system, /"map"/);
});

test('the user message carries the frame shape and, per scene, its narration, beat and image prompt', () => {
  const user = mapSpecUser({ aspect: '16:9', scenes: [
    { scene: 29, narration: 'Năm 1627, Trịnh Tráng đem quân vào đánh Thuận Hóa.', prompt: 'Wide top-down map of north-central Đại Việt, 1627' },
    { scene: 33, narration: 'Ranh giới là sông Gianh.', beat: 'Whole country split at a river' },
  ] });
  assert.match(user, /16:9/);
  assert.match(user, /1920×1080/);
  assert.match(user, /SCENE 29\nNarration \(Vietnamese\): Năm 1627, Trịnh Tráng/);
  assert.match(user, /north-central/);
  assert.match(user, /SCENE 33[\s\S]*Map frame to draw: Whole country split at a river/);
});

test('a vertical project is told the 1080×1920 pixel frame for label offsets', () => {
  assert.match(mapSpecUser({ aspect: '9:16', scenes: [{ scene: 1, narration: 'x', prompt: 'y' }] }), /1080×1920/);
});

test('a batch reply is matched to its scenes; a missing or undrawable scene is skipped and logged', () => {
  const logs = [];
  const specs = parseMapSpecsReply({ scenes: [
    { scene: 5, map: { view: 'viet-nam', regions: [{ r: 'goc' }] } },
    { scene: 7, map: { year: '1600' } },
  ] }, [{ scene: 5 }, { scene: 6 }, { scene: 7 }], vocab, (l) => logs.push(l));
  assert.deepEqual([...specs.keys()], [5]);
  assert.ok(logs.some((l) => /scene 6: LLM không trả/.test(l)));
  assert.ok(logs.some((l) => /scene 7: map: thiếu "view"/.test(l)));
});

test('a single-scene reply in the older {"map": …} shape is still read', () => {
  assert.deepEqual([...parseMapSpecsReply({ map: { view: 'viet-nam' } }, [{ scene: 1 }], vocab).keys()], [1]);
});

test('known places, coordinates and regions are kept; unknown ones are dropped and reported', () => {
  const { spec, dropped } = validateMapSpec({
    view: 'bac-trung-bo',
    regions: [{ r: 'goc' }, { r: 'dai-viet-1611' }, 'Campuchia', { r: 'made-up' }],
    labels: [{ text: 'Thăng Long', place: 'Thăng Long' }, { text: 'X', place: 'atlantis' }],
    arrows: [{ from: 'thang-long', to: [106.5, 17.6] }, { from: 'thang-long', to: 'nowhere' }],
    lines: [{ pts: [[105.7, 17.7], 'song-gianh'] }],
  }, vocab);
  assert.deepEqual(spec.regions, [{ r: 'goc' }, { r: 'dai-viet-1611' }, 'Campuchia']);
  assert.deepEqual(spec.labels, [{ text: 'Thăng Long', place: 'Thăng Long' }]);
  assert.equal(spec.arrows.length, 1);
  assert.equal(spec.lines.length, 1);
  assert.equal(dropped.length, 3);
});

test('an unknown view name falls back to the nation view', () => {
  assert.equal(validateMapSpec({ view: 'mars' }, vocab).spec.view, 'viet-nam');
  assert.deepEqual(validateMapSpec({ view: [104, 16, 108, 20] }, vocab).spec.view, [104, 16, 108, 20]);
  assert.deepEqual(validateMapSpec({ view: { c: 'hoi-an', span: 3 } }, vocab).spec.view, { c: 'hoi-an', span: 3 });
});
