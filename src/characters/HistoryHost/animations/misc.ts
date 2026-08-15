/**
 * Secondary clips kept for type completeness of AnimationName. These are the
 * earlier lightweight versions — NOT part of the polished pass (blink/breathing
 * are building blocks; walk/fly are intentionally deferred per current scope).
 */
import type { Clip } from '../HistoryHost.types';
import { osc, scheduledBlink, spring } from './_util';

export const blink: Clip = ({ frame, fps }) => {
  const eye = scheduledBlink(frame, fps, 1.6);
  return { pose: {}, face: { eyeOpenL: eye, eyeOpenR: eye } };
};

export const breathing: Clip = ({ frame, fps }) => {
  const b = osc(frame, fps, 3.6);
  return {
    pose: {
      body: { scaleX: 1 - 0.02 * b, scaleY: 1 + 0.032 * b },
      head: { y: -b * 2.4 },
    },
  };
};

export const headTilt: Clip = ({ frame, fps }) => {
  const s = spring({ frame, fps, config: { damping: 12 } });
  return { pose: { head: { rotate: 12 * s }, hat: { rotate: -2.4 * s } } };
};

export const walk: Clip = ({ frame, fps }) => {
  const gait = osc(frame, fps, 0.6);
  const bob = Math.abs(gait);
  return {
    pose: {
      root: { y: -3 * bob },
      body: { rotate: gait * 2 },
      legLeft: { rotate: gait * 18 },
      legRight: { rotate: -gait * 18 },
      wingLeft: { rotate: -gait * 10 },
      wingRight: { rotate: gait * 10 },
      head: { rotate: gait * 2 },
      tail: { rotate: -gait * 6 },
    },
  };
};

export const flyIn: Clip = ({ frame, fps }) => {
  const s = spring({ frame, fps, config: { damping: 18, mass: 0.8 } });
  const flap = osc(frame, fps, 0.28);
  return {
    pose: {
      root: { y: -520 * (1 - s), x: -60 * (1 - s) },
      wingLeft: { rotate: 60 + flap * 45 },
      wingRight: { rotate: -60 - flap * 45 },
      head: { rotate: 6 * (1 - s) },
    },
  };
};

export const flyOut: Clip = ({ frame, fps }) => {
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: fps });
  const flap = osc(frame, fps, 0.28);
  return {
    pose: {
      root: { y: -520 * s, x: 60 * s },
      wingLeft: { rotate: 60 + flap * 45 },
      wingRight: { rotate: -60 - flap * 45 },
      head: { rotate: -6 * s },
    },
  };
};
