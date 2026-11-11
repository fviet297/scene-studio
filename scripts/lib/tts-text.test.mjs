import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseForTts } from './tts-text.mjs';

test('reads a unit after a number in full', () => {
  assert.equal(normaliseForTts('cao khoảng 3 m, dài khoảng 10 km.'), 'cao khoảng ba mét, dài khoảng mười ki lô mét.');
});

test('reads a unit written straight after the number', () => {
  assert.equal(normaliseForTts('nặng 5kg'), 'nặng năm ki lô gam');
});

test('leaves a word that only starts like a unit alone', () => {
  assert.equal(normaliseForTts('3 mâm đồng'), 'ba mâm đồng');
});

test('leaves a unit letter without a number alone', () => {
  assert.equal(normaliseForTts('m và km'), 'm và km');
});
