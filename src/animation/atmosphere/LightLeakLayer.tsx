import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { osc } from "../motion";

// Warm film light leak: two amber/rose glows sweeping in from the frame edges and fading in and out.
// CSS gradients only (no WebGL), so it renders the same in the player, Studio and the MP4.
export const LightLeakLayer: React.FC<{ intensity?: number }> = ({
  intensity = 50,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const level = intensity / 100;
  const pulse = 0.55 + osc(frame, fps, 7) * 0.45;
  const sweep = osc(frame, fps, 11) * 14;
  const sweepB = osc(frame, fps, 9, 2) * 12;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "screen",
        opacity: level * pulse,
        backgroundImage: [
          `radial-gradient(60% 70% at ${8 + sweep}% 12%, rgba(255,150,70,0.85), rgba(255,110,60,0) 70%)`,
          `radial-gradient(55% 65% at ${92 + sweepB}% 88%, rgba(255,120,150,0.7), rgba(255,90,120,0) 70%)`,
        ].join(","),
      }}
    />
  );
};
