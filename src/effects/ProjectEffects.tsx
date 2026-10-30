import React from "react";
import { AbsoluteFill } from "remotion";
import { FogOverlay } from "../animation/atmosphere/FogOverlay";
import { LightRays } from "../animation/atmosphere/LightRays";
import { ParticleLayer } from "../animation/atmosphere/ParticleLayer";
import { RainLayer } from "../animation/atmosphere/RainLayer";
import { PetalLayer } from "../animation/atmosphere/PetalLayer";
import { BokehLayer } from "../animation/atmosphere/BokehLayer";
import { LightLeakLayer } from "../animation/atmosphere/LightLeakLayer";
import type { ColorGrade, EffectsConfig } from "./types";

// CSS filter per colour grade, applied to everything under the overlays.
export const GRADE_FILTER: Record<ColorGrade, string | undefined> = {
  none: undefined,
  warm: "sepia(0.22) saturate(1.1) hue-rotate(-8deg) contrast(1.04)",
  cool: "saturate(0.9) hue-rotate(12deg) brightness(0.98) contrast(1.05)",
  sepia: "sepia(0.7) contrast(1.05)",
};

// Overlay layers the person switched on, drawn above every scene. Intensity is 0..100 in the panel
// and is mapped to each layer's own knob here.
export const ProjectEffects: React.FC<{ effects: EffectsConfig }> = ({
  effects,
}) => {
  const { layers } = effects;
  const level = (id: keyof typeof layers) => layers[id].intensity;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {layers.fog.enabled && <FogOverlay intensity={level("fog") / 100} />}
      {layers.lightRays.enabled && (
        <LightRays intensity={(level("lightRays") / 100) * 0.7} />
      )}
      {layers.lightLeak.enabled && (
        <LightLeakLayer intensity={level("lightLeak")} />
      )}
      {layers.bokeh.enabled && <BokehLayer intensity={level("bokeh")} />}
      {layers.dust.enabled && (
        <ParticleLayer
          kind="dust"
          count={Math.round(10 + level("dust") * 0.4)}
        />
      )}
      {layers.snow.enabled && (
        <ParticleLayer kind="snow" count={Math.round(level("snow") * 0.76)} />
      )}
      {layers.embers.enabled && (
        <ParticleLayer
          kind="embers"
          count={Math.round(level("embers") * 0.52)}
        />
      )}
      {layers.rain.enabled && <RainLayer intensity={level("rain")} />}
      {layers.petals.enabled && <PetalLayer intensity={level("petals")} />}
    </AbsoluteFill>
  );
};
