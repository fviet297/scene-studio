import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

// Inline SVG turbulence grain. Reseeding feTurbulence per frame makes it shimmer like film
// grain. Rendered as an SVG element (not a background-image) so there is nothing to load —
// it draws synchronously and stays deterministic, which Remotion requires.
export const FilmGrain: React.FC<{ intensity?: number }> = ({
  intensity = 0.06,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        opacity: Math.max(0, Math.min(0.2, intensity)),
        mixBlendMode: "overlay",
      }}
    >
      <svg width="100%" height="100%" preserveAspectRatio="none">
        <filter id={`grain-${frame % 8}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves={2}
            seed={frame % 97}
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${frame % 8})`} />
      </svg>
    </AbsoluteFill>
  );
};
