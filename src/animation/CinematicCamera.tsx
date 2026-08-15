import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { CameraConfig } from "./types";
import { clampPan, lerp, osc, progress } from "./motion";

type Props = {
  camera?: CameraConfig;
  durationInFrames: number;
  // Composite (single-image) scenes must never reveal an edge -> clamp pan to overscan.
  // Layered scenes over a solid background can pan freely.
  clampToOverscan?: boolean;
  children: React.ReactNode;
};

// Slow cinematic push-in / pull-out + pan, with a faint handheld drift so a still image
// reads as a live camera. Deterministic: every value derives from the current frame.
export const CinematicCamera: React.FC<Props> = ({
  camera = {},
  durationInFrames,
  clampToOverscan = true,
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
  const scale = lerp(zoomFrom, zoomTo, t);

  const driftX = osc(frame, fps, 7) * drift * 1.2;
  const driftY = osc(frame, fps, 9, 1.3) * drift * 0.8;
  let x = lerp(xFrom, xTo, t) + driftX;
  let y = lerp(yFrom, yTo, t) + driftY;
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
