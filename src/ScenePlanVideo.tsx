import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  CinematicScene,
  CinematicVideoScene,
  transitionOpacity,
} from "./animation";
import { getSceneMotion } from "./scene-motion";

// One composition per project, each fed a ProjectData bundle built by scripts/build-remotion.mjs
// (src/projects-data/*.json) from that project's projects/<slug>/scene-plan.md + audio. Full-bleed
// scene image (or motion clip) with an auto title and the caption track. One <Audio> per scene.

export const FPS = 30;
const COLORS = {
  paper: "#f2eadb",
  ink: "#191716",
  red: "#a82f26",
};

export type Scene = {
  scene: number;
  narration: string;
  title?: string;
  cue?: string;
  host?: string;
  // Stamped by the builder when a review-panel-generated motion clip exists for this scene
  // (public/projects/<slug>/scene-videos/scene-NN.mp4) — plays in place of the image.
  motionVideo?: boolean;
  // Stamped by the builder: whether public/projects/<slug>/audio/scene-NN.mp3 exists. A missing
  // file must NOT be handed to <Audio>, which errors when the source is absent.
  hasAudio?: boolean;
  image: {
    kind: "ai" | "search";
    characters: string[];
    prompt?: string;
    query?: string;
  };
};

export type ProjectData = {
  slug: string;
  title: string;
  // Composition size + aspect, stamped by the builder from the plan's `aspect:` (default 9:16).
  aspect?: string;
  width?: number;
  height?: number;
  publicPrefix: string;
  fps: number;
  durationInFrames: number;
  scenes: Scene[];
  sceneDurations: number[];
  // Per-scene playback rate for a motion clip that is shorter than the scene: clip/scene (≤ 1) so
  // the clip stretches to fill the whole scene instead of leaving a frozen tail. 1 = play as-is.
  motionPlaybackRates?: number[];
  uploadedScenes: number[];
};

const PLACEHOLDER_SCENE_SECONDS = 4;

// Cumulative per-scene frame counts + starts from measured audio durations. Keyed off scenes so a
// missing/short duration falls back to a placeholder instead of feeding NaN into interpolate().
function sceneTimeline(scenes: Scene[], sceneDurations: number[]) {
  const frames = scenes.map((_, i) => {
    const seconds = sceneDurations[i];
    return Math.round(
      (Number.isFinite(seconds) ? seconds : PLACEHOLDER_SCENE_SECONDS) * FPS,
    );
  });
  const starts = frames.reduce<number[]>(
    (acc, f) => [...acc, acc[acc.length - 1] + f],
    [0],
  );
  return { frames, starts };
}

export function SceneView({
  scene,
  durationInFrames,
  publicPrefix,
  uploadedScenes = [],
  motionPlaybackRate = 1,
}: {
  scene: Scene;
  durationInFrames: number;
  publicPrefix: string;
  uploadedScenes?: number[];
  motionPlaybackRate?: number;
}) {
  const local = useCurrentFrame();
  const motion = getSceneMotion(scene.scene);
  // Fade the whole scene (image + overlays together) for a clean cross-dissolve; the
  // CinematicScene's own transition is disabled here to avoid double-fading the image.
  const opacity = transitionOpacity(
    local,
    durationInFrames,
    motion.transitionIn ?? 12,
    motion.transitionOut ?? 10,
  );
  const sceneNo = String(scene.scene).padStart(2, "0");
  const src = `${publicPrefix}/images/scene-${sceneNo}.jpg`;
  const videoSrc = `${publicPrefix}/scene-videos/scene-${sceneNo}.mp4`;
  // A user-uploaded photo (per the asset manifest) must NOT show the "AI phục dựng" tag.
  const showsAiTag =
    scene.image.kind === "ai" && !new Set(uploadedScenes).has(scene.scene);
  return (
    <AbsoluteFill
      style={{ opacity, background: motion.background ?? COLORS.ink }}
    >
      {scene.motionVideo ? (
        <CinematicVideoScene
          src={videoSrc}
          playbackRate={motionPlaybackRate}
          motion={{ ...motion, transitionIn: 0, transitionOut: 0 }}
        />
      ) : (
        <CinematicScene
          src={src}
          durationInFrames={durationInFrames}
          motion={{ ...motion, transitionIn: 0, transitionOut: 0 }}
        />
      )}

      {/* top scrim + title. Insets and the top offset clear TikTok/Reels/Shorts' own
          chrome: a back button + search icon sit roughly in the top ~150px, and their share
          button rail runs down the right edge, so text stays out of both. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 340,
          background: "linear-gradient(rgba(0,0,0,.74), transparent)",
        }}
      />
      {scene.title && (
        <div
          style={{
            position: "absolute",
            top: 260,
            left: 110,
            right: 110,
            textAlign: "center",
            fontFamily: "Arial, sans-serif",
            fontWeight: 1000,
            fontSize: 52,
            lineHeight: 1.1,
            color: "white",
            textShadow: "0 2px 8px rgba(0,0,0,.6)",
          }}
        >
          {scene.title}
        </div>
      )}
      {/* AI reconstruction tag — kept clear of the top-left back button */}
      {showsAiTag && (
        <div
          style={{
            position: "absolute",
            top: 200,
            left: 14,
            padding: "4px 9px",
            background: "rgba(25,23,22,.82)",
            color: COLORS.paper,
            fontFamily: "Arial, sans-serif",
            fontWeight: 800,
            fontSize: 15,
            borderRadius: 6,
          }}
        >
          AI PHỤC DỰNG
        </div>
      )}

      {/* bottom scrim */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 460,
          background: "linear-gradient(transparent, rgba(0,0,0,.82))",
        }}
      />
    </AbsoluteFill>
  );
}

export const ScenePlanVideo: React.FC<{ project: ProjectData }> = ({
  project,
}) => {
  const { frames, starts } = sceneTimeline(
    project.scenes,
    project.sceneDurations,
  );
  return (
    <AbsoluteFill style={{ background: COLORS.ink }}>
      {project.scenes.map((scene, i) => (
        <Sequence
          key={scene.scene}
          from={starts[i]}
          durationInFrames={frames[i]}
        >
          <SceneView
            scene={scene}
            durationInFrames={frames[i]}
            publicPrefix={project.publicPrefix}
            uploadedScenes={project.uploadedScenes}
            motionPlaybackRate={project.motionPlaybackRates?.[i] ?? 1}
          />
          {scene.hasAudio && (
            <Audio
              src={staticFile(
                `${project.publicPrefix}/audio/scene-${String(scene.scene).padStart(2, "0")}.mp3`,
              )}
            />
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
