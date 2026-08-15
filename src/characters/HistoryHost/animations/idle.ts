/**
 * idle — alive but subtle. Breathing (body scale), a slow weight shift, gentle
 * head bob, tail sway, micro wing sway, occasional blink. Detuned sines keep it
 * from looking like a metronome; amplitudes stay small so it never "bounces".
 */
import type { Clip } from '../HistoryHost.types';
import { osc, scheduledBlink, wobble } from './_util';

export const idle: Clip = ({ frame, fps }) => {
  const breath = wobble(frame, fps, 4.0, 6.3);
  const bob = wobble(frame, fps, 3.7, 5.9);
  const sway = osc(frame, fps, 3.1);
  const tail = wobble(frame, fps, 2.7, 4.1);
  const shift = osc(frame, fps, 9.0); // slow left/right weight shift
  const eye = scheduledBlink(frame, fps);

  return {
    pose: {
      root: { x: shift * 2 },
      body: { scaleX: 1 - 0.01 * breath, scaleY: 1 + 0.016 * breath, rotate: shift * 0.6 },
      head: { y: -1.2 - bob * 1.4, rotate: bob * 1.3 + shift * 0.8 },
      hat: { rotate: -bob * 0.4 },
      wingLeft: { rotate: sway * 3.5 },
      wingRight: { rotate: -sway * 3.5 },
      tail: { rotate: tail * 5 },
    },
    face: { eyeOpenL: eye, eyeOpenR: eye, pupilDX: shift * 1.2 },
  };
};
