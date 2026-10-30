import React, { useMemo } from "react";
import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { osc } from "../motion";

// Slowly falling blossom petals that sway and tumble. Deterministic per frame; `intensity`
// (0..100) sets how many petals are in the air.
export const PetalLayer: React.FC<{ intensity?: number }> = ({
  intensity = 50,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const count = Math.round(8 + intensity * 0.32);

  const petals = useMemo(
    () =>
      new Array(count).fill(0).map((_, i) => ({
        x0: random(`petal-x-${i}`),
        y0: random(`petal-y-${i}`),
        size: 14 + random(`petal-sz-${i}`) * 16,
        fall: 55 + random(`petal-f-${i}`) * 55,
        swayPeriod: 4 + random(`petal-sp-${i}`) * 4,
        swayPhase: random(`petal-ph-${i}`) * Math.PI * 2,
        spin: (random(`petal-r-${i}`) - 0.5) * 140,
        opacity: 0.6 + random(`petal-o-${i}`) * 0.35,
        tint: random(`petal-c-${i}`) > 0.5 ? "255,205,215" : "255,232,236",
      })),
    [count],
  );

  const span = height + 80;
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {petals.map((p, i) => {
        const y = (((p.y0 * span + p.fall * t) % span) + span) % span;
        const x =
          p.x0 * width + osc(frame, fps, p.swayPeriod, p.swayPhase) * 60;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y - 40,
              width: p.size,
              height: p.size * 0.68,
              opacity: p.opacity,
              borderRadius: "80% 10% 80% 10%",
              background: `linear-gradient(135deg, rgba(${p.tint},0.95), rgba(255,170,190,0.8))`,
              transform: `rotate(${p.spin * t}deg) rotateX(${osc(frame, fps, p.swayPeriod * 0.7, p.swayPhase) * 55}deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
