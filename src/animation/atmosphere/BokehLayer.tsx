import React, { useMemo } from "react";
import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { osc } from "../motion";

// Large soft out-of-focus light discs drifting and breathing. Screen-blended so it only adds light.
export const BokehLayer: React.FC<{ intensity?: number }> = ({
  intensity = 50,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const count = Math.round(6 + intensity * 0.14);

  const discs = useMemo(
    () =>
      new Array(count).fill(0).map((_, i) => ({
        x: random(`bokeh-x-${i}`),
        y: random(`bokeh-y-${i}`),
        size: 0.06 + random(`bokeh-s-${i}`) * 0.1,
        period: 9 + random(`bokeh-p-${i}`) * 9,
        phase: random(`bokeh-ph-${i}`) * Math.PI * 2,
        warm: random(`bokeh-w-${i}`) > 0.35,
      })),
    [count],
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {discs.map((d, i) => {
        const size = d.size * width;
        const dx = osc(frame, fps, d.period, d.phase) * 36;
        const dy = osc(frame, fps, d.period * 1.3, d.phase + 1) * 24;
        const glow = 0.35 + osc(frame, fps, d.period * 0.8, d.phase) * 0.2;
        const rgb = d.warm ? "255,214,150" : "190,220,255";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: d.x * width + dx - size / 2,
              top: d.y * height + dy - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              opacity: glow * (0.4 + intensity / 100),
              background: `radial-gradient(circle, rgba(${rgb},0.55) 0%, rgba(${rgb},0.25) 55%, rgba(${rgb},0) 72%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
