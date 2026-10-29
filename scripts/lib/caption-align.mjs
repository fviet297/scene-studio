// Shared caption alignment. For each scene's audio it detects speech/silence regions and
// distributes that scene's tokens by weight across the spoken time, offsetting every word by
// the scene's cumulative start. Returns a flat list of caption groups in absolute seconds.
// Approximate (no word-level ASR). Reused by align-captions.mjs (active project) and
// build-remotion.mjs (all projects).

import { execFileSync, spawnSync } from 'node:child_process';
import './ensure-ffmpeg.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const probeDuration = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).trim());

const speechRegions = (file, duration) => {
  // silencedetect logs to stderr; no shell so it also works on Windows.
  const run = spawnSync('ffmpeg', ['-i', file, '-af', 'silencedetect=noise=-32dB:d=0.18', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.error) throw run.error;
  const analysis = `${run.stdout ?? ''}${run.stderr ?? ''}`;
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

// segments: [{ scene, text }] (narration-bearing scenes, in order). audioDir: the project's audio
// folder. sceneSeconds: optional { [scene]: timelineSeconds } — the scene's length in the final
// video. When a motion clip makes a scene longer than its audio, the caption offset must advance
// by the timeline length (not the audio length) so captions stay aligned to the video, leaving the
// silent tail caption-free. Defaults to the audio length when a scene isn't listed.
// Throws if any segment's audio file is missing.
export const alignCaptions = (segments, audioDir, sceneSeconds = {}) => {
  const groups = [];
  let sceneOffset = 0;

  for (const segment of segments) {
    const file = join(audioDir, `scene-${String(segment.scene).padStart(2, '0')}.mp3`);
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
      group.push(word);
      if (group.length >= 7 || /[.!?:]$/.test(text)) {
        groups.push(group);
        group = [];
      }
    });
    if (group.length) groups.push(group); // flush at scene boundary — no group spans scenes
    // Advance by the scene's video-timeline length (>= audio when a motion clip extends it), so
    // captions for later scenes line up with the video rather than an audio-only timeline.
    sceneOffset += sceneSeconds[segment.scene] ?? duration;
  }

  return { groups, totalSeconds: sceneOffset };
};
