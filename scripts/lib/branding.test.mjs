import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BRANDING, EFFECT_LAYERS, normalizeBranding } from './branding.mjs';

test('captions are off by default so existing projects render unchanged', () => {
  assert.equal(normalizeBranding().captions.enabled, false);
  assert.deepEqual(normalizeBranding({ name: 'X' }).captions, DEFAULT_BRANDING.captions);
});

test('keeps an explicit captions switch', () => {
  assert.equal(normalizeBranding({ captions: { enabled: true } }).captions.enabled, true);
  assert.equal(normalizeBranding({ captions: { enabled: false } }).captions.enabled, false);
});

test('falls back to the default when captions.enabled is not a boolean', () => {
  assert.equal(normalizeBranding({ captions: { enabled: 'yes' } }).captions.enabled, false);
  assert.equal(normalizeBranding({ captions: null }).captions.enabled, false);
});

test('caption style defaults match the shipped look', () => {
  assert.deepEqual(normalizeBranding().captions, {
    enabled: false, font: 'be-vietnam', size: 48, strokeWidth: 7, backgroundOpacity: 0.42,
    uppercase: false, highlight: 'karaoke', position: 'bottom', offsetY: 0, anchor: 'crop',
    spokenColor: '#f6c85f', unspokenColor: '#ffffff',
  });
});

test('keeps a valid caption style and lower-cases colours', () => {
  const captions = normalizeBranding({
    captions: { enabled: true, size: 60, position: 'top', anchor: 'frame', spokenColor: '#FF8800', unspokenColor: '#00ff00' },
  }).captions;
  assert.deepEqual(captions, {
    enabled: true, font: 'be-vietnam', size: 60, strokeWidth: 7, backgroundOpacity: 0.42,
    uppercase: false, highlight: 'karaoke', position: 'top', offsetY: 0, anchor: 'frame',
    spokenColor: '#ff8800', unspokenColor: '#00ff00',
  });
});

test('clamps caption size into the slider range', () => {
  assert.equal(normalizeBranding({ captions: { size: 5 } }).captions.size, 28);
  assert.equal(normalizeBranding({ captions: { size: 500 } }).captions.size, 72);
  assert.equal(normalizeBranding({ captions: { size: 'big' } }).captions.size, 48);
});

test('rejects unknown positions, anchors and colours', () => {
  const captions = normalizeBranding({
    captions: { position: 'left', anchor: 'edge', spokenColor: 'red', unspokenColor: '#12345' },
  }).captions;
  assert.equal(captions.position, 'bottom');
  assert.equal(captions.anchor, 'crop');
  assert.equal(captions.spokenColor, '#f6c85f');
  assert.equal(captions.unspokenColor, '#ffffff');
});

test('clamps the caption vertical offset into the slider range', () => {
  assert.equal(normalizeBranding({ captions: { offsetY: -80 } }).captions.offsetY, -80);
  assert.equal(normalizeBranding({ captions: { offsetY: 999 } }).captions.offsetY, 300);
  assert.equal(normalizeBranding({ captions: { offsetY: -999 } }).captions.offsetY, -300);
  assert.equal(normalizeBranding({ captions: { offsetY: 'up' } }).captions.offsetY, 0);
});

test('keeps the new caption look fields and rejects invalid ones', () => {
  const ok = normalizeBranding({
    captions: { font: 'anton', strokeWidth: 3, backgroundOpacity: 0, uppercase: true, highlight: 'word' },
  }).captions;
  assert.equal(ok.font, 'anton');
  assert.equal(ok.strokeWidth, 3);
  assert.equal(ok.backgroundOpacity, 0);
  assert.equal(ok.uppercase, true);
  assert.equal(ok.highlight, 'word');
  const bad = normalizeBranding({
    captions: { font: 'comic-sans', strokeWidth: 99, backgroundOpacity: 5, uppercase: 'yes', highlight: 'blink' },
  }).captions;
  assert.equal(bad.font, 'be-vietnam');
  assert.equal(bad.strokeWidth, 14);
  assert.equal(bad.backgroundOpacity, 0.8);
  assert.equal(bad.uppercase, false);
  assert.equal(bad.highlight, 'karaoke');
});

test('effects default to today\'s look: base vignette + grain, crossfade, no extra layers', () => {
  const { effects } = normalizeBranding();
  assert.equal(effects.vignette, true);
  assert.equal(effects.grain, true);
  assert.equal(effects.grade, 'none');
  assert.deepEqual(effects.transition, { type: 'crossfade', frames: 8 });
  assert.deepEqual(Object.keys(effects.layers), EFFECT_LAYERS);
  for (const layer of Object.values(effects.layers)) assert.deepEqual(layer, { enabled: false, intensity: 50 });
});

test('keeps valid effects settings and clamps intensity and transition length', () => {
  const { effects } = normalizeBranding({
    effects: {
      vignette: false, grade: 'sepia',
      transition: { type: 'wipe', frames: 99 },
      layers: { rain: { enabled: true, intensity: 5 }, petals: { enabled: true, intensity: 80 } },
    },
  });
  assert.equal(effects.vignette, false);
  assert.equal(effects.grain, true);
  assert.equal(effects.grade, 'sepia');
  assert.deepEqual(effects.transition, { type: 'wipe', frames: 30 });
  assert.deepEqual(effects.layers.rain, { enabled: true, intensity: 10 });
  assert.deepEqual(effects.layers.petals, { enabled: true, intensity: 80 });
  assert.deepEqual(effects.layers.fog, { enabled: false, intensity: 50 });
});

test('rejects unknown effect values and ignores unknown layers', () => {
  const { effects } = normalizeBranding({
    effects: { vignette: 'no', grade: 'neon', transition: { type: 'spin', frames: 'x' }, layers: { lasers: { enabled: true }, fog: { enabled: 'yes' } } },
  });
  assert.equal(effects.vignette, true);
  assert.equal(effects.grade, 'none');
  assert.deepEqual(effects.transition, { type: 'crossfade', frames: 8 });
  assert.equal(effects.layers.lasers, undefined);
  assert.equal(effects.layers.fog.enabled, false);
});
