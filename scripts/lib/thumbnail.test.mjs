import test from 'node:test';
import assert from 'node:assert/strict';
import { letteringPrompt, MAX_LETTER_LINE, MAX_LETTER_LINES, MAX_LETTER_STYLE, parseLetteringRequest } from './thumbnail.mjs';

const valid = { kicker: 'Nguyễn Ánh', lines: ['Tuổi 16', 'trở lại bàn cờ'], styleHint: 'gold serif capitals', side: 'left' };

test('parseLetteringRequest keeps a valid request and trims whitespace', () => {
  const request = parseLetteringRequest({ ...valid, kicker: '  Nguyễn   Ánh ', lines: [' Tuổi 16 ', '', 'trở lại bàn cờ'] });
  assert.deepEqual(request, valid);
});

test('parseLetteringRequest needs some text', () => {
  assert.throws(() => parseLetteringRequest({ ...valid, kicker: '', lines: [] }), /Nhập chữ/);
});

test('parseLetteringRequest enforces the line and style limits', () => {
  const tooManyLines = Array.from({ length: MAX_LETTER_LINES + 1 }, () => 'a');
  assert.throws(() => parseLetteringRequest({ ...valid, lines: tooManyLines }), /dòng/);
  assert.throws(() => parseLetteringRequest({ ...valid, lines: ['x'.repeat(MAX_LETTER_LINE + 1)] }), /ký tự/);
  assert.throws(() => parseLetteringRequest({ ...valid, styleHint: 'x'.repeat(MAX_LETTER_STYLE + 1) }), /Kiểu chữ/);
  assert.throws(() => parseLetteringRequest({ ...valid, styleHint: '  ' }), /kiểu chữ/);
});

test('parseLetteringRequest rejects an unknown side', () => {
  assert.throws(() => parseLetteringRequest({ ...valid, side: 'middle' }), /side/);
});

test('letteringPrompt quotes every line exactly and names the side and style', () => {
  const prompt = letteringPrompt(valid);
  assert.match(prompt, /“Nguyễn Ánh”/);
  assert.match(prompt, /“Tuổi 16”\n“trở lại bàn cờ”/);
  assert.match(prompt, /LETTERING STYLE: gold serif capitals\./);
  assert.match(prompt, /on the left side/);
});

test('letteringPrompt omits the small line when there is no kicker', () => {
  assert.doesNotMatch(letteringPrompt({ ...valid, kicker: '' }), /Small line/);
});
