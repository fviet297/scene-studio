import { Easing, interpolate } from "remotion";

// Natural cinematic easing (ease-out-expo family) — avoids robotic linear motion.
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

// Eased 0..1 progress across a scene's local frame range.
export function progress(
  frame: number,
  durationInFrames: number,
  easing = EASE,
): number {
  return interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// Deterministic sine oscillator in [-1, 1]. periodSec is the full cycle length.
export function osc(
  frame: number,
  fps: number,
  periodSec: number,
  phase = 0,
): number {
  return Math.sin((frame / (fps * periodSec)) * Math.PI * 2 + phase);
}

// Clamp a pan offset so a scaled image never reveals its edge. Overscan on each side is
// (scale-1)/2 * dimension; keep 90% of it as usable travel.
export function clampPan(
  scale: number,
  pan: number,
  dimension: number,
): number {
  const max = ((Math.max(scale, 1) - 1) / 2) * dimension * 0.9;
  return clamp(pan, -max, max);
}

// Fade multiplier for scene enter/exit — cross-dissolve feel without overlapping audio.
export function transitionOpacity(
  frame: number,
  durationInFrames: number,
  fadeIn: number,
  fadeOut: number,
): number {
  const inO =
    fadeIn > 0
      ? interpolate(frame, [0, fadeIn], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        })
      : 1;
  const outO =
    fadeOut > 0
      ? interpolate(
          frame,
          [durationInFrames - fadeOut, durationInFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
        )
      : 1;
  return Math.min(inO, outO);
}
