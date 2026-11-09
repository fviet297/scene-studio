// One narration, several shots. A `## scene` with narration starts a narration group; every scene
// after it that has no narration of its own is another shot (image / motion) of that group and
// plays on under the same narration audio and captions. Shared by the render data builder
// (build-remotion.mjs), the review server and the script writer; the timeline preview
// (review-timeline.js) mirrors groupShotSeconds in the browser — keep the two in step.
//
// How a group's time is split between its shots:
//   - a shot with a motion clip runs for the clip's length;
//   - the stills share what is left of the narration evenly (so with no motion yet, each still is
//     audio / number of shots);
//   - when every shot has a clip and together they are shorter than the narration, the clips are
//     stretched to span it (slowed down a little);
//   - when every shot has a clip and together they are longer than the narration, the last shot is
//     cut at the end of the narration (at least MIN_TAIL_SHOT_SECONDS of it stays), so motion never
//     keeps playing over silence;
//   - the same cut applies to the last motion shot when stills (at least MIN_STILL_SECONDS each)
//     plus clips would overrun the narration.
// A shot's `duration:` stays a minimum on top of that.

import { PLACEHOLDER_SCENE_SECONDS } from './scene-timing.mjs';

// Shortest a still gets when the motion clips already fill (or overrun) the narration.
export const MIN_STILL_SECONDS = 2;
// Shortest the last motion shot keeps when it is cut to fit the narration.
export const MIN_TAIL_SHOT_SECONDS = 2;
// A group whose shots run this much longer than its narration is reported as having a silent tail.
export const SILENT_TAIL_WARN_SECONDS = 1;
// Most a clip may be slowed to span a narration; past this shotCountFor adds another shot.
export const MAX_SLOWDOWN = 1.25;
// Measured over six narrated projects (diacritic-stripped letters and digits per second of
// OmniVoice audio, pauses included): 12.7–14.0. Only used to plan shots before the audio exists.
export const SPEECH_LETTERS_PER_SECOND = 13.5;
// Motion length bounds the plan header `motion-duration:` accepts (seconds).
export const MOTION_DURATION_MIN = 1;
export const MOTION_DURATION_MAX = 20;

// Scenes (in plan order) → [{ head, members }] of indices into `scenes`. `head` is the index of the
// scene holding the narration; a leading scene without narration starts its own (silent) group.
export const shotGroups = (scenes) => {
  const groups = [];
  scenes.forEach((s, i) => {
    if (s.narration || !groups.length) groups.push({ head: i, members: [i] });
    else groups.at(-1).members.push(i);
  });
  return groups;
};

const sum = (values) => values.reduce((total, v) => total + v, 0);

// One group's shot lengths in seconds, in shot order. `audio`: the narration's length (null while
// it has no audio). `shots`: [{ clip, minDuration }] — clip = the motion clip's seconds, 0 for a still.
export const groupShotSeconds = ({ audio, shots }) => {
  const isMotion = (s) => s.clip > 0;
  const floor = (s, seconds) => Math.max(seconds, s.minDuration ?? 0);
  if (audio === null || audio === undefined) {
    return shots.map((s) => floor(s, isMotion(s) ? s.clip : (s.minDuration ?? PLACEHOLDER_SCENE_SECONDS)));
  }
  const motionSeconds = sum(shots.filter(isMotion).map((s) => s.clip));
  const stills = shots.filter((s) => !isMotion(s)).length;
  if (stills > 0) {
    const share = Math.max((audio - motionSeconds) / stills, stills === shots.length ? 0 : MIN_STILL_SECONDS);
    // Clips plus the stills' minimum overrun the narration: cut the last motion shot so the group
    // ends with the narration instead of playing on over silence.
    const motionBudget = audio - share * stills;
    if (motionSeconds > motionBudget) {
      const last = shots.map(isMotion).lastIndexOf(true);
      const before = sum(shots.slice(0, last).filter(isMotion).map((s) => s.clip));
      const tail = Math.min(shots[last].clip, Math.max(motionBudget - before, MIN_TAIL_SHOT_SECONDS));
      return shots.map((s, i) => floor(s, i === last ? tail : isMotion(s) ? s.clip : share));
    }
    return shots.map((s) => floor(s, isMotion(s) ? s.clip : share));
  }
  if (motionSeconds > audio) {
    const last = shots.length - 1;
    const before = sum(shots.slice(0, last).map((s) => s.clip));
    const tail = Math.min(shots[last].clip, Math.max(audio - before, MIN_TAIL_SHOT_SECONDS));
    return shots.map((s, i) => floor(s, i === last ? tail : s.clip));
  }
  const stretch = motionSeconds > 0 && motionSeconds < audio ? audio / motionSeconds : 1;
  return shots.map((s) => floor(s, s.clip * stretch));
};

// Rough spoken length of a Vietnamese narration line, from its letter count.
export const estimateNarrationSeconds = (text) => {
  const letters = [...String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')]
    .filter((c) => /[\p{L}\p{N}]/u.test(c)).length;
  return letters / SPEECH_LETTERS_PER_SECOND;
};

// How many shots a narration needs so motion clips of `motionSeconds` fit it: rounded down (the
// clips are then slowed a little to span it, never left running past it), at least 1. When that
// would slow them by more than MAX_SLOWDOWN, one more shot is added (its tail is cut to fit).
export const shotCountFor = (seconds, motionSeconds) => {
  if (!(motionSeconds > 0)) return 1;
  const whole = Math.max(1, Math.floor(seconds / motionSeconds + 1e-9));
  return seconds / (whole * motionSeconds) > MAX_SLOWDOWN ? whole + 1 : whole;
};

// A plan header `motion-duration:` value → { value } in seconds (undefined = not set), or { error }.
export const parseMotionDuration = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { value: undefined };
  const match = /^(\d+(?:[.,]\d+)?)\s*s?$/i.exec(text);
  const value = match ? Number(match[1].replace(',', '.')) : NaN;
  if (!(value >= MOTION_DURATION_MIN && value <= MOTION_DURATION_MAX)) {
    return { error: `motion-duration phải là số giây từ ${MOTION_DURATION_MIN} đến ${MOTION_DURATION_MAX} (nhận "${text}")` };
  }
  return { value };
};
