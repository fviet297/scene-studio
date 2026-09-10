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
// (loaded from ./.env). Threshold overridable via QA_THRESHOLD (default 0.72).

import { existsSync, openAsBlob, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { activePaths, parseProjectArg, sceneBase } from './lib/project-paths.mjs';
import { loadEnv } from './lib/replicate-image.mjs';

loadEnv();
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { process.stderr.write('OPENAI_API_KEY not set (put it in .env).\n'); process.exit(2); }
const THRESHOLD = Number(process.env.QA_THRESHOLD ?? 0.72);

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

const transcribe = async (file) => {
  const form = new FormData();
  form.set('file', await openAsBlob(file), file.split('/').pop());
  form.set('model', 'whisper-1');
  form.set('language', 'vi');
  form.set('response_format', 'json');
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`whisper ${res.status}: ${await res.text()}`);
  return (await res.json()).text ?? '';
};

const targets = plan.scenes.filter((s) => s.narration && (!only.length || only.includes(s.scene)));
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
  try { text = await transcribe(file); }
  catch (e) { process.stdout.write(`  ${String(s.scene).padStart(2)}   ----   ----   FAIL    (${e.message.slice(0, 60)})\n`); fails.push(s.scene); continue; }
  const sim = wordRatio(s.narration, text);
  const ok = sim >= THRESHOLD && norm(text).length > 0;
  if (!ok) fails.push(s.scene);
  process.stdout.write(`  ${String(s.scene).padStart(2)}   ${sim.toFixed(2)}          ${ok ? 'ok  ' : 'FAIL'}    ${text.slice(0, 70).replace(/\n/g, ' ')}\n`);
}

process.stdout.write(`\n${fails.length ? `FAIL scenes: ${fails.join(' ')}` : 'ALL PASS'}\n`);
process.exit(fails.length ? 1 : 0);
