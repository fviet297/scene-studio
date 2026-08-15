import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const WS_URL = 'ws://127.0.0.1:8765/ws';
const VOICE = 'remotion';
const OUTPUT = 'public/narration.mp3';
const TEMP_DIR = 'tmp/narration';

const sentences = readFileSync('public/narration.txt', 'utf8').match(/[^.!?]+[.!?]+/g) ?? [];
const paragraphs = sentences.reduce((chunks, sentence) => {
  const text = sentence.trim();
  const last = chunks.at(-1);
  if (!last || `${last} ${text}`.length > 360) chunks.push(text);
  else chunks[chunks.length - 1] = `${last} ${text}`;
  return chunks;
}, []);

rmSync(TEMP_DIR, { recursive: true, force: true });
mkdirSync(TEMP_DIR, { recursive: true });

const socket = new WebSocket(WS_URL);
socket.binaryType = 'arraybuffer';

let pendingMeta = null;
let currentResolve = null;
let currentReject = null;

socket.on('message', (data, isBinary) => {
  if (!isBinary) {
    const message = JSON.parse(data.toString());
    if (message.type === 'audio_meta') pendingMeta = message;
    if (message.type === 'error') currentReject?.(new Error(message.message));
    return;
  }

  if (!pendingMeta || !currentResolve) return;
  currentResolve(Buffer.from(data));
  pendingMeta = null;
  currentResolve = null;
  currentReject = null;
});

await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});

const synthesize = (text, requestId) =>
  new Promise((resolve, reject) => {
    currentResolve = resolve;
    currentReject = reject;
    socket.send(
      JSON.stringify({
        request_id: requestId,
        text,
        lang: 'Vietnamese',
        mode: 'clone',
        voice: VOICE,
        speed: 1.08,
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
      }),
    );
  });

const files = [];
for (const [index, paragraph] of paragraphs.entries()) {
  const output = join(TEMP_DIR, `${String(index).padStart(2, '0')}.wav`);
  const audio = await synthesize(paragraph, index + 1);
  writeFileSync(output, audio);
  files.push(output);
  process.stdout.write(`Generated ${index + 1}/${paragraphs.length}\n`);
}

socket.close();
const concatList = join(TEMP_DIR, 'concat.txt');
writeFileSync(concatList, files.map((file) => `file '${join(process.cwd(), file)}'`).join('\n'));
// Concatenate at natural speech pace. Do NOT time-stretch to a preset duration —
// set composition duration from the real audio length instead (see references/workflow.md).
execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-codec:a', 'libmp3lame', '-q:a', '2', OUTPUT], {
  stdio: 'inherit',
});
rmSync(TEMP_DIR, { recursive: true, force: true });
