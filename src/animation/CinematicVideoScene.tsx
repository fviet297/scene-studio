import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { SceneMotion } from "./types";
import { Atmosphere } from "./atmosphere/Atmosphere";

const GRADE = "saturate(0.92) contrast(1.04) brightness(1.0)";

type Props = {
  src: string; // path relative to public/, or absolute URL
  motion?: SceneMotion;
  background?: string;
  // < 1 slows the clip so a clip shorter than the scene stretches to fill it (no frozen tail).
  playbackRate?: number;
  // Seconds of the clip to skip: models start a clip soft and jittery (scripts/lib/motion-tail.mjs).
  startFromSeconds?: number;
};

// Plays an AI-generated motion clip full-bleed in place of CinematicScene's synthetic Ken
// Burns move — used for scenes where a review-panel motion video exists (see parse-scene-plan.mjs's
// scene.motionVideo flag). Keeps the same grade filter and atmosphere overlay as CinematicScene
// so a video scene cuts against an image scene without a visible style seam. Muted: the scene's
// narration is a separate <Audio> track at the Sequence level.
export const CinematicVideoScene: React.FC<Props> = ({
  src,
  motion = {},
  background,
  playbackRate = 1,
  startFromSeconds = 0,
}) => {
  const { fps } = useVideoConfig();
  const { fit = "cover", atmosphere, background: motionBg } = motion;
  const url = src.startsWith("http") ? src : staticFile(src);

  return (
    <AbsoluteFill style={{ background: background ?? motionBg ?? "#191716" }}>
      <OffthreadVideo
        src={url}
        muted
        playbackRate={playbackRate}
        startFrom={Math.round(startFromSeconds * fps)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit,
          filter: GRADE,
        }}
      />
      <Atmosphere config={atmosphere} />
    </AbsoluteFill>
  );
};
