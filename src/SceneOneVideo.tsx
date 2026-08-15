import React from "react";
import { AbsoluteFill, Audio, staticFile } from "remotion";
import scenePlan from "./scene-plan.json";
import { SceneView, FPS, type Scene } from "./ScenePlanVideo";

// Single-scene preview composition: one scene's cinematic image + overlay (title/cue/AI tag)
// plus its own narration audio, at local time 0. Duration comes from props (the review server
// measures the scene's audio and passes it), so this renders independently of the full
// timeline — no need for audio-durations.ts to be up to date. Captions are a whole-video
// concern and are intentionally omitted from the per-scene preview.

export const SCENE_ONE_FPS = FPS;

export type SceneOneProps = { scene: number; durationInFrames: number };

const scenes = scenePlan.scenes as unknown as Scene[];

export const SceneOneVideo: React.FC<SceneOneProps> = ({
  scene,
  durationInFrames,
}) => {
  const s = scenes.find((x) => x.scene === scene);
  if (!s) return <AbsoluteFill style={{ background: "#191716" }} />;
  const audio = `audio/scene-${String(scene).padStart(2, "0")}.mp3`;
  return (
    <AbsoluteFill style={{ background: "#191716" }}>
      <SceneView scene={s} durationInFrames={durationInFrames} />
      <Audio src={staticFile(audio)} />
    </AbsoluteFill>
  );
};
