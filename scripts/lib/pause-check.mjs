// Stray-pause check for TTS takes. VieNeu sometimes stops for 0.3-0.5s in the middle of a phrase
// that has no punctuation ("Đào Duy ... Từ"); it is random, so a second take of the same text is
// usually clean. A take's pauses are measured with ffmpeg's silencedetect and compared with the
// pauses the text itself asks for (one per comma / semicolon).

import { spawnSync } from 'node:child_process';

// Shorter dips are ordinary word gaps; the stray pauses heard in practice are 0.3s and longer.
export const MIN_PAUSE_SECONDS = 0.25;
export const PAUSE_NOISE_DB = -32;
// Silence this close to either end of the clip is the clip's own padding, not a pause.
const EDGE_SECONDS = 0.15;

const toSeconds = (clock) => {
  const [h, m, s] = clock.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

// ffmpeg stderr of `-af silencedetect` → { duration, pauses: [{ start, end }] }. A trailing
// silence has a start but no end; it is closed at the clip's end.
export const parseSilenceLog = (log) => {
  const duration = toSeconds(/Duration: (\d+:\d+:[\d.]+)/.exec(log)?.[1] ?? '0:0:0');
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => Math.max(0, Number(m[1])));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const pauses = starts.map((start, i) => ({ start, end: ends[i] ?? duration }));
  return { duration, pauses };
};

// Pauses strictly inside the speech: not the lead-in and not the tail.
export const internalPauses = ({ duration, pauses }) =>
  pauses.filter((p) => p.start > EDGE_SECONDS && p.end < duration - EDGE_SECONDS);

// Pauses the text itself asks for: a comma or semicolon each.
export const expectedPauses = (text) => (String(text).match(/[,;]/g) ?? []).length;

// How many internal pauses exceed what the punctuation explains; 0 means a clean take.
export const strayPauseCount = (analysis, text) =>
  Math.max(0, internalPauses(analysis).length - expectedPauses(text));

export const measurePauses = (file) => {
  const run = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${PAUSE_NOISE_DB}dB:d=${MIN_PAUSE_SECONDS}`, '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  return parseSilenceLog(run.stderr ?? '');
};
