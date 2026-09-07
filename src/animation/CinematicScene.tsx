import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import type { SceneMotion } from "./types";
import { CinematicCamera } from "./CinematicCamera";
import { ParallaxLayer } from "./ParallaxLayer";
import { AnimatedCharacter } from "./AnimatedCharacter";
import { Atmosphere } from "./atmosphere/Atmosphere";
import { transitionOpacity } from "./motion";

const GRADE = "saturate(0.92) contrast(1.04) brightness(1.0)";

type Props = {
  src: string; // path relative to public/, or absolute URL
  durationInFrames: number;
  motion?: SceneMotion;
  background?: string;
};

// Turns one static scene image into a cinematic animated scene: camera move (+ optional
// 2.5D parallax when a character layer is supplied) plus a configurable atmosphere stack.
// Everything is deterministic and driven by `motion` config — no per-scene animation code.
export const CinematicScene: React.FC<Props> = ({
  src,
  durationInFrames,
  motion = {},
  background,
}) => {
  const frame = useCurrentFrame();
  const {
    fit = "cover",
    camera,
    atmosphere,
    character,
    transitionIn = 12,
    transitionOut = 10,
    background: motionBg,
  } = motion;

  const opacity = transitionOpacity(
    frame,
    durationInFrames,
    transitionIn,
    transitionOut,
  );
  const url = src.startsWith("http") ? src : staticFile(src);
  const cover = fit === "cover";

  const image = (
    <Img
      src={url}
      style={{
        width: "100%",
        height: "100%",
        objectFit: fit,
        filter: GRADE,
        translate: "39.3px -28.9px",
      }}
    />
  );

  return (
    <AbsoluteFill
      style={{ opacity, background: background ?? motionBg ?? "#191716" }}
    >
      {character ? (
        // 2.5D path: background image and character travel at different parallax depths.
        <>
          <ParallaxLayer
            camera={camera}
            durationInFrames={durationInFrames}
            depth={0.18}
          >
            {image}
          </ParallaxLayer>
          <ParallaxLayer
            camera={camera}
            durationInFrames={durationInFrames}
            depth={character.depth ?? 0.55}
          >
            <AnimatedCharacter config={character} />
          </ParallaxLayer>
        </>
      ) : (
        // Composite (single-image) path: one Ken Burns move, pan clamped to overscan.
        <CinematicCamera
          camera={camera}
          durationInFrames={durationInFrames}
          clampToOverscan={cover}
        >
          {image}
        </CinematicCamera>
      )}
      <Atmosphere config={atmosphere} />
    </AbsoluteFill>
  );
};
