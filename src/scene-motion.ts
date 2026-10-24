import type { SceneMotion } from "./animation/types";

// Per-scene cinematic motion. Scenes are authored here as data — never as animation code
// inside the composition. A sensible default is generated from the scene number, then merged
// with any explicit override for that project's scene below (override wins field-by-field).

// Base atmosphere every scene gets: a gentle vignette + faint grain for a filmic ground.
const BASE_VIGNETTE = { intensity: 0.5 };
const BASE_GRAIN = { intensity: 0.05 };

// Alternate push-in / pull-out and pan direction by parity so consecutive scenes never feel
// like the same move. Magnitudes stay small (documentary, not showy).
function defaultMotion(sceneNumber: number): SceneMotion {
  const pushIn = sceneNumber % 2 === 0;
  const dir = sceneNumber % 2 === 0 ? 1 : -1;
  return {
    fit: "cover",
    camera: pushIn
      ? {
          zoomFrom: 1.03,
          zoomTo: 1.09,
          xFrom: -8 * dir,
          xTo: 8 * dir,
          yFrom: 4,
          yTo: -4,
        }
      : {
          zoomFrom: 1.09,
          zoomTo: 1.03,
          xFrom: 10 * dir,
          xTo: -10 * dir,
          yFrom: -4,
          yTo: 4,
        },
    atmosphere: { vignette: BASE_VIGNETTE, grain: BASE_GRAIN },
  };
}

// Mood-tuned overrides, keyed by project slug then scene number: scene numbers repeat across
// projects, so a bare scene-number key would leak one project's look into every other. Only the
// fields that differ from the default are set; they are deep merged so e.g. `atmosphere` here
// adds to (does not wipe) the base vignette/grain.
const OVERRIDES: Record<string, Record<number, SceneMotion>> = {
  "ly-thai-to-vs-ly-the-dan": {
    4: {
      fit: "contain",
      background: "#141414",
      camera: {
        zoomFrom: 1.02,
        zoomTo: 1.08,
        xFrom: 0,
        xTo: 0,
        yFrom: 0,
        yTo: 0,
        drift: 0.4,
      },
      atmosphere: { vignette: { intensity: 0.4 }, grain: { intensity: 0.05 } },
    },
    7: {
      camera: {
        zoomFrom: 1.04,
        zoomTo: 1.1,
        xFrom: -9,
        xTo: 9,
        yFrom: 4,
        yTo: -4,
        drift: 1.4,
      },
      atmosphere: {
        dust: { count: 26 },
        lightRays: {
          color: "rgba(255,205,130,0.42)",
          angle: 32,
          intensity: 0.32,
        },
        vignette: { intensity: 0.52 },
        grain: { intensity: 0.07 },
      },
    },
    13: {
      atmosphere: {
        dust: { count: 20 },
        lightRays: {
          color: "rgba(255,235,190,0.4)",
          angle: 26,
          intensity: 0.3,
        },
        vignette: { intensity: 0.42 },
      },
    },
  },
};

function mergeMotion(base: SceneMotion, over?: SceneMotion): SceneMotion {
  if (!over) return base;
  return {
    ...base,
    ...over,
    camera: { ...base.camera, ...over.camera },
    atmosphere: { ...base.atmosphere, ...over.atmosphere },
    character: over.character ?? base.character,
  };
}

// Public entry: resolved cinematic motion for a project's scene (default merged with its override).
export function getSceneMotion(
  projectSlug: string,
  sceneNumber: number,
): SceneMotion {
  return mergeMotion(
    defaultMotion(sceneNumber),
    OVERRIDES[projectSlug]?.[sceneNumber],
  );
}
