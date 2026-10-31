// Per-scene narration generator (OmniVoice clone voice).
// Each scene's narration in scene-plan.md becomes one file: public/audio/scene-NN.mp3.
// Keeping scenes separate means a mispronounced part is fixed by regenerating one scene,
// not the whole track.
//
// Regenerate everything:      node scripts/generate-narration.mjs
// Regenerate only scenes 5,7: node scripts/generate-narration.mjs 5 7

import './lib/ensure-ffmpeg.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activePaths, parseProjectArg } from './lib/project-paths.mjs';
import { narrationSegments, parsePlan } from './lib/parse-plan.mjs';
import { connectOmniVoice, DEFAULT_VOICE } from './lib/omnivoice-client.mjs';
import { readPlanHeader } from './lib/plan-writer.mjs';
import { normaliseForTts } from './lib/tts-text.mjs';
import { writeAudioNarration } from './lib/audio-narration.mjs';

const WS_URL = 'ws://127.0.0.1:8765/ws';
const TEMP_DIR = 'tmp/narration';
const MAX_CHUNK = 500;
// Iterative unmasking steps. Cost is linear in this number; quality saturates around the
// model's default of 32 (docs/generation-parameters.md). Low values force each step to commit
// many tokens at once, which frays consonants and tones.
//   final render: leave at 32   ·   quick draft: TTS_NUM_STEP=12 node scripts/generate-narration.mjs
const NUM_STEP = Number(process.env.TTS_NUM_STEP ?? 32);
// Only trim genuinely long dead air (> 0.6s) and leave 0.35s of breathing room, so natural
// pauses/rhythm survive instead of being clipped into a flat, monotone read. The threshold sits
// at -45dB rather than -35dB: Vietnamese unvoiced finals (-ch, -t, -p) and soft onsets live in
// that band, and cutting at -35dB shaved them off, which reads as slurred consonants.
const NARRATION_FILTER =
  'silenceremove=stop_periods=-1:stop_duration=0.6:stop_threshold=-45dB:stop_silence=0.35';

// Speech-rate ceiling in letters per second, diacritics excluded (the unit the model's own
// duration estimator effectively works in). Whisper QA put every dropped-word scene at 20+ and
// every clean scene below 19, so a chunk above this was given too little audio to fit its text.
// Such a chunk is re-synthesised with a lower speed, which buys it a longer target duration.
const MAX_RATE = 19;
const RETRIES = [{ speed: 0.92 }, { speed: 0.85 }];

const argv = process.argv.slice(2);
const paths = activePaths(argv);
const SEGMENTS = narrationSegments(parsePlan(paths.slug).scenes);
const AUDIO_DIR = paths.audioDir;
// The project's OmniVoice profile, picked in the review panel (`voice:` in the plan header).
const VOICE = readPlanHeader(readFileSync(paths.planMd, 'utf8'), 'voice') ?? DEFAULT_VOICE;
const { rest } = parseProjectArg(argv);
const only = rest.map(Number).filter((n) => Number.isFinite(n));
const targets = only.length ? SEGMENTS.filter((s) => only.includes(s.scene)) : SEGMENTS;
process.stdout.write(`OmniVoice ${WS_URL} · voice=${VOICE} · num_step=${NUM_STEP} · ${targets.length} scene(s): ${targets.map((s) => s.scene).join(', ')}\n`);

const toChunks = (text) =>
  (text.match(/[^.!?]+[.!?]+/g) ?? [text]).reduce((result, sentence) => {
    const part = sentence.trim();
    const last = result.at(-1);
    if (!last || `${last} ${part}`.length > MAX_CHUNK) result.push(part);
    else result[result.length - 1] = `${last} ${part}`;
    return result;
  }, []);

mkdirSync(AUDIO_DIR, { recursive: true });
rmSync(TEMP_DIR, { recursive: true, force: true });
mkdirSync(TEMP_DIR, { recursive: true });

const client = await connectOmniVoice({ url: WS_URL });
process.stdout.write('✓ connected to OmniVoice\n');

const synthesize = (text, requestId, override = {}) =>
  client.synthesize(requestId, {
    text,
    lang: 'Vietnamese',
    mode: 'clone',
    voice: VOICE,
    speed: 1,
    num_step: NUM_STEP,
    guidance_scale: 2,
    t_shift: 0.1,
    layer_penalty_factor: 5,
    position_temperature: 5,
    class_temperature: 0,
    audio_chunk_duration: 15,
    audio_chunk_threshold: 30,
    denoise: true,
    preprocess_prompt: true,
    postprocess_output: true,
    ...override,
  });

// Letters per second with diacritics stripped, which is roughly the unit the model's duration
// estimator counts in (combining marks carry zero weight there).
const speechRate = (text, seconds) =>
  [...text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')].filter((c) => /\S/.test(c)).length / seconds;

// Synthesise one chunk, retrying at a lower speed while the result is too rushed to hold all the
// text. Returns the slowest attempt if none clears MAX_RATE, since that one dropped the least.
const synthesizeChunk = async (text, label) => {
  let best = null;
  for (const [attempt, override] of [{}, ...RETRIES].entries()) {
    const result = await synthesize(text, ++requestId, override);
    const rate = speechRate(text, result.meta.duration);
    if (!best || rate < best.rate) best = { ...result, rate };
    if (rate <= MAX_RATE) {
      if (attempt > 0) process.stdout.write(`    ↻ ${label}: ${rate.toFixed(1)} letters/s after retry ${attempt}\n`);
      return best;
    }
    process.stdout.write(`    ⚠ ${label}: ${rate.toFixed(1)} letters/s (> ${MAX_RATE}) — retrying slower\n`);
  }
  process.stdout.write(`    ✗ ${label}: still ${best.rate.toFixed(1)} letters/s — check this scene\n`);
  return best;
};

let requestId = 0;
for (const segment of targets) {
  const chunks = toChunks(normaliseForTts(segment.text));
  process.stdout.write(`▶ scene ${segment.scene}: synthesizing ${chunks.length} chunk(s), ${segment.text.length} chars\n`);
  const files = [];
  for (const [index, chunk] of chunks.entries()) {
    const wav = join(TEMP_DIR, `scene-${segment.scene}-${String(index).padStart(2, '0')}.wav`);
    const { wav: audio } = await synthesizeChunk(chunk, `scene ${segment.scene} chunk ${index + 1}`);
    writeFileSync(wav, audio);
    files.push(wav);
  }
  const output = join(AUDIO_DIR, `scene-${String(segment.scene).padStart(2, '0')}.mp3`);
  if (files.length === 1) {
    execFileSync('ffmpeg', ['-y', '-i', files[0], '-af', NARRATION_FILTER, '-codec:a', 'libmp3lame', '-q:a', '2', output], { stdio: ['ignore', 'ignore', 'inherit'] });
  } else {
    const concatList = join(TEMP_DIR, `scene-${segment.scene}-concat.txt`);
    writeFileSync(concatList, files.map((file) => `file '${join(process.cwd(), file)}'`).join('\n'));
    execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-af', NARRATION_FILTER, '-codec:a', 'libmp3lame', '-q:a', '2', output], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  writeAudioNarration(AUDIO_DIR, segment.scene, segment.text);
  process.stdout.write(`✓ scene-${String(segment.scene).padStart(2, '0')}.mp3 (${chunks.length} chunk${chunks.length > 1 ? 's' : ''})\n`);
}

client.close();
rmSync(TEMP_DIR, { recursive: true, force: true });
process.stdout.write(`Done: ${targets.length} scene file(s) in ${AUDIO_DIR}/\n`);
