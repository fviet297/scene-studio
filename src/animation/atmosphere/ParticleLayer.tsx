import React, { useMemo } from "react";
import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { osc } from "../motion";

export type ParticleKind = "snow" | "dust" | "embers";

type Preset = {
  count: number;
  sizeMin: number;
  sizeMax: number;
  fallMin: number; // px/sec downward (embers negative = rise)
  fallMax: number;
  driftAmp: number; // px horizontal sway
  color: string;
  opacity: number;
  blur: number;
};

const PRESETS: Record<ParticleKind, Preset> = {
  snow: {
    count: 38,
    sizeMin: 3,
    sizeMax: 9,
    fallMin: 40,
    fallMax: 90,
    driftAmp: 26,
    color: "255,255,255",
    opacity: 0.85,
    blur: 0.6,
  },
  dust: {
    count: 30,
    sizeMin: 1.5,
    sizeMax: 4,
    fallMin: 8,
    fallMax: 26,
    driftAmp: 40,
    color: "214,196,150",
    opacity: 0.5,
    blur: 0.4,
  },
  embers: {
    count: 26,
    sizeMin: 2,
    sizeMax: 5,
    fallMin: -70,
    fallMax: -130,
    driftAmp: 30,
    color: "255,170,80",
    opacity: 0.9,
    blur: 0.5,
  },
};

// Deterministic falling/rising particles (snow, dust, embers). Each particle's static
// params come from a seed; only its position is computed per frame, then wrapped so the
// field loops seamlessly. Counts capped for render performance.
export const ParticleLayer: React.FC<{
  kind: ParticleKind;
  count?: number;
  speed?: number;
  color?: string;
}> = ({ kind, count, speed = 1, color }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const p = PRESETS[kind];
  const n = count ?? p.count;
  const tint = color ?? p.color;

  const seeds = useMemo(
    () =>
      new Array(n).fill(0).map((_, i) => {
        const s = `${kind}-${i}`;
        return {
          x0: random(`${s}-x`),
          y0: random(`${s}-y`),
          size: p.sizeMin + random(`${s}-sz`) * (p.sizeMax - p.sizeMin),
          fall: p.fallMin + random(`${s}-f`) * (p.fallMax - p.fallMin),
          driftP: 3 + random(`${s}-dp`) * 5,
          driftPh: random(`${s}-dph`) * Math.PI * 2,
          op: 0.4 + random(`${s}-o`) * 0.6,
        };
      }),
    [n, kind, p.sizeMin, p.sizeMax, p.fallMin, p.fallMax],
  );

  const span = height + 40;
  const t = frame / fps;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: kind === "embers" ? "screen" : "normal",
      }}
    >
      {seeds.map((sd, i) => {
        const travelled = sd.y0 * span + sd.fall * speed * t;
        // wrap into [0, span); rising particles (negative fall) wrap too via modulo
        const y = ((travelled % span) + span) % span;
        const drift = osc(frame, fps, sd.driftP, sd.driftPh) * p.driftAmp;
        const x = sd.x0 * width + drift;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: sd.size,
              height: sd.size,
              borderRadius: "50%",
              background: `rgba(${tint},${p.opacity})`,
              opacity: sd.op,
              filter: p.blur ? `blur(${p.blur}px)` : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
