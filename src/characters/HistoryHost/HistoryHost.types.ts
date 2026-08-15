/**
 * Type contracts for the HistoryHost puppet.
 *
 * The puppet is split into independently transformable parts. An "animation"
 * produces a {@link HistoryHostFrame} (a pose + a face state) for a given video
 * frame; an "expression" only touches the face. Keeping these two axes separate
 * lets a single animation (e.g. `wave`) be combined with any expression
 * (e.g. `happy`).
 */

/** Facial presets. Achieved by transforming/swapping the SAME base eyes, brows, beak. */
export type ExpressionName = 'neutral' | 'happy' | 'surprised' | 'confident' | 'thinking';

/** Whole-body animation clips. */
export type AnimationName =
  | 'idle'
  | 'blink'
  | 'breathing'
  | 'head-tilt'
  | 'wave'
  | 'point-left'
  | 'point-right'
  | 'explain'
  | 'think'
  | 'surprised'
  | 'happy'
  | 'celebrate'
  | 'walk'
  | 'fly-in'
  | 'fly-out';

/** Independently rigged part groups. */
export type PartName =
  | 'root'
  | 'tail'
  | 'body'
  | 'head'
  | 'hat'
  | 'wingLeft'
  | 'wingRight'
  | 'legLeft'
  | 'legRight';

/**
 * A single part's local transform. All fields optional; every rotation and
 * scale is applied around the part's rig pivot (see {@link rig}). Rotation is in
 * degrees. `scale` sets both axes; `scaleX`/`scaleY` override per axis.
 */
export interface PartTransform {
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
}

/** Full-body pose: one transform per rigged part. */
export type HistoryHostPose = Record<PartName, PartTransform>;

/** How the mouth/beak is drawn for an expression. */
export type MouthShape = 'beak' | 'smile' | 'open' | 'frown';

/**
 * Face state. Eyes/brows are transformed (not swapped) so blink, squint and
 * brow emotion all compose. `eyeOpen*` is a vertical scale (1 = open, 0 = shut,
 * >1 = widened for surprise).
 */
export interface FaceState {
  eyeOpenL: number;
  eyeOpenR: number;
  browY: number;
  browRotL: number;
  browRotR: number;
  pupilDX: number;
  pupilDY: number;
  mouth: MouthShape;
}

/** Everything needed to draw the puppet for one video frame. */
export interface HistoryHostFrame {
  pose: HistoryHostPose;
  face: FaceState;
}

/** Sparse pose: only the parts a clip touches. Spread over REST_POSE. */
export type PoseOverrides = Partial<Record<PartName, PartTransform>>;

/**
 * Everything an animation clip needs. `frame` is LOCAL (0 at the clip's start —
 * inside a Remotion <Sequence> this is automatic). Clips are pure functions of
 * this context, so the same frame always yields the same visual.
 */
export interface ClipContext {
  frame: number;
  fps: number;
  durationInFrames: number;
}

/** A clip's output for one frame: sparse pose + optional face override. */
export interface ClipResult {
  pose: PoseOverrides;
  face?: Partial<FaceState>;
}

/** An animation clip: deterministic (frame → pose/face). */
export type Clip = (ctx: ClipContext) => ClipResult;

/** Public component props. */
export interface HistoryHostProps {
  animation?: AnimationName;
  expression?: ExpressionName;
  /** Rendered pixel width. Height derives from the viewBox aspect ratio. */
  width?: number;
  /** Optional explicit height; overrides the aspect-derived height. */
  height?: number;
  style?: React.CSSProperties;
  className?: string;
}
