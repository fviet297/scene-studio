/**
 * happy — cheerful, cute (not exaggerated). Gentle grounded bounce with light
 * squash/stretch, wings a touch outward, tail sway, smiling squint + blink.
 */
import type { Clip } from '../HistoryHost.types';
import { hop, osc, scheduledBlink } from './_util';

export const happy: Clip = ({ frame, fps }) => {
  const up = hop(frame, fps, 0.75, 1.6);
  const eye = scheduledBlink(frame, fps);

  return {
    pose: {
      root: { y: -12 * up },
      body: { scaleY: 1 + 0.04 * up, scaleX: 1 - 0.03 * up },
      head: { y: -2 * up, rotate: osc(frame, fps, 1.5) * 2 },
      wingLeft: { rotate: 20 + 14 * up },
      wingRight: { rotate: -20 - 14 * up },
      tail: { rotate: osc(frame, fps, 0.75) * 8 },
    },
    face: { mouth: 'smile', eyeOpenL: Math.min(eye, 0.8), eyeOpenR: Math.min(eye, 0.8) },
  };
};
