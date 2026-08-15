/**
 * wave — friendly cartoon wave with the right wing.
 *
 * Phases: wind-up (wing dips the other way) → raise (spring, overshoots a touch)
 * → 2–3 decaying wave oscillations around the raised angle → lower back to rest
 * → hold. Head/body lean into it as secondary motion; blink continues.
 */
import type { Clip } from '../HistoryHost.types';
import { interpolate, osc, scheduledBlink, spring } from './_util';

const RAISE_AT = 6;
const RAISED = -105; // wingRight up-and-out
const WAVE_END = 58;

export const wave: Clip = ({ frame, fps }) => {
  const antic = interpolate(frame, [0, RAISE_AT], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const raise = spring({ frame: frame - RAISE_AT, fps, config: { damping: 13, mass: 0.9 } });
  const lower = spring({ frame: frame - WAVE_END, fps, config: { damping: 16 } });

  // Decaying wave, only during the raised window.
  const waveAmp = interpolate(frame, [20, WAVE_END], [18, 7], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const waveOsc = frame > RAISE_AT && frame < WAVE_END ? osc(frame, fps, 0.42) * waveAmp : 0;

  const raisedAngle = interpolate(raise, [0, 1], [8 * antic, RAISED]); // wind-up dip → raised
  const settled = interpolate(lower, [0, 1], [raisedAngle, 0]); // → rest
  const rotate = settled + waveOsc * (1 - lower);

  const up = raise * (1 - lower); // how "raised" we currently are, 0..1
  const eye = scheduledBlink(frame, fps);

  return {
    pose: {
      wingRight: { rotate },
      head: { rotate: -3 * up + osc(frame, fps, 0.9) * 1.5 * up },
      body: { rotate: 1.2 * up, scaleY: 1 + 0.01 * up },
      tail: { rotate: osc(frame, fps, 1.1) * 4 },
    },
    face: { eyeOpenL: Math.min(eye, 0.92), eyeOpenR: Math.min(eye, 0.92) },
  };
};
