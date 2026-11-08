import test from 'node:test';
import assert from 'node:assert/strict';
import { letteringPrompt, MAX_LETTER_LINE, MAX_LETTER_LINES, MAX_LETTER_STYLE, normalizeThumbnailIdeas, parseLetteringRequest } from './thumbnail.mjs';

const cast = [{ id: 'ngo-quyen', name: 'Ngô Quyền' }, { id: 'kieu-cong-tien', name: 'Kiều Công Tiễn' }];
const concept = (id, extra = {}) => ({ id, headline: `Chữ ${id}`, emotion: 'giận', titleFit: 'bổ sung', chars: ['ngo-quyen'], prompt: `Prompt ${id}`, ...extra });

test('normalizeThumbnailIdeas puts the recommended concept first and flattens it', () => {
  const ideas = normalizeThumbnailIdeas(
    { concepts: [concept('A'), concept('B', { chars: ['ngo-quyen', 'kieu-cong-tien'] }), concept('C')], recommended: 'b', alternatives: ['Phụ 1'] },
    cast,
  );
  assert.equal(ideas.recommended, 'B');
  assert.equal(ideas.prompt, 'Prompt B');
  assert.deepEqual(ideas.chars, ['ngo-quyen', 'kieu-cong-tien']);
  assert.deepEqual(ideas.headlines, ['Chữ B', 'Chữ A', 'Chữ C', 'Phụ 1']);
  assert.equal(ideas.concepts.length, 3);
});

test('normalizeThumbnailIdeas drops unknown cast ids and incomplete concepts', () => {
  const ideas = normalizeThumbnailIdeas(
    { concepts: [concept('A', { chars: ['ghost'] }), concept('B', { prompt: '' }), concept('C')], recommended: 'B' },
    cast,
  );
  assert.deepEqual(ideas.concepts.map((c) => c.id), ['A', 'C']);
  assert.deepEqual(ideas.concepts[0].chars, []);
  assert.equal(ideas.recommended, 'A');
});

test('normalizeThumbnailIdeas caps the headline list and rejects an empty reply', () => {
  const many = normalizeThumbnailIdeas(
    { concepts: [concept('A')], alternatives: ['1', '2', '3', '4', '5'] },
    cast,
  );
  assert.equal(many.headlines.length, 5);
  assert.throws(() => normalizeThumbnailIdeas({ concepts: [] }, cast), /không trả về/);
});

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
