/**
 * surprised — cute but strong reaction with anticipation → snap.
 *
 * Anticipation (first ~6f): lean in, squash, eyes narrow. Reaction: a low-damped
 * spring snaps head+body backward, eyes widen past normal, brows shoot up, beak
 * opens, wings fly up-and-out. The springy overshoot gives the recoil.
 */
import type { Clip } from '../HistoryHost.types';
import { interpolate, spring } from './_util';

const ANTIC = 6;

export const surprised: Clip = ({ frame, fps }) => {
  const antic = interpolate(frame, [0, ANTIC], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const react = spring({
    frame: frame - ANTIC,
    fps,
    config: { damping: 9, mass: 0.6, stiffness: 140 },
  });
  const windUp = antic * (1 - react); // present only during the anticipation beat

  const narrow = interpolate(antic, [0, 1], [1, 0.72]);
  const eyeOpen = interpolate(react, [0, 1], [narrow, 1.28]);

  return {
    pose: {
      root: { y: 6 * windUp - 12 * react, x: 4 * react },
      body: {
        scaleX: 1 + 0.04 * windUp - 0.02 * react,
        scaleY: 1 - 0.03 * windUp + 0.06 * react,
        rotate: 2 * react,
      },
      head: { y: 4 * windUp - 8 * react, rotate: -2 * react },
      wingLeft: { rotate: -6 * windUp + 34 * react },
      wingRight: { rotate: 6 * windUp - 34 * react },
      tail: { rotate: 10 * react },
    },
    face: {
      eyeOpenL: eyeOpen,
      eyeOpenR: eyeOpen,
      browY: interpolate(react, [0, 1], [2 * windUp, -11]),
      mouth: react > 0.35 ? 'open' : 'beak',
    },
  };
};
