// Per-scene narration generator (OmniVoice clone voice).
// Each segment in narration-segments.mjs becomes one file: public/audio/scene-NN.mp3.
// Keeping scenes separate means a mispronounced part is fixed by regenerating one scene,
// not the whole track.
//
// Regenerate everything:      node scripts/generate-narration.mjs
// Regenerate only scenes 5,7: node scripts/generate-narration.mjs 5 7

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { SEGMENTS } from './narration-segments.mjs';

const WS_URL = 'ws://127.0.0.1:8765/ws';
const VOICE = 'remotion';
const AUDIO_DIR = 'public/audio';
const TEMP_DIR = 'tmp/narration';
const MAX_CHUNK = 320;
const NARRATION_FILTER =
  'silenceremove=stop_periods=-1:stop_duration=0.28:stop_threshold=-35dB:stop_silence=0.18';

const only = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const targets = only.length ? SEGMENTS.filter((s) => only.includes(s.scene)) : SEGMENTS;

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

const socket = new WebSocket(WS_URL);
socket.binaryType = 'arraybuffer';
let resolveAudio;
let rejectAudio;
let hasMetadata = false;

socket.on('message', (data, isBinary) => {
  if (!isBinary) {
    const message = JSON.parse(data.toString());
    if (message.type === 'audio_meta') hasMetadata = true;
    if (message.type === 'error') rejectAudio?.(new Error(message.message));
    return;
  }
  if (!hasMetadata || !resolveAudio) return;
  resolveAudio(Buffer.from(data));
  resolveAudio = undefined;
  rejectAudio = undefined;
  hasMetadata = false;
});

await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

const synthesize = (text, requestId) =>
  new Promise((resolve, reject) => {
    resolveAudio = resolve;
    rejectAudio = reject;
    socket.send(JSON.stringify({
      request_id: requestId,
      text,
      lang: 'Vietnamese',
      mode: 'clone',
      voice: VOICE,
      speed: 1,
      num_step: 12,
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
    }));
  });

let requestId = 0;
for (const segment of targets) {
  const chunks = toChunks(segment.text);
  const files = [];
  for (const [index, chunk] of chunks.entries()) {
    const wav = join(TEMP_DIR, `scene-${segment.scene}-${String(index).padStart(2, '0')}.wav`);
    writeFileSync(wav, await synthesize(chunk, ++requestId));
    files.push(wav);
  }
  const output = join(AUDIO_DIR, `scene-${String(segment.scene).padStart(2, '0')}.mp3`);
  if (files.length === 1) {
    execFileSync('ffmpeg', ['-y', '-i', files[0], '-af', NARRATION_FILTER, '-codec:a', 'libmp3lame', '-q:a', '2', output], { stdio: 'ignore' });
  } else {
    const concatList = join(TEMP_DIR, `scene-${segment.scene}-concat.txt`);
    writeFileSync(concatList, files.map((file) => `file '${join(process.cwd(), file)}'`).join('\n'));
    execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-af', NARRATION_FILTER, '-codec:a', 'libmp3lame', '-q:a', '2', output], { stdio: 'ignore' });
  }
  process.stdout.write(`✓ scene-${String(segment.scene).padStart(2, '0')}.mp3 (${chunks.length} chunk${chunks.length > 1 ? 's' : ''})\n`);
}

socket.close();
rmSync(TEMP_DIR, { recursive: true, force: true });
process.stdout.write(`Done: ${targets.length} scene file(s) in ${AUDIO_DIR}/\n`);
