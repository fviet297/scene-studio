import React from "react";
import type { AtmosphereConfig, ToggleOr } from "../types";
import { FogOverlay } from "./FogOverlay";
import { LightRays } from "./LightRays";
import { ParticleLayer } from "./ParticleLayer";
import { Vignette } from "./Vignette";
import { FilmGrain } from "./FilmGrain";

// Resolve a boolean-or-object toggle into its options object, or null when disabled.
function opt<T extends object>(v: ToggleOr<T> | undefined): T | null {
  if (!v) return null;
  return v === true ? ({} as T) : v;
}

// Renders the atmosphere stack for a scene in a fixed, tasteful z-order:
// fog/light (depth) -> particles -> vignette -> grain (topmost). Each element is optional
// and driven purely by config, so scenes stay declarative.
export const Atmosphere: React.FC<{ config?: AtmosphereConfig }> = ({
  config,
}) => {
  if (!config) return null;
  const fog = opt(config.fog);
  const rays = opt(config.lightRays);
  const dust = opt(config.dust);
  const snow = opt(config.snow);
  const embers = opt(config.embers);
  const vignette = opt(config.vignette);
  const grain = opt(config.grain);

  return (
    <>
      {fog && (
        <FogOverlay
          intensity={fog.intensity}
          color={fog.color}
          speed={fog.speed}
        />
      )}
      {rays && (
        <LightRays
          angle={rays.angle}
          color={rays.color}
          intensity={rays.intensity}
        />
      )}
      {dust && (
        <ParticleLayer kind="dust" count={dust.count} color={dust.color} />
      )}
      {snow && (
        <ParticleLayer kind="snow" count={snow.count} speed={snow.speed} />
      )}
      {embers && <ParticleLayer kind="embers" count={embers.count} />}
      {vignette && <Vignette intensity={vignette.intensity} />}
      {grain && <FilmGrain intensity={grain.intensity} />}
    </>
  );
};
