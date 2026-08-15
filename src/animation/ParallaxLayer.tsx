import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { CameraConfig, ParallaxDepth } from "./types";
import { clampPan, lerp, osc, progress } from "./motion";

type Props = {
  camera?: CameraConfig;
  durationInFrames: number;
  // 0 = far background (barely moves), 1 = foreground (moves fully with the camera).
  depth: ParallaxDepth;
  clampToOverscan?: boolean;
  children: React.ReactNode;
};

// One depth plane for multi-layer (2.5D) scenes. Each layer receives the same camera
// config but scales its motion by `depth`, so nearer planes travel faster than far ones,
// creating parallax. Dormant for current composite scenes; drives future layered scenes.
export const ParallaxLayer: React.FC<Props> = ({
  camera = {},
  durationInFrames,
  depth,
  clampToOverscan = false,
  children,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const {
    zoomFrom = 1.08,
    zoomTo = 1.16,
    xFrom = 0,
    xTo = 0,
    yFrom = 0,
    yTo = 0,
    origin = "50% 50%",
    drift = 1,
  } = camera;

  const t = progress(frame, durationInFrames);
  // Nearer planes zoom slightly more; far planes stay almost flat.
  const zoom = lerp(zoomFrom, zoomTo, t);
  const scale = lerp(1, zoom, 0.25 + depth * 0.75);

  const panX = lerp(xFrom, xTo, t);
  const panY = lerp(yFrom, yTo, t);
  const driftX = osc(frame, fps, 7) * drift * 1.2;
  const driftY = osc(frame, fps, 9, 1.3) * drift * 0.8;

  let x = (panX + driftX) * depth;
  let y = (panY + driftY) * depth;
  if (clampToOverscan) {
    x = clampPan(scale, x, width);
    y = clampPan(scale, y, height);
  }

  return (
    <AbsoluteFill
      style={{
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        transformOrigin: origin,
        willChange: "transform",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
