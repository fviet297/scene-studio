// Project-wide video effects, stamped from projects/<slug>/branding.json (scripts/lib/branding.mjs
// is the source of truth for the allowed values and ranges).

export type EffectLayerId =
  | "fog"
  | "lightRays"
  | "dust"
  | "snow"
  | "embers"
  | "rain"
  | "petals"
  | "bokeh"
  | "lightLeak";

export type EffectLayerConfig = { enabled: boolean; intensity: number }; // intensity 10..100

export type TransitionType =
  | "crossfade"
  | "wipe"
  | "slide"
  | "zoom"
  | "iris"
  | "flash"
  | "none";

export type ColorGrade = "none" | "warm" | "cool" | "sepia";

export interface EffectsConfig {
  // The per-scene filmic base (src/scene-motion.ts); false removes it from every scene.
  vignette: boolean;
  grain: boolean;
  grade: ColorGrade;
  transition: { type: TransitionType; frames: number };
  layers: Record<EffectLayerId, EffectLayerConfig>;
}

// Mirrors DEFAULT_BRANDING.effects; bundles built before the setting existed fall back to these.
export const DEFAULT_EFFECTS: EffectsConfig = {
  vignette: true,
  grain: true,
  grade: "none",
  transition: { type: "crossfade", frames: 8 },
  layers: {
    fog: { enabled: false, intensity: 50 },
    lightRays: { enabled: false, intensity: 50 },
    dust: { enabled: false, intensity: 50 },
    snow: { enabled: false, intensity: 50 },
    embers: { enabled: false, intensity: 50 },
    rain: { enabled: false, intensity: 50 },
    petals: { enabled: false, intensity: 50 },
    bokeh: { enabled: false, intensity: 50 },
    lightLeak: { enabled: false, intensity: 50 },
  },
};

export function resolveEffects(
  partial?: Partial<EffectsConfig>,
): EffectsConfig {
  return {
    ...DEFAULT_EFFECTS,
    ...partial,
    transition: { ...DEFAULT_EFFECTS.transition, ...partial?.transition },
    layers: { ...DEFAULT_EFFECTS.layers, ...partial?.layers },
  };
}
