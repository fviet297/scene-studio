/**
 * think — curious, thoughtful (not sad).
 *
 * Right wing springs up to the chin/beak and gently taps; head tilts; gaze
 * drifts up-and-aside; outer brow lifts (quizzical); tail motion goes subtle.
 * Face cues are set here too, so `think` reads even with a neutral expression.
 */
import type { Clip } from '../HistoryHost.types';
import { interpolate, osc, scheduledBlink, spring } from './_util';

export const think: Clip = ({ frame, fps }) => {
  const s = spring({ frame, fps, config: { damping: 16, mass: 1 } });
  const tap = osc(frame, fps, 1.3) * s; // slow chin tap
  const eye = scheduledBlink(frame, fps, 0.7); // blink a bit slower while pondering

  return {
    pose: {
      wingRight: { rotate: -68 * s, x: 6 * s, y: (-20 + tap * 3) * s },
      head: { rotate: 8 * s + osc(frame, fps, 4.0) * 1.0 },
      hat: { rotate: -3 * s },
      body: { rotate: 2 * s },
      tail: { rotate: osc(frame, fps, 4.2) * 3 },
    },
    face: {
      pupilDX: 7 * s,
      pupilDY: -8 * s,
      eyeOpenR: interpolate(s, [0, 1], [1, 0.65]),
      eyeOpenL: eye,
      browRotL: -9 * s,
    },
  };
};
