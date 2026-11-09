import test from 'node:test';
import assert from 'node:assert/strict';
import { sortNewestFirst } from './project-paths.mjs';

test('sortNewestFirst puts the most recently created project first', () => {
  const sorted = sortNewestFirst([
    { slug: 'a', createdMs: 100 },
    { slug: 'c', createdMs: 300 },
    { slug: 'b', createdMs: 200 },
  ]);
  assert.deepEqual(sorted.map((e) => e.slug), ['c', 'b', 'a']);
});

test('sortNewestFirst breaks ties by slug and does not mutate its input', () => {
  const input = [{ slug: 'z', createdMs: 5 }, { slug: 'a', createdMs: 5 }];
  assert.deepEqual(sortNewestFirst(input).map((e) => e.slug), ['a', 'z']);
  assert.deepEqual(input.map((e) => e.slug), ['z', 'a']);
});
