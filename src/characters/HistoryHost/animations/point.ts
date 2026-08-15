/**
 * Shared pointing gesture used by point-left / point-right (mirror of each other).
 *
 * Spring-in to a clear pointing pose, then HOLD with tiny secondary motion so a
 * caption or second character can appear beside HistoryHost while it stays put.
 * The spring is slightly underdamped → a small natural overshoot on arrival.
 */
import type { Clip } from '../HistoryHost.types';
import { interpolate, osc, scheduledBlink, spring } from './_util';

export function makePoint(dir: 'left' | 'right'): Clip {
  const sign = dir === 'left' ? -1 : 1; // screen direction
  const wing = dir === 'left' ? 'wingLeft' : 'wingRight';
  const wingAngle = dir === 'left' ? 120 : -120; // outstretched, at pivot = shoulder

  return ({ frame, fps }) => {
    const s = spring({ frame, fps, config: { damping: 15, mass: 0.9 } });
    // Tiny anticipation: lean the opposite way for the first few frames.
    const wind = interpolate(frame, [0, 4, 9], [0, -1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const alive = osc(frame, fps, 3.2) * s; // subtle life during the hold
    const eye = scheduledBlink(frame, fps);

    return {
      pose: {
        [wing]: { rotate: wingAngle * s - sign * alive * 1.5 },
        body: { rotate: sign * (3 * s + wind), x: sign * (4 * s + wind * 1.5) },
        head: { rotate: sign * 4 * s + alive * 0.6, y: -1 * s },
        tail: { rotate: -sign * 4 * s + osc(frame, fps, 2.6) * 3 },
      },
      face: {
        pupilDX: sign * 9 * s,
        browRotL: dir === 'left' ? -6 * s : 0,
        browRotR: dir === 'right' ? 6 * s : 0,
        eyeOpenL: eye,
        eyeOpenR: eye,
      },
    };
  };
}
