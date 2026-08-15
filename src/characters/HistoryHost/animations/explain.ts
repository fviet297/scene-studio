/**
 * explain — the workhorse presenter gesture (loops seamlessly).
 *
 * Wings alternate: each raises on its own half-cycle (via max(0, sin)) like a
 * host gesturing points to the audience. Small synced head moves + a gentle
 * body breath + a talking beak flap + occasional blink. Built from continuous
 * sines so it loops with no seam.
 */
import type { Clip } from '../HistoryHost.types';
import { osc, scheduledBlink } from './_util';

export const explain: Clip = ({ frame, fps }) => {
  const a = Math.max(0, osc(frame, fps, 1.6)); // left wing lifts on its half-cycle
  const b = Math.max(0, osc(frame, fps, 1.6, Math.PI)); // right wing on the other half
  const nod = osc(frame, fps, 2.3);
  const talk = osc(frame, fps, 0.5) > 0.1; // beak open ~half the time
  const eye = scheduledBlink(frame, fps);

  return {
    pose: {
      wingLeft: { rotate: 22 + 20 * a, y: -3 * a },
      wingRight: { rotate: -22 - 20 * b, y: -3 * b },
      head: { rotate: nod * 2, y: -1 - 0.6 * osc(frame, fps, 3.0) },
      body: { scaleY: 1 + 0.008 * osc(frame, fps, 2.6) },
      tail: { rotate: osc(frame, fps, 2.9) * 4 },
    },
    face: { mouth: talk ? 'open' : 'smile', browY: -2, eyeOpenL: eye, eyeOpenR: eye },
  };
};
