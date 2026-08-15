import React from "react";
import { AbsoluteFill } from "remotion";

// Static darkened edges that pull the eye to centre. Cheap (one gradient), no per-frame work.
export const Vignette: React.FC<{ intensity?: number }> = ({
  intensity = 0.55,
}) => {
  const a = Math.max(0, Math.min(1, intensity));
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `radial-gradient(120% 90% at 50% 42%, transparent 45%, rgba(0,0,0,${a * 0.55}) 88%, rgba(0,0,0,${a}) 100%)`,
      }}
    />
  );
};
