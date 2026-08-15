import type { SceneMotion } from "./animation/types";

// Per-scene cinematic motion. Scenes are authored here as data — never as animation code
// inside the composition. A sensible default is generated from the scene number, then merged
// with any explicit override below (override wins field-by-field).

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
          zoomFrom: 1.07,
          zoomTo: 1.15,
          xFrom: -14 * dir,
          xTo: 14 * dir,
          yFrom: 6,
          yTo: -6,
        }
      : {
          zoomFrom: 1.15,
          zoomTo: 1.07,
          xFrom: 16 * dir,
          xTo: -16 * dir,
          yFrom: -6,
          yTo: 6,
        },
    atmosphere: { vignette: BASE_VIGNETTE, grain: BASE_GRAIN },
    transitionIn: 12,
    transitionOut: 10,
  };
}

// Mood-tuned overrides. Only the fields that differ from the default are set; they are deep
// merged so e.g. `atmosphere` here adds to (does not wipe) the base vignette/grain.
const OVERRIDES: Record<number, SceneMotion> = {
  // 1 — QT, cold misty winter battlefield, standing hero
  1: {
    camera: {
      zoomFrom: 1.06,
      zoomTo: 1.14,
      xFrom: 0,
      xTo: 0,
      yFrom: 8,
      yTo: -8,
    },
    atmosphere: { fog: { intensity: 0.42 }, snow: { count: 24, speed: 0.7 } },
  },
  // 2 — Han, loess plain, cold morning
  2: { atmosphere: { fog: { intensity: 0.3 }, dust: { count: 22 } } },
  // 3 — QT marching north, dust and cold mist, forward drive
  3: {
    camera: {
      zoomFrom: 1.05,
      zoomTo: 1.16,
      xFrom: -18,
      xTo: 18,
      yFrom: 4,
      yTo: -4,
    },
    atmosphere: { fog: { intensity: 0.35 }, dust: { count: 30 } },
  },
  // 4 — search map, letterboxed on dark; no weather, just filmic grade
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
  // 5 — QT village, overcast, rallying rebels
  5: { atmosphere: { dust: { count: 16, color: "210,205,180" } } },
  // 6 — Han by the river, muted melancholy, slow
  6: {
    camera: {
      zoomFrom: 1.12,
      zoomTo: 1.05,
      xFrom: 12,
      xTo: -12,
      yFrom: -4,
      yTo: 6,
      drift: 0.6,
    },
    atmosphere: {
      fog: { intensity: 0.5, speed: 0.7 },
      vignette: { intensity: 0.55 },
    },
  },
  // 7 — QT night assault, firelight and torches — the punchy one
  7: {
    camera: {
      zoomFrom: 1.08,
      zoomTo: 1.18,
      xFrom: -16,
      xTo: 16,
      yFrom: 8,
      yTo: -8,
      drift: 1.4,
    },
    atmosphere: {
      embers: { count: 28 },
      lightRays: { color: "rgba(255,150,70,0.5)", angle: 32, intensity: 0.4 },
      vignette: { intensity: 0.62 },
      grain: { intensity: 0.07 },
    },
  },
  // 8 — Han Jingxing, tense dawn
  8: {
    atmosphere: {
      fog: { intensity: 0.34 },
      dust: { count: 24 },
      vignette: { intensity: 0.55 },
    },
  },
  // 9 — QT enthroned, warm indoor court
  9: {
    camera: {
      zoomFrom: 1.05,
      zoomTo: 1.12,
      xFrom: 0,
      xTo: 0,
      yFrom: 6,
      yTo: -6,
      drift: 0.5,
    },
    atmosphere: {
      lightRays: { color: "rgba(255,210,150,0.45)", angle: 20, intensity: 0.4 },
      dust: { count: 18, color: "240,220,170" },
    },
  },
  // 10 — Han shadowed corridor, foreboding
  10: {
    camera: {
      zoomFrom: 1.13,
      zoomTo: 1.06,
      xFrom: 14,
      xTo: -14,
      yFrom: -6,
      yTo: 6,
      drift: 0.5,
    },
    atmosphere: {
      fog: { intensity: 0.4, color: "150,160,175", speed: 0.6 },
      vignette: { intensity: 0.68 },
      grain: { intensity: 0.07 },
    },
  },
  // 11 — QT hilltop at dusk, reflective
  11: {
    camera: {
      zoomFrom: 1.12,
      zoomTo: 1.05,
      xFrom: -12,
      xTo: 12,
      yFrom: -6,
      yTo: 8,
      drift: 0.6,
    },
    atmosphere: {
      fog: { intensity: 0.38, speed: 0.7 },
      lightRays: { color: "rgba(255,190,120,0.4)", angle: 18, intensity: 0.35 },
    },
  },
  // 12 — QT victorious, bright clearing sky
  12: {
    camera: {
      zoomFrom: 1.06,
      zoomTo: 1.14,
      xFrom: -12,
      xTo: 12,
      yFrom: 6,
      yTo: -6,
    },
    atmosphere: {
      dust: { count: 18 },
      lightRays: { color: "rgba(255,235,190,0.4)", angle: 22, intensity: 0.3 },
      vignette: { intensity: 0.42 },
    },
  },
  // 13 — Han, bright celebratory
  13: {
    atmosphere: {
      dust: { count: 20 },
      lightRays: { color: "rgba(255,235,190,0.4)", angle: 26, intensity: 0.3 },
      vignette: { intensity: 0.42 },
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

// Public entry: resolved cinematic motion for a scene (default merged with its override).
export function getSceneMotion(sceneNumber: number): SceneMotion {
  return mergeMotion(defaultMotion(sceneNumber), OVERRIDES[sceneNumber]);
}
