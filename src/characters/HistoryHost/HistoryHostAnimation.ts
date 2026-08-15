/**
 * Animation registry + the single resolve entry point.
 *
 * `resolveFrame` runs the chosen clip for the current frame, spreads its sparse
 * pose over {@link REST_POSE}, and merges its face override on top of the chosen
 * expression. Adding an animation = drop a clip file + one line in CLIPS; the
 * puppet and driver never change.
 */
import type {
  AnimationName,
  Clip,
  ClipContext,
  ExpressionName,
  FaceState,
  HistoryHostPose,
} from './HistoryHost.types';
import { REST_POSE } from './HistoryHostPose';
import { faceFor } from './HistoryHostExpression';

import { idle } from './animations/idle';
import { wave } from './animations/wave';
import { pointLeft } from './animations/pointLeft';
import { pointRight } from './animations/pointRight';
import { explain } from './animations/explain';
import { think } from './animations/think';
import { surprised } from './animations/surprised';
import { happy } from './animations/happy';
import { celebrate } from './animations/celebrate';
import { blink, breathing, flyIn, flyOut, headTilt, walk } from './animations/misc';

const CLIPS: Record<AnimationName, Clip> = {
  idle,
  wave,
  'point-left': pointLeft,
  'point-right': pointRight,
  explain,
  think,
  surprised,
  happy,
  celebrate,
  // secondary / deferred (see animations/misc.ts)
  blink,
  breathing,
  'head-tilt': headTilt,
  walk,
  'fly-in': flyIn,
  'fly-out': flyOut,
};

/** Animations featured in the current polished set (drives the playground). */
export const FEATURED_ANIMATIONS: AnimationName[] = [
  'idle',
  'wave',
  'point-left',
  'point-right',
  'explain',
  'think',
  'surprised',
  'happy',
  'celebrate',
];

/** Resolve the full pose + face for one frame. */
export function resolveFrame(
  animation: AnimationName,
  expression: ExpressionName,
  ctx: ClipContext,
): { pose: HistoryHostPose; face: FaceState } {
  const clip = CLIPS[animation](ctx);
  return {
    pose: { ...REST_POSE, ...clip.pose },
    face: { ...faceFor(expression), ...(clip.face ?? {}) },
  };
}
