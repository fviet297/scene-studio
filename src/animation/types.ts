// Shared config types for the cinematic animation engine.
// A scene is described declaratively (see src/scene-motion.ts) so new scenes are
// authored by editing config, never by writing animation logic per scene.

export type Fit = "cover" | "contain";

// Cinematic camera move across the scene. Values are eased from *From -> *To over the
// scene duration. Pan is in composition pixels; it is auto-clamped to the zoom overscan
// so the image edge can never reveal the background.
export type CameraConfig = {
  zoomFrom?: number; // default 1.08 — kept >1 so pan has overscan headroom
  zoomTo?: number; // default 1.16
  xFrom?: number; // px, default 0
  xTo?: number; // px, default 0
  yFrom?: number; // px, default 0
  yTo?: number; // px, default 0
  origin?: string; // transform-origin, default "50% 50%"
  drift?: number; // subtle handheld amplitude in px, default 1 (0 disables)
};

export type ToggleOr<T> = boolean | T;

export type AtmosphereConfig = {
  fog?: ToggleOr<{ intensity?: number; color?: string; speed?: number }>;
  snow?: ToggleOr<{ count?: number; speed?: number }>;
  dust?: ToggleOr<{ count?: number; color?: string }>;
  embers?: ToggleOr<{ count?: number }>;
  lightRays?: ToggleOr<{ angle?: number; color?: string; intensity?: number }>;
  vignette?: ToggleOr<{ intensity?: number }>;
  grain?: ToggleOr<{ intensity?: number }>;
};

// A single depth plane. depth 0 = far background (barely moves), 1 = foreground (moves
// fully with the camera). Used by ParallaxLayer for future multi-layer scenes.
export type ParallaxDepth = number;

// Optional transparent-PNG character layer. Absent for current composite scenes; drop one
// in later and the same animation logic drives it — no per-scene code.
export type CharacterConfig = {
  src: string;
  x?: number; // px offset from horizontal centre, default 0
  bottom?: number; // px from frame bottom (anchor), default 0
  width?: number; // rendered width in composition px, default 620
  scale?: number; // extra scale multiplier, default 1
  depth?: ParallaxDepth; // parallax factor, default 0.55
  breathing?: boolean;
  idle?: boolean; // body sway + bob
  intensity?: number; // 0..1 master amplitude, default 0.5
};

export type SceneMotion = {
  fit?: Fit;
  background?: string;
  camera?: CameraConfig;
  atmosphere?: AtmosphereConfig;
  character?: CharacterConfig;
  transitionIn?: number; // fade-in frames, default 12
  transitionOut?: number; // fade-out frames, default 10
};
