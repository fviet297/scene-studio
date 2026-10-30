// node --test scripts/lib/script-writer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCRIPT_STYLE, SCRIPT_STYLES, isScriptStyle, stylePrompts } from './script-writer.mjs';

test('the default style is the standard character-led one', () => {
  assert.equal(DEFAULT_SCRIPT_STYLE, 'standard');
  assert.deepEqual(stylePrompts(), stylePrompts('standard'));
});

test('only the listed styles are accepted', () => {
  assert.deepEqual(SCRIPT_STYLES, ['standard', 'map']);
  assert.equal(isScriptStyle('map'), true);
  assert.equal(isScriptStyle('banner'), false);
  assert.throws(() => stylePrompts('banner'), /Kiểu video không hợp lệ/);
});

test('standard keeps the character story, the culture rules and the project motion template', () => {
  const { story, visuals, motion } = stylePrompts('standard');
  assert.match(story, /STORY SHAPE — one gripping story/);
  assert.doesNotMatch(story, /MAP STORY SHAPE/);
  assert.match(visuals, /NAME THE CULTURE CONCRETELY/);
  assert.equal(motion, undefined);
});

test('map swaps in the documentary story, the map-frame rules and the map motion prompt', () => {
  const { story, visuals, motion } = stylePrompts('map');
  assert.match(story, /MAP STORY SHAPE/);
  assert.match(story, /"chúng ta"/);
  assert.match(story, /Hoàng Sa and Trường Sa belong to Việt Nam/);
  assert.match(visuals, /MAP FRAME/);
  assert.match(visuals, /nine-dash line/);
  assert.doesNotMatch(visuals, /NAME THE CULTURE CONCRETELY/);
  assert.match(motion, /MAP TRUTH/);
});

test('both styles ask for the JSON shape the parsers read', () => {
  for (const style of SCRIPT_STYLES) {
    const { story, visuals, motion } = stylePrompts(style);
    assert.match(story, /"through_line": "\.\.\.", "setting"/);
    assert.match(story, /display_name; aliases/, 'the cast field list is shared');
    assert.match(visuals, /"prompt_vi": "\.\.\."/);
    if (motion) assert.match(motion, /"camera_vi": "\.\.\."/);
  }
});
