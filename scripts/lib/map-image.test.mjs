import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMapScene, MAP_TEMPLATE } from './map-image.mjs';

const scene = (prompt, characters = []) => ({ image: { kind: 'ai', characters, prompt } });

test('a no-reference scene that opens on a top-down map is a map scene', () => {
  assert.equal(isMapScene(scene('Wide top-down map of the central coast at dawn, 1613; a red fill covers the strip.')), true);
  assert.equal(isMapScene(scene('Close top-down map of the Hoành Sơn ridge at noon, 1627; two forts.')), true);
  assert.equal(isMapScene(scene('Wide top-down illustrated relief map of Đại Việt in the early 17th century; amber wash north.')), true);
  assert.equal(isMapScene(scene('Wide illustrated top-down relief map in parchment-toned watercolour of the delta; red wash.')), true);
});

test('older map prompts without the word map are still maps when they paint territory or a route', () => {
  assert.equal(isMapScene(scene('Wide top-down view of the Red River delta at midday, 950; the red wash still covers the delta.')), true);
  assert.equal(isMapScene(scene('Wide top-down view of the whole delta at midday, 966; twelve separate soft patches in muted colours.')), true);
  assert.equal(isMapScene(scene('Wide top-down view of the southern delta at midday, 966; a wide soft teal route arrow is painted across it.')), true);
});

test('aerial views and objects seen from above are not maps', () => {
  assert.equal(isMapScene(scene('Wide top-down view of an old dark-wood table in warm lamplight: a thick hand-bound book.')), false);
  assert.equal(isMapScene(scene('Wide top-down view of a small coral atoll at midday, 1930s; a grey gunboat in the lagoon.')), false);
  assert.equal(isMapScene(scene('Wide stone river landing on the Hương River on a grey morning; boats moored.')), false);
});

test('a scene carrying a map spec is a map scene whatever its prompt says', () => {
  assert.equal(isMapScene({ image: { kind: 'ai', characters: [], prompt: '', map: { view: 'viet-nam' } } }), true);
});

test('a scene with a character reference is never routed as a map', () => {
  assert.equal(isMapScene(scene('Wide top-down map of the coast at dawn, 1613; a red fill.', ['char-a'])), false);
});

test('a scene without an image prompt is not a map', () => {
  assert.equal(isMapScene({ image: { kind: 'search', characters: [], query: 'old map' } }), false);
  assert.equal(isMapScene({}), false);
});

test('the map template keeps the placeholders buildPrompt fills and asks for a true plan view', () => {
  assert.match(MAP_TEMPLATE, /\[FRAME\]/);
  assert.match(MAP_TEMPLATE, /\[SCENE-SPECIFIC PROMPT\]/);
  assert.match(MAP_TEMPLATE, /no horizon, no sky/);
  assert.doesNotMatch(MAP_TEMPLATE, /\[STYLE\]/, 'the style DNA palette would wash the territory colours out');
  assert.doesNotMatch(MAP_TEMPLATE, /\[GUARD\]/, 'style guards ban the saturated colours a map needs');
});
