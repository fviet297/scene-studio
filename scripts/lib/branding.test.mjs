import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BRANDING, normalizeBranding } from './branding.mjs';

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
    enabled: false, size: 48, position: 'bottom', anchor: 'crop',
    spokenColor: '#f6c85f', unspokenColor: '#ffffff',
  });
});

test('keeps a valid caption style and lower-cases colours', () => {
  const captions = normalizeBranding({
    captions: { enabled: true, size: 60, position: 'top', anchor: 'frame', spokenColor: '#FF8800', unspokenColor: '#00ff00' },
  }).captions;
  assert.deepEqual(captions, {
    enabled: true, size: 60, position: 'top', anchor: 'frame', spokenColor: '#ff8800', unspokenColor: '#00ff00',
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
