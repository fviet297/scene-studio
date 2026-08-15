import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { osc } from "../motion";

// Soft diagonal god-rays that breathe slowly. Screen-blended so it only adds light. One
// gradient stripe layer — no particles, keeps render cheap.
export const LightRays: React.FC<{
  angle?: number;
  color?: string;
  intensity?: number;
}> = ({ angle = 24, color = "rgba(255,225,170,0.5)", intensity = 0.5 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 0.7 + osc(frame, fps, 8) * 0.3;
  const a = Math.max(0, Math.min(1, intensity)) * pulse;
  const shift = osc(frame, fps, 14) * 6;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "screen",
        opacity: a,
        backgroundImage: `repeating-linear-gradient(${angle}deg, transparent 0px, transparent 60px, ${color} 90px, transparent 130px)`,
        backgroundPosition: `${shift}px 0`,
        maskImage:
          "radial-gradient(120% 80% at 60% 0%, black 0%, transparent 70%)",
        WebkitMaskImage:
          "radial-gradient(120% 80% at 60% 0%, black 0%, transparent 70%)",
      }}
    />
  );
};
