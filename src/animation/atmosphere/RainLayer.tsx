import React, { useMemo } from "react";
import {
  AbsoluteFill,
  random,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const SLANT_DEG = 10;
const SLANT_RATIO = Math.tan((SLANT_DEG * Math.PI) / 180);

// Slanted rain streaks. Position is a pure function of the frame (seeded `random`), wrapped so the
// field loops; `intensity` (0..100) sets how many streaks fall.
export const RainLayer: React.FC<{ intensity?: number }> = ({
  intensity = 50,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const count = Math.round(40 + intensity * 1.6);

  const streaks = useMemo(
    () =>
      new Array(count).fill(0).map((_, i) => ({
        x0: random(`rain-x-${i}`),
        y0: random(`rain-y-${i}`),
        length: 26 + random(`rain-l-${i}`) * 38,
        speed: 1100 + random(`rain-s-${i}`) * 700,
        opacity: 0.25 + random(`rain-o-${i}`) * 0.4,
      })),
    [count],
  );

  const span = height + 120;
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {streaks.map((s, i) => {
        const y = (((s.y0 * span + s.speed * t) % span) + span) % span;
        const x = (s.x0 * width - y * SLANT_RATIO + width * 2) % width;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y - 60,
              width: 2,
              height: s.length,
              opacity: s.opacity,
              background:
                "linear-gradient(rgba(214,226,238,0), rgba(214,226,238,0.85))",
              transform: `rotate(${SLANT_DEG}deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
