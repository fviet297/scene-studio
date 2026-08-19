import {
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { getCharacter } from "./characterRegistry";
import type {
  HistoricalCharacterAnimation,
  HistoricalCharacterProps,
} from "./HistoricalCharacter.types";

interface MotionState {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  opacity: number;
}

const STILL: MotionState = { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 };

export function HistoricalCharacter({
  character,
  animation = "idle",
  referenceVersion = "current",
  width = 640,
  height,
  style,
  className,
}: HistoricalCharacterProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const definition = getCharacter(character);
  const motion = resolveMotion(animation, frame, fps, durationInFrames);

  return (
    <Img
      alt={definition.name}
      className={className}
      src={staticFile(
        referenceVersion === "v2" ? definition.imageV2 : definition.image,
      )}
      width={width}
      height={height ?? width}
      style={{
        display: "block",
        objectFit: "contain",
        transform: `translate3d(${motion.x}px, ${motion.y}px, 0) rotate(${motion.rotate}deg) scale(${motion.scale})`,
        transformOrigin: "50% 82%",
        opacity: motion.opacity,
        ...style,
      }}
    />
  );
}

function resolveMotion(
  animation: HistoricalCharacterAnimation,
  frame: number,
  fps: number,
  durationInFrames: number,
): MotionState {
  if (animation === "still") return STILL;
  if (animation === "idle") return idleMotion(frame, fps);
  if (animation === "emphasis") return emphasisMotion(frame, fps);

  const isExit = animation.startsWith("exit");
  const direction = animation.endsWith("left") ? -1 : 1;
  const progress = spring({
    frame: isExit
      ? Math.max(0, frame - Math.max(0, durationInFrames - fps * 0.6))
      : frame,
    fps,
    config: { damping: 18, stiffness: 120, mass: 0.8 },
  });
  const visibleProgress = isExit ? 1 - progress : progress;

  return {
    x: direction * interpolate(visibleProgress, [0, 1], [180, 0]),
    y: interpolate(visibleProgress, [0, 1], [30, 0]),
    rotate: direction * interpolate(visibleProgress, [0, 1], [4, 0]),
    scale: interpolate(visibleProgress, [0, 1], [0.96, 1]),
    opacity: visibleProgress,
  };
}

function idleMotion(frame: number, fps: number): MotionState {
  const phase = (frame / fps) * Math.PI * 2;
  return {
    ...STILL,
    y: Math.sin(phase * 0.55) * 4,
    rotate: Math.sin(phase * 0.35) * 0.6,
    scale: 1 + Math.sin(phase * 0.55) * 0.004,
  };
}

function emphasisMotion(frame: number, fps: number): MotionState {
  const progress = spring({
    frame,
    fps,
    config: { damping: 9, stiffness: 180, mass: 0.55 },
    durationInFrames: Math.round(fps * 0.7),
  });
  const pulse = Math.sin(progress * Math.PI);
  return {
    ...STILL,
    y: -10 * pulse,
    rotate: -1.5 * pulse,
    scale: 1 + 0.035 * pulse,
  };
}
