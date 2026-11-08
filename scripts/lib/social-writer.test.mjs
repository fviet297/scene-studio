import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYoutube } from './social-writer.mjs';

const option = (title, scores) => ({ title, angle: 'twist', trigger: 't', strength: 's', risk: 'r', scores });
const full = { attention: 20, curiosity: 20, clarity: 15, accuracy: 15, distinct: 5 };

test('normalizeYoutube sums the rubric itself and sorts titles best first', () => {
  const post = normalizeYoutube({
    title: 'B',
    titleOptions: [option('A', { ...full, attention: 10 }), option('B', full)],
  });
  assert.deepEqual(post.titleOptions.map((o) => [o.title, o.score]), [['B', 75], ['A', 65]]);
});

test('normalizeYoutube clamps each score part to its maximum', () => {
  const [first] = normalizeYoutube({
    title: 'A',
    titleOptions: [option('A', { attention: 99, curiosity: -5, clarity: 'x', accuracy: 20.4, distinct: 50 })],
  }).titleOptions;
  assert.equal(first.score, 25 + 0 + 0 + 20 + 10);
});

test('normalizeYoutube drops empty titles and is safe without the optional fields', () => {
  const post = normalizeYoutube({ title: '  Một   tiêu đề ', description: 'a\n\n\n\nb', hashtags: ['lich su', '#LichSu'] });
  assert.equal(post.title, 'Một tiêu đề');
  assert.equal(post.description, 'a\n\nb');
  assert.deepEqual(post.hashtags, ['#LichSu']);
  assert.deepEqual(post.titleOptions, []);
  assert.deepEqual(post.keywords, { primary: '', secondary: [], longTail: [], related: [] });
  assert.equal(normalizeYoutube({ titleOptions: [{ title: ' ' }] }).titleOptions.length, 0);
});

test('normalizeYoutube keeps keyword groups as trimmed unique lists', () => {
  const { keywords } = normalizeYoutube({
    title: 'A',
    keywords: { primary: ' Ngô Quyền ', secondary: ['Bạch Đằng', 'Bạch Đằng', ''], longTail: 'not a list', related: ['x'] },
  });
  assert.deepEqual(keywords, { primary: 'Ngô Quyền', secondary: ['Bạch Đằng'], longTail: [], related: ['x'] });
});
