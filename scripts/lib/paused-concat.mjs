// Join per-chunk TTS clips into one mp3 with a controlled pause between chunks.
//
// Each clip's own leading/trailing silence is trimmed to EDGE_KEEP_S, so the audible gap is
// always <pause> + 2 * EDGE_KEEP_S no matter how much dead air the voice left at the clip edges:
//   sentence  0.45 + 0.08 = 0.53 s  (VieNeu leaves 0.50-0.65 s between sentences in one chunk)
//   colon     0.55 + 0.08 = 0.63 s  (a beat before what the colon introduces)
// The dead-air trim (`clipFilter`) runs on each clip BEFORE the join, so it never shortens these
// pauses: run after the join, silenceremove would cut anything over 0.6 s down to 0.35 s.

import { GAP_COLON, GAP_SENTENCE } from './sentence-chunks.mjs';

export const PAUSE_SECONDS = { [GAP_SENTENCE]: 0.45, [GAP_COLON]: 0.55 };
export const EDGE_KEEP_S = 0.04;
const EDGE_THRESHOLD_DB = -45;
const SAMPLE_RATE = 48000;

const trimEdges = `silenceremove=start_periods=1:start_threshold=${EDGE_THRESHOLD_DB}dB:start_silence=${EDGE_KEEP_S}`;
// Trailing silence is trimmed by reversing, trimming the head, and reversing back.
const TRIM_BOTH_EDGES = `${trimEdges},areverse,${trimEdges},areverse`;

// Pause in seconds for each boundary name; an unknown name gets the sentence pause.
export const pauseFor = (gap) => PAUSE_SECONDS[gap] ?? PAUSE_SECONDS[GAP_SENTENCE];

// ffmpeg -filter_complex graph: [0:a]..[n-1:a] -> clips, anullsrc -> pauses, concat -> [out].
// `gaps[i]` names the boundary between clip i and i+1. `clipFilter` is an optional filter chain
// applied to every clip before the join (e.g. the dead-air trim).
export const buildPausedConcatGraph = (clipCount, { trim = true, gaps = [], clipFilter = '' } = {}) => {
  if (!Number.isInteger(clipCount) || clipCount < 1) throw new Error('clipCount must be a positive integer');
  const steps = [];
  const labels = [];
  for (let i = 0; i < clipCount; i += 1) {
    const chain = [`aresample=${SAMPLE_RATE}`, 'aformat=channel_layouts=mono'];
    if (trim) chain.push(TRIM_BOTH_EDGES);
    if (clipFilter) chain.push(clipFilter);
    steps.push(`[${i}:a]${chain.join(',')}[c${i}]`);
    labels.push(`[c${i}]`);
    if (i < clipCount - 1) {
      steps.push(`anullsrc=r=${SAMPLE_RATE}:cl=mono:d=${pauseFor(gaps[i])}[p${i}]`);
      labels.push(`[p${i}]`);
    }
  }
  steps.push(`${labels.join('')}concat=n=${labels.length}:v=0:a=1[out]`);
  return steps.join(';');
};

export const pausedConcatArgs = (files, output, options = {}) => [
  '-y',
  ...files.flatMap((file) => ['-i', file]),
  '-filter_complex', buildPausedConcatGraph(files.length, options),
  '-map', '[out]',
  '-codec:a', 'libmp3lame', '-q:a', '2',
  output,
];
