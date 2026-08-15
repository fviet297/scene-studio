import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CharacterConfig } from "./types";
import { osc } from "./motion";

// Brings a static transparent-PNG character to life with subtle, natural micro-motion:
// breathing (tiny vertical scale from the feet), an idle body sway and a slow bob. It never
// redraws or deforms the art — only whole-image transforms, anchored at the feet.
//
// Blinking / head-turn / hand gestures need the eyes / head / arm on their own PNG layers;
// pass those as future sub-layers. With a single flat PNG we keep to body-level motion.
export const AnimatedCharacter: React.FC<{ config: CharacterConfig }> = ({
  config,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const {
    src,
    x = 0,
    bottom = 0,
    width: charWidth = 620,
    scale = 1,
    breathing = true,
    idle = true,
    intensity = 0.5,
  } = config;

  const k = Math.max(0, Math.min(1, intensity));
  // Breathing: chest lifts slightly — anchor at feet so shoes stay planted.
  const breatheY = breathing ? 1 + osc(frame, fps, 4) * 0.012 * k : 1;
  const breatheX = breathing ? 1 - osc(frame, fps, 4) * 0.004 * k : 1;
  // Idle: slow sway + a gentle vertical bob, offset phases so it never looks mechanical.
  const swayDeg = idle ? osc(frame, fps, 9, 0.4) * 0.5 * k : 0;
  const bobPx = idle ? osc(frame, fps, 6, 1.1) * 3 * k : 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom,
        left: "50%",
        width: charWidth,
        transform: `translateX(-50%) translateX(${x}px) translateY(${bobPx}px) rotate(${swayDeg}deg) scale(${scale}) scale(${breatheX}, ${breatheY})`,
        transformOrigin: "50% 100%",
        willChange: "transform",
      }}
    >
      <Img
        src={src.startsWith("http") ? src : staticFile(src)}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
};
