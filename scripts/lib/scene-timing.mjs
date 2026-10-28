// How long a scene runs in the final video, shared by the render data builder (build-remotion.mjs)
// and the review server. The timeline preview (review-timeline.js) mirrors these rules in the
// browser — keep the two in step.
//
// A scene lasts as long as its narration audio or its motion clip, whichever is longer. A scene's
// optional `duration:` (seconds) is a minimum on top of that: it can hold a scene past the end of its
// narration, never cut the narration short. A scene with no audio yet holds for its minimum, or for
// the placeholder length when it has none.

export const PLACEHOLDER_SCENE_SECONDS = 4;
// Upper bound for a scene's minimum — far past any real scene, it only catches typos like "80" for "8".
export const MAX_MIN_DURATION_SECONDS = 600;

export const sceneContentSeconds = ({ audio, clip = 0, minDuration }) => {
  const floor = minDuration ?? 0;
  return Math.max(audio ?? minDuration ?? PLACEHOLDER_SCENE_SECONDS, clip, floor);
};

// A scene-plan `duration:` value → { value } in seconds (undefined = no minimum), or { error }.
// Accepts "8", "7.5s" and the Vietnamese decimal comma "4,5".
export const parseMinDuration = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { value: undefined };
  const match = /^(\d+(?:[.,]\d+)?)\s*s?$/i.exec(text);
  const value = match ? Number(match[1].replace(',', '.')) : NaN;
  if (!(value > 0) || value > MAX_MIN_DURATION_SECONDS) {
    return { error: `duration must be a number of seconds between 0 and ${MAX_MIN_DURATION_SECONDS} (got "${text}")` };
  }
  return { value };
};
