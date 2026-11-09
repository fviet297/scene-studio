import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYoutube, ensureYoutubeKeyword } from './social-writer.mjs';

test('ensureYoutubeKeyword prefixes title, options and description that lack the keyword', () => {
  const post = ensureYoutubeKeyword(normalizeYoutube({
    title: 'Ngô Quyền và trận Bạch Đằng',
    description: 'Một trận thủy chiến.',
    titleOptions: [{ title: 'Trận Bạch Đằng', scores: {} }],
  }));
  assert.equal(post.title, 'Kể Chuyện: Ngô Quyền và trận Bạch Đằng');
  assert.equal(post.description, 'Kể Chuyện: Một trận thủy chiến.');
  assert.equal(post.titleOptions[0].title, 'Kể Chuyện: Trận Bạch Đằng');
});

test('ensureYoutubeKeyword puts the brand hashtag first without duplicating it', () => {
  const added = ensureYoutubeKeyword(normalizeYoutube({ title: 'A', hashtags: ['LichSu', 'NgoQuyen'] }));
  assert.deepEqual(added.hashtags, ['#KeChuyen', '#LichSu', '#NgoQuyen']);
  const dup = ensureYoutubeKeyword(normalizeYoutube({ title: 'A', hashtags: ['#LichSu', 'ke chuyen'] }));
  assert.deepEqual(dup.hashtags, ['#KeChuyen', '#LichSu']);
  const capped = ensureYoutubeKeyword(normalizeYoutube({ title: 'A', hashtags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }));
  assert.equal(capped.hashtags.length, 8);
  assert.equal(capped.hashtags[0], '#KeChuyen');
});

test('ensureYoutubeKeyword adds the brand phrase to the primary and long-tail keywords', () => {
  const { keywords } = ensureYoutubeKeyword(normalizeYoutube({
    title: 'A',
    keywords: { primary: 'Ngô Quyền', secondary: ['Bạch Đằng'], longTail: ['trận Bạch Đằng 938'], related: [] },
  }));
  assert.equal(keywords.primary, 'kể chuyện Ngô Quyền');
  assert.deepEqual(keywords.longTail, ['trận Bạch Đằng 938', 'kể chuyện Ngô Quyền']);
});

test('ensureYoutubeKeyword leaves keywords alone when the phrase is there or there is no primary', () => {
  const ok = { primary: 'Kể chuyện Ngô Quyền', secondary: [], longTail: ['kể chuyện Bạch Đằng'], related: [] };
  assert.deepEqual(ensureYoutubeKeyword(normalizeYoutube({ title: 'A', keywords: ok })).keywords, ok);
  const empty = ensureYoutubeKeyword(normalizeYoutube({ title: 'A' })).keywords;
  assert.deepEqual(empty, { primary: '', secondary: [], longTail: [], related: [] });
});

test('ensureYoutubeKeyword keeps text that already contains the keyword, ignoring case and diacritics', () => {
  const post = ensureYoutubeKeyword(normalizeYoutube({ title: 'Ngô Quyền, kể chuyện Bạch Đằng', description: 'KE CHUYEN lịch sử' }));
  assert.equal(post.title, 'Ngô Quyền, kể chuyện Bạch Đằng');
  assert.equal(post.description, 'KE CHUYEN lịch sử');
});

test('ensureYoutubeKeyword leaves an empty title empty and respects the title limit', () => {
  assert.equal(ensureYoutubeKeyword(normalizeYoutube({ title: ' ' })).title, '');
  assert.equal(ensureYoutubeKeyword(normalizeYoutube({ title: 'x'.repeat(100) })).title.length, 100);
});

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
