import test from 'node:test';
import assert from 'node:assert/strict';
import { GAP_COLON, GAP_SENTENCE, speechChunks, splitSentences } from './sentence-chunks.mjs';

test('splits on sentence-ending punctuation', () => {
  assert.deepEqual(splitSentences('Tào Tháo thua trận. Ông bỏ chạy! Ai ngờ?'), ['Tào Tháo thua trận.', 'Ông bỏ chạy!', 'Ai ngờ?']);
});

test('keeps ellipsis and trailing quote with its sentence', () => {
  assert.deepEqual(splitSentences('Ông im lặng… Rồi nói: “Ta thua rồi.” Ông đi.'), ['Ông im lặng…', 'Rồi nói: “Ta thua rồi.”', 'Ông đi.']);
});

test('does not split inside a quotation', () => {
  assert.deepEqual(splitSentences('Ông nói "Ta thua. Hết rồi." Rồi đi.'), ['Ông nói "Ta thua. Hết rồi."', 'Rồi đi.']);
});

test('does not split inside a decimal number', () => {
  assert.deepEqual(splitSentences('Quân số 3.5 vạn người. Họ tiến.'), ['Quân số 3.5 vạn người.', 'Họ tiến.']);
});

test('keeps text without final punctuation', () => {
  assert.deepEqual(splitSentences('Câu một. Câu hai chưa kết thúc'), ['Câu một.', 'Câu hai chưa kết thúc']);
});

test('returns nothing for empty input', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences(undefined), []);
  assert.deepEqual(speechChunks('   '), []);
});

test('a colon splits a sentence into two chunks with a colon gap', () => {
  assert.deepEqual(speechChunks('Còn một việc ông chưa giải quyết xong: quan hệ với họ Trịnh ngoài Bắc.'), [
    { text: 'Còn một việc ông chưa giải quyết xong:', gapAfter: GAP_COLON },
    { text: 'quan hệ với họ Trịnh ngoài Bắc.', gapAfter: GAP_SENTENCE },
  ]);
});

test('sentence and colon gaps are told apart across sentences', () => {
  const first = 'Năm 1613, chúa Nguyễn Hoàng qua đời, để lại cho con trai một vùng đất rộng.';
  const chunks = speechChunks(`${first} Còn một việc ông chưa giải quyết xong: quan hệ với họ Trịnh ngoài Bắc.`);
  assert.deepEqual(chunks.map((c) => c.gapAfter), [GAP_SENTENCE, GAP_COLON, GAP_SENTENCE]);
  assert.equal(chunks[0].text, first);
});

test('a colon inside a quotation or a time does not split', () => {
  const chunks = speechChunks('Ông nói “việc này có hai điều: một là đánh, hai là hòa.” Rồi ông cho quân lui về giữ thành.');
  assert.deepEqual(chunks.map((c) => c.gapAfter), [GAP_SENTENCE, GAP_SENTENCE]);
  assert.equal(speechChunks('Họ gặp nhau lúc 3:30 chiều ở bến sông lớn.').length, 1);
});

test('a short piece before a colon folds into the next piece and keeps its gap', () => {
  assert.deepEqual(speechChunks('Rõ ràng: quân Tào rút chạy về phương bắc trong đêm.'), [
    { text: 'Rõ ràng: quân Tào rút chạy về phương bắc trong đêm.', gapAfter: GAP_SENTENCE },
  ]);
});

test('merges a short sentence into the next one', () => {
  assert.deepEqual(speechChunks('Thua rồi. Quân Tào rút chạy về phương bắc trong đêm.'), [
    { text: 'Thua rồi. Quân Tào rút chạy về phương bắc trong đêm.', gapAfter: GAP_SENTENCE },
  ]);
});

test('merges a short last sentence into the previous one', () => {
  assert.deepEqual(speechChunks('Quân Tào rút chạy về phương bắc trong đêm. Hết.'), [
    { text: 'Quân Tào rút chạy về phương bắc trong đêm. Hết.', gapAfter: GAP_SENTENCE },
  ]);
});

test('keeps long sentences as separate chunks', () => {
  const a = 'Quân Tào rút chạy về phương bắc trong đêm.';
  const b = 'Chu Du đứng trên thuyền nhìn lửa cháy đỏ sông.';
  assert.deepEqual(speechChunks(`${a} ${b}`).map((c) => c.text), [a, b]);
});

test('a lone short text stays as one chunk', () => {
  assert.deepEqual(speechChunks('Thua rồi.'), [{ text: 'Thua rồi.', gapAfter: GAP_SENTENCE }]);
});
