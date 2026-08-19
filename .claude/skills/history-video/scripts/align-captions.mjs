// Per-scene caption alignment. For each scene audio file it detects real speech/silence
// regions and distributes that scene's tokens by weight across the spoken time, then
// offsets every word by the scene's cumulative start. Output is a flat list of caption
// groups in absolute seconds, matching the sequential playback of the per-scene audio.
// Approximate alignment (no word-level ASR). Run: node scripts/align-captions.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { SEGMENTS } from './narration-segments.mjs';

const AUDIO_DIR = 'public/audio';
const OUTPUT = 'src/caption-data.ts';

const probeDuration = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim());

const speechRegions = (file, duration) => {
  const analysis = execFileSync('sh', ['-c', `ffmpeg -i '${file}' -af silencedetect=noise=-32dB:d=0.18 -f null - 2>&1`], { encoding: 'utf8' });
  const events = [...analysis.matchAll(/silence_(start|end): ([0-9.]+)/g)].map((m) => ({ type: m[1], time: Number(m[2]) }));
  const silences = [];
  let silenceStart = null;
  for (const event of events) {
    if (event.type === 'start') silenceStart = event.time;
    if (event.type === 'end' && silenceStart !== null) {
      silences.push([silenceStart, event.time]);
      silenceStart = null;
    }
  }
  const speech = [];
  let cursor = 0;
  for (const [start, end] of silences) {
    if (start > cursor) speech.push([cursor, start]);
    cursor = end;
  }
  if (cursor < duration) speech.push([cursor, duration]);
  return speech;
};

const words = [];
const groups = [];
let sceneOffset = 0;

for (const segment of SEGMENTS) {
  const file = `${AUDIO_DIR}/scene-${String(segment.scene).padStart(2, '0')}.mp3`;
  if (!existsSync(file)) throw new Error(`missing audio ${file} — run generate-narration.mjs`);
  const duration = probeDuration(file);
  const speech = speechRegions(file, duration);
  const speechDuration = speech.reduce((sum, [start, end]) => sum + end - start, 0) || duration;
  const speechTimeAt = (target) => {
    let elapsed = 0;
    for (const [start, end] of speech) {
      const span = end - start;
      if (elapsed + span >= target) return start + target - elapsed;
      elapsed += span;
    }
    return duration;
  };

  const tokens = segment.text.replace(/\s+/g, ' ').trim().match(/\S+/g) ?? [];
  const weights = tokens.map((t) => Math.max(1, t.replace(/[^\p{L}\p{N}]/gu, '').length ** 0.55));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let consumed = 0;
  let group = [];
  tokens.forEach((text, index) => {
    const start = sceneOffset + speechTimeAt((consumed / totalWeight) * speechDuration);
    consumed += weights[index];
    const end = sceneOffset + speechTimeAt((consumed / totalWeight) * speechDuration);
    const word = { text, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) };
    words.push(word);
    group.push(word);
    if (group.length >= 7 || /[.!?:]$/.test(text)) {
      groups.push(group);
      group = [];
    }
  });
  if (group.length) groups.push(group); // flush at scene boundary — no group spans scenes
  sceneOffset += duration;
}

writeFileSync(OUTPUT, `export const captionGroups = ${JSON.stringify(groups, null, 2)} as const;\n`);
process.stdout.write(`Aligned ${words.length} words into ${groups.length} groups across ${sceneOffset.toFixed(3)} seconds (approximate).\n`);
