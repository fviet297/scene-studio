import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const AUDIO = 'public/narration.mp3';
const OUTPUT = 'src/caption-data.ts';
// Derive from the real audio — never assume a preset length.
const DURATION = Number(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', AUDIO], {
    encoding: 'utf8',
  }).trim(),
);

const transcript = readFileSync('public/narration.txt', 'utf8').replace(/\s+/g, ' ').trim();
const tokens = transcript.match(/\S+/g) ?? [];
const analysis = execFileSync(
  'sh',
  ['-c', `ffmpeg -i '${AUDIO}' -af silencedetect=noise=-32dB:d=0.18 -f null - 2>&1`],
  { encoding: 'utf8' },
);

const silenceEvents = [...analysis.matchAll(/silence_(start|end): ([0-9.]+)/g)].map((match) => ({
  type: match[1],
  time: Number(match[2]),
}));

const silences = [];
let silenceStart = null;
for (const event of silenceEvents) {
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
if (cursor < DURATION) speech.push([cursor, DURATION]);

const speechDuration = speech.reduce((sum, [start, end]) => sum + end - start, 0);
const weights = tokens.map((token) => Math.max(1, token.replace(/[^\p{L}\p{N}]/gu, '').length ** 0.55));
const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

const speechTimeAt = (target) => {
  let elapsed = 0;
  for (const [start, end] of speech) {
    const duration = end - start;
    if (elapsed + duration >= target) return start + target - elapsed;
    elapsed += duration;
  }
  return DURATION;
};

let consumedWeight = 0;
const words = tokens.map((text, index) => {
  const start = speechTimeAt((consumedWeight / totalWeight) * speechDuration);
  consumedWeight += weights[index];
  const end = speechTimeAt((consumedWeight / totalWeight) * speechDuration);
  return { text, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) };
});

const groups = [];
let group = [];
for (const word of words) {
  group.push(word);
  if (group.length >= 7 || /[.!?:]$/.test(word.text)) {
    groups.push(group);
    group = [];
  }
}
if (group.length) groups.push(group);

writeFileSync(
  OUTPUT,
  `export const captionGroups = ${JSON.stringify(groups, null, 2)} as const;\n`,
);

process.stdout.write(`Aligned ${words.length} words into ${groups.length} groups using ${speech.length} speech intervals.\n`);
