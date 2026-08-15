import React, { useMemo } from "react";
import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { osc } from "../motion";

// A few large, soft radial blobs drifting horizontally at different speeds — reads as slow
// rolling fog / haze. Deterministic via remotion `random`. Blur is baked into the gradient
// (no CSS filter) so it stays cheap to render.
export const FogOverlay: React.FC<{
  intensity?: number;
  color?: string;
  speed?: number;
}> = ({ intensity = 0.5, color = "200, 208, 216", speed = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = Math.max(0, Math.min(1, intensity));

  const blobs = useMemo(
    () =>
      new Array(4).fill(0).map((_, i) => ({
        y: random(`fog-y-${i}`) * 80 + 10, // % vertical
        size: random(`fog-s-${i}`) * 40 + 55, // % of width
        period: 26 + random(`fog-p-${i}`) * 22, // seconds per drift cycle
        phase: random(`fog-ph-${i}`) * Math.PI * 2,
        base: random(`fog-b-${i}`) * 60 - 30, // % horizontal centre
        op: 0.35 + random(`fog-o-${i}`) * 0.4,
      })),
    [],
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {blobs.map((b, i) => {
        const drift = osc(frame, fps, b.period / speed, b.phase) * 22;
        const bob = osc(frame, fps, b.period / speed + 5, b.phase) * 4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${b.base + drift}%`,
              top: `${b.y + bob}%`,
              width: `${b.size}%`,
              height: `${b.size * 0.7}%`,
              transform: "translate(-50%, -50%)",
              opacity: b.op * a,
              background: `radial-gradient(ellipse at center, rgba(${color},0.9) 0%, rgba(${color},0.35) 40%, transparent 70%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
