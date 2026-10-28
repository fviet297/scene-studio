// node --test scripts/lib/profile-writer.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfileSuggestion, profileRequest } from './profile-writer.mjs';

test('the request names the character and quotes only the scenes they appear in', () => {
  const text = profileRequest({
    id: 'char-a',
    name: 'Nguyễn Ánh',
    projectTitle: 'Nguyễn Ánh — Phần 3',
    current: { country: 'Dai Viet' },
    scenes: [
      { scene: 1, narration: 'Ngoài biển năm 1783.', characters: ['char-a'] },
      { scene: 2, narration: 'Quân Tây Sơn tiến vào.', characters: ['char-b'] },
    ],
  });
  assert.match(text, /Nguyễn Ánh/);
  assert.match(text, /1\. Ngoài biển năm 1783\./);
  assert.doesNotMatch(text, /Quân Tây Sơn/);
  assert.match(text, /"country": "Dai Viet"/);
});

test('a character in no scene falls back to the whole narration', () => {
  const text = profileRequest({
    id: 'char-z',
    name: 'X',
    projectTitle: 'T',
    current: {},
    scenes: [{ scene: 4, narration: 'Một dòng.', characters: [] }],
  });
  assert.match(text, /4\. Một dòng\./);
});

test('the reply is trimmed to the profile fields, lists cleaned, appearance kept on one line', () => {
  const out = normalizeProfileSuggestion({
    aliases: ['Gia Long', ' ', 'Gia Long'],
    country: ' Dai Viet ',
    period: 'late 18th century',
    dynasty: 'Nguyen',
    role: 'Lord who founded the Nguyen dynasty',
    known_facts: ['Fled to Phu Quoc in 1783', ''],
    appearance: 'Young man,\nlean build',
    unknowns: 'Exact height',
    secret: 'ignored',
  });
  assert.deepEqual(out, {
    aliases: ['Gia Long'],
    country: 'Dai Viet',
    period: 'late 18th century',
    dynasty: 'Nguyen',
    role: 'Lord who founded the Nguyen dynasty',
    known_facts: ['Fled to Phu Quoc in 1783'],
    interpretation: 'Young man, lean build',
    unknowns: ['Exact height'],
  });
});

test('a reply with nothing usable is rejected', () => {
  assert.throws(() => normalizeProfileSuggestion({ foo: 'bar' }), /không trả về/);
});
