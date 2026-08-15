/**
 * Expressions — independent from body animation.
 *
 * An expression is only a partial {@link FaceState} (a set of transforms on the
 * SAME base eyes/brows/beak + a mouth variant). The driver merges the running
 * clip's face override ON TOP of the resolved expression, so any animation
 * combines with any expression: `<HistoryHost animation="point-left" expression="confident" />`.
 */
import type { ExpressionName, FaceState } from './HistoryHost.types';

/** Neutral face. Every field explicit so overrides are predictable. */
export const REST_FACE: FaceState = {
  eyeOpenL: 1,
  eyeOpenR: 1,
  browY: 0,
  browRotL: 0,
  browRotR: 0,
  pupilDX: 0,
  pupilDY: 0,
  mouth: 'beak',
};

export const EXPRESSIONS: Record<ExpressionName, Partial<FaceState>> = {
  neutral: {},
  happy: { mouth: 'smile', browY: -3, eyeOpenL: 0.82, eyeOpenR: 0.82 },
  surprised: { mouth: 'open', browY: -9, eyeOpenL: 1.18, eyeOpenR: 1.18 },
  // Chin-up smirk: soft smile, slightly narrowed eyes, level/low brows.
  confident: { mouth: 'smile', browY: 1.5, eyeOpenL: 0.9, eyeOpenR: 0.9 },
  // Quizzical: outer brow up, one eye narrowed, gaze drifting up-and-aside.
  thinking: { browRotL: -10, eyeOpenR: 0.7, pupilDX: 8, pupilDY: -7 },
};

/** Resolve an expression name to a full face state. */
export function faceFor(expression: ExpressionName): FaceState {
  return { ...REST_FACE, ...EXPRESSIONS[expression] };
}
