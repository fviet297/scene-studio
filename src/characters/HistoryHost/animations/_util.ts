/**
 * Deterministic animation helpers shared by clips. Everything here is a pure
 * function of frame/fps — no time, no random, no browser APIs — so a given
 * frame always renders identically.
 */
import { Easing, interpolate } from 'remotion';

export const TAU = Math.PI * 2;

/** Sine oscillator in [-1, 1]. `periodSec` = full cycle length in seconds. */
export function osc(frame: number, fps: number, periodSec: number, phase = 0): number {
  return Math.sin((frame / fps) * (TAU / periodSec) + phase);
}

/**
 * Sum of two detuned sines → organic, non-repeating-feeling motion. Amplitude
 * stays within [-1, 1]. Use for idle/secondary motion so it never looks robotic.
 */
export function wobble(frame: number, fps: number, p1: number, p2: number): number {
  return 0.6 * osc(frame, fps, p1) + 0.4 * osc(frame, fps, p2, 1.1);
}

/**
 * A grounded "hop": 0 at rest, 1 at apex, back to 0 — one arc per `periodSec`.
 * The exponent shapes the landing (>1 = crisper touch-down, springier bounce).
 */
export function hop(frame: number, fps: number, periodSec: number, sharpness = 1.5): number {
  const phase = ((frame / fps) / periodSec) % 1;
  return Math.pow(Math.sin(phase * Math.PI), sharpness);
}

/** Ramp 0→1 across a frame window, clamped, eased-out by default. */
export function ramp(
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.out(Easing.cubic),
): number {
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
}

/**
 * Deterministic, non-robotic blink. Blink starts are spaced by a cycled list of
 * varied intervals, so the cadence never lands on an obvious beat. Returns eye
 * openness in [0, 1] (1 open, 0 shut at mid-blink).
 */
const BLINK_INTERVALS = [3.5, 4.3, 3.0, 5.2, 3.8, 4.6];
const BLINK_HALF = 0.1; // seconds from open→shut (and shut→open)

export function scheduledBlink(frame: number, fps: number, speed = 1): number {
  const cycle = BLINK_INTERVALS.reduce((a, b) => a + b, 0);
  const t = ((frame / fps) * speed) % cycle;
  let at = 0;
  for (const interval of BLINK_INTERVALS) {
    at += interval;
    const d = t - at;
    if (d >= -BLINK_HALF && d <= BLINK_HALF) {
      const k = (d + BLINK_HALF) / (2 * BLINK_HALF); // 0..1 across the blink
      return Math.abs(k * 2 - 1); // 1 → 0 → 1 (shut at centre)
    }
  }
  return 1;
}

export { Easing, interpolate };
export { spring } from 'remotion';
