/**
 * Rest pose + the transform compiler that turns a {@link PartTransform} + pivot
 * into an SVG `transform` string. Pure geometry — no animation, no faces.
 */
import type { HistoryHostPose, PartTransform } from './HistoryHost.types';
import type { Pivot } from './rig';

/** Neutral pose: every part at identity. Clips spread their overrides over this. */
export const REST_POSE: HistoryHostPose = {
  root: {},
  tail: {},
  body: {},
  head: {},
  hat: {},
  wingLeft: {},
  wingRight: {},
  legLeft: {},
  legRight: {},
};

/**
 * Compile a part transform into an SVG `transform` string.
 *
 * Emitted order is `translate rotate scale`. SVG applies a transform list
 * right-to-left, so scale (about pivot) runs first, then rotate (about pivot),
 * then the translate offset — i.e. the part spins/scales in place, then shifts.
 */
export function buildTransform(t: PartTransform, pivot: Pivot): string {
  const out: string[] = [];

  if (t.x || t.y) {
    out.push(`translate(${round(t.x ?? 0)} ${round(t.y ?? 0)})`);
  }
  if (t.rotate) {
    out.push(`rotate(${round(t.rotate)} ${pivot.x} ${pivot.y})`);
  }

  const sx = t.scaleX ?? t.scale;
  const sy = t.scaleY ?? t.scale;
  if (sx !== undefined || sy !== undefined) {
    out.push(
      `translate(${pivot.x} ${pivot.y}) scale(${round(sx ?? 1)} ${round(sy ?? 1)}) translate(${-pivot.x} ${-pivot.y})`,
    );
  }

  return out.join(' ');
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
