/**
 * celebrate — stronger victory loop for win/comparison-result scenes.
 *
 * Both wings thrown up high and pumping, bigger bounce, side-to-side tilt, little
 * leg kicks, tail swishing, open happy mouth. Loops on continuous sines.
 */
import type { Clip } from '../HistoryHost.types';
import { hop, osc } from './_util';

export const celebrate: Clip = ({ frame, fps }) => {
  const up = hop(frame, fps, 0.5, 1.4);
  const pump = osc(frame, fps, 0.5);
  const tilt = osc(frame, fps, 1.0);

  return {
    pose: {
      root: { y: -22 * up, rotate: tilt * 2 },
      wingLeft: { rotate: 150 + 16 * pump },
      wingRight: { rotate: -150 - 16 * pump },
      head: { y: -3 * up, rotate: tilt * 3 },
      hat: { rotate: -tilt * 1.5, y: -1 * up },
      body: { scaleY: 1 + 0.05 * up, scaleX: 1 - 0.03 * up },
      legLeft: { rotate: 6 * up },
      legRight: { rotate: -6 * up },
      tail: { rotate: tilt * 10 },
    },
    face: { mouth: 'open', browY: -6, eyeOpenL: 0.85, eyeOpenR: 0.85 },
  };
};
