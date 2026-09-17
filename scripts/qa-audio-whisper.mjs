// Whisper QA for the active project's per-scene narration audio. Transcribes each
// public/projects/<slug>/audio/scene-NN.mp3 with OpenAI Whisper (whisper-1) and compares the
// transcript to the scene's expected narration text, to catch TTS defects (dropped/repeated/
// garbled words, truncated or silent files) — not to grade ASR spelling of proper nouns.
//
//   node scripts/qa-audio-whisper.mjs            # QA every scene
//   node scripts/qa-audio-whisper.mjs 3 10       # QA only scenes 3 and 10
//
// Prints a per-scene table and a final FAIL list (scenes below the similarity threshold or with
// a missing/short/empty transcript). Exit 0 if all pass, 1 if any fail. Requires OPENAI_API_KEY
// (loaded from ./.env). Threshold overridable via QA_THRESHOLD (default 0.80).

import { existsSync, openAsBlob, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { activePaths, parseProjectArg, sceneBase } from './lib/project-paths.mjs';
import { loadEnv } from './lib/replicate-image.mjs';

loadEnv();
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { process.stderr.write('OPENAI_API_KEY not set (put it in .env).\n'); process.exit(2); }
const THRESHOLD = Number(process.env.QA_THRESHOLD ?? 0.80);

const argv = process.argv.slice(2);
const paths = activePaths(argv);
const { rest } = parseProjectArg(argv);
const only = rest.map(Number).filter(Number.isFinite);

const plan = JSON.parse(readFileSync('src/scene-plan.json', 'utf8'));
if (plan.project !== paths.slug) {
  process.stderr.write(`src/scene-plan.json is for "${plan.project}" but "${paths.slug}" is active. Run parse-scene-plan.mjs\n`);
  process.exit(2);
}

// Normalise for comparison: lowercase, drop punctuation/digits-as-words differences, collapse
// spaces. Keeps Vietnamese letters (incl. diacritics) so a dropped/garbled word still shows.
const norm = (s) => s
  .toLowerCase()
  .replace(/[.,!?;:"“”'’()\-–—…]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Word-level Levenshtein ratio: 1 - editDistance/maxWords. Word-level (not char) so a single
// mis-heard proper noun costs one word, not a dozen characters — the metric tracks real
// content drift, not spelling.
const wordRatio = (a, b) => {
  const x = norm(a).split(' ').filter(Boolean);
  const y = norm(b).split(' ').filter(Boolean);
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  const dp = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 0; j <= y.length; j++) dp[0][j] = j;
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++)
      dp[i][j] = x[i - 1] === y[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return 1 - dp[x.length][y.length] / Math.max(x.length, y.length);
};

// Proper nouns from the plan, fed to Whisper as a decoding hint. Without it the ASR guesses at
// Sino-Vietnamese names and the guess costs the scene real similarity: scene 5's "Chu Du, tự Công
// Cẩn" came back as "Chú Rù tự công cẩn" — nothing was dropped, but a 13-word line scored 0.69.
// The hint only steers spelling of names the narration already contains, so a genuinely dropped
// or garbled word still shows up as drift.
// A capitalised run that does not open a sentence is a name, so each sentence drops its first
// word before the scan — every sentence starts capitalised and would otherwise look like one.
const NAME = /\p{Lu}[\p{L}\p{M}]*(?:\s\p{Lu}[\p{L}\p{M}]*)*/gu;
const properNouns = (scenes) => {
  const found = scenes.flatMap((s) => s.narration
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => sentence.replace(/^\S+\s*/, '').match(NAME) ?? []));
  return [...new Set(found)].join(', ').slice(0, 600);
};

const transcribe = async (file, hint) => {
  const form = new FormData();
  form.set('file', await openAsBlob(file), file.split('/').pop());
  form.set('model', 'whisper-1');
  form.set('language', 'vi');
  form.set('prompt', hint);
  form.set('response_format', 'json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`whisper ${res.status}: ${await res.text()}`);
  return (await res.json()).text ?? '';
};

const targets = plan.scenes.filter((s) => s.narration && (!only.length || only.includes(s.scene)));
// Built from every scene, not just the targets, so a single-scene run gets the same hint as a
// full run and therefore the same score.
const hint = properNouns(plan.scenes.filter((s) => s.narration));
const fails = [];
process.stdout.write(`Whisper QA · project=${paths.slug} · ${targets.length} scene(s) · threshold=${THRESHOLD}\n`);
process.stdout.write(`scene  sim    dur    status  transcript≈expected\n`);

for (const s of targets) {
  const file = join(paths.audioDir, `${sceneBase(s.scene)}.mp3`);
  if (!existsSync(file) || statSync(file).size < 1024) {
    process.stdout.write(`  ${String(s.scene).padStart(2)}   ----   ----   FAIL    (missing or empty audio file)\n`);
    fails.push(s.scene); continue;
  }
  let text = '';
  try { text = await transcribe(file, hint); }
  catch (e) { process.stdout.write(`  ${String(s.scene).padStart(2)}   ----   ----   FAIL    (${e.message.slice(0, 60)})\n`); fails.push(s.scene); continue; }
  const sim = wordRatio(s.narration, text);
  const ok = sim >= THRESHOLD && norm(text).length > 0;
  if (!ok) fails.push(s.scene);
  process.stdout.write(`  ${String(s.scene).padStart(2)}   ${sim.toFixed(2)}          ${ok ? 'ok  ' : 'FAIL'}    ${text.slice(0, 70).replace(/\n/g, ' ')}\n`);
}

process.stdout.write(`\n${fails.length ? `FAIL scenes: ${fails.join(' ')}` : 'ALL PASS'}\n`);
process.exit(fails.length ? 1 : 0);
