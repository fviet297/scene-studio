import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPausedConcatGraph, pauseFor, pausedConcatArgs, PAUSE_SECONDS } from './paused-concat.mjs';
import { GAP_COLON, GAP_SENTENCE } from './sentence-chunks.mjs';

test('graph has one pause between each pair of clips', () => {
  const graph = buildPausedConcatGraph(3);
  assert.equal((graph.match(/anullsrc/g) ?? []).length, 2);
  assert.match(graph, /\[c0\]\[p0\]\[c1\]\[p1\]\[c2\]concat=n=5:v=0:a=1\[out\]/);
});

test('each boundary gets the pause of its own kind', () => {
  const graph = buildPausedConcatGraph(3, { gaps: [GAP_COLON, GAP_SENTENCE] });
  assert.match(graph, new RegExp(`d=${PAUSE_SECONDS[GAP_COLON]}\\[p0\\]`));
  assert.match(graph, new RegExp(`d=${PAUSE_SECONDS[GAP_SENTENCE]}\\[p1\\]`));
});

test('a colon pause is longer than a sentence pause; unknown names fall back to sentence', () => {
  assert.ok(pauseFor(GAP_COLON) > pauseFor(GAP_SENTENCE));
  assert.equal(pauseFor(undefined), pauseFor(GAP_SENTENCE));
});

test('trim:false leaves clip edges alone', () => {
  assert.doesNotMatch(buildPausedConcatGraph(2, { trim: false }), /silenceremove/);
  assert.match(buildPausedConcatGraph(2), /areverse/);
});

test('clipFilter runs on each clip, never after the join', () => {
  const graph = buildPausedConcatGraph(2, { trim: false, clipFilter: 'volume=1' });
  assert.equal((graph.match(/volume=1/g) ?? []).length, 2);
  assert.match(graph, /concat=n=3:v=0:a=1\[out\]$/);
});

test('rejects a clip count below one', () => {
  assert.throws(() => buildPausedConcatGraph(0));
});

test('args list every clip as an input and map the graph output', () => {
  const args = pausedConcatArgs(['a.wav', 'b.wav'], 'out.mp3');
  assert.deepEqual(args.slice(0, 5), ['-y', '-i', 'a.wav', '-i', 'b.wav']);
  assert.ok(args.includes('[out]'));
  assert.equal(args.at(-1), 'out.mp3');
});
