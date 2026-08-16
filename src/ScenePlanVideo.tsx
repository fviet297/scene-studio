import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { captionGroups } from "./caption-data";
import { sceneDurations } from "./audio-durations";
import scenePlan from "./scene-plan.json";
import assetManifest from "../public/images/asset-manifest.json";
import { CinematicScene, transitionOpacity } from "./animation";
import { getSceneMotion } from "./scene-motion";
import { HistoryHost } from "./characters/HistoryHost";
import type { AnimationName } from "./characters/HistoryHost";

// Single-image-per-scene composition driven entirely by src/scene-plan.json (see the
// history-video skill: scene-plan.md + layout.md). Full-bleed scene image with an
// auto title/cue and the caption track. One <Audio> per scene.

export const FPS = 30;
const COLORS = {
  paper: "#f2eadb",
  ink: "#191716",
  red: "#a82f26",
  gold: "#bb8a31",
  jade: "#526f5c",
};

export type Scene = {
  scene: number;
  narration: string;
  title?: string;
  cue?: string;
  host?: string;
  image: {
    kind: "ai" | "search";
    characters: string[];
    prompt?: string;
    query?: string;
  };
};

const scenes = scenePlan.scenes as unknown as Scene[];

// Scenes whose image is a user-uploaded photo (per the asset manifest) must NOT show the
// "AI phục dựng" tag. Everything else generated as AI keeps it.
const uploadedScenes = new Set(
  (assetManifest as { scene: number; authenticity: string }[])
    .filter((m) => m.authenticity === "USER_UPLOAD")
    .map((m) => m.scene),
);
const showsAiTag = (scene: Scene) =>
  scene.image.kind === "ai" && !uploadedScenes.has(scene.scene);
const hostAnimation = (host?: string): AnimationName => {
  if (host === "point-left" || host === "point-right" || host === "happy") {
    return host;
  }
  return "explain";
};
const hostLeft = (host?: string) => {
  if (host === "point-left") return 28;
  if (host === "point-right") return 752;
  return 390;
};
const sceneFrames = sceneDurations.map((s) => Math.round(s * FPS));
const sceneStarts = sceneFrames.reduce<number[]>(
  (acc, f) => [...acc, acc[acc.length - 1] + f],
  [0],
);
export const totalDurationInFrames = sceneStarts[sceneStarts.length - 1];

function CaptionTrack() {
  const { fps } = useVideoConfig();
  const seconds = useCurrentFrame() / fps;
  const group = captionGroups.find(
    (w) => seconds >= w[0].start && seconds < w[w.length - 1].end,
  );
  if (!group) return null;
  const visible = group.filter((w) => seconds >= w.start);
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        right: 48,
        // Low in the frame (where the mascot host used to sit) but still above TikTok/Reels
        // bottom chrome (username + caption occupy y >= ~1500). Box bottom ~1470.
        bottom: 450,
        padding: "18px 24px",
        background: COLORS.paper,
        border: `4px solid ${COLORS.ink}`,
        borderRadius: 16,
        boxShadow: `7px 7px 0 ${COLORS.ink}`,
        fontFamily: "Arial, sans-serif",
        fontSize: 40,
        lineHeight: 1.12,
        fontWeight: 800,
        color: COLORS.ink,
        textAlign: "center",
      }}
    >
      {visible.map((w) => w.text).join(" ")}
      <span style={{ color: COLORS.red }}>▌</span>
    </div>
  );
}

export function SceneView({
  scene,
  durationInFrames,
}: {
  scene: Scene;
  durationInFrames: number;
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
  const src = `images/scene-${String(scene.scene).padStart(2, "0")}.jpg`;
  return (
    <AbsoluteFill
      style={{ opacity, background: motion.background ?? COLORS.ink }}
    >
      <CinematicScene
        src={src}
        durationInFrames={durationInFrames}
        motion={{ ...motion, transitionIn: 0, transitionOut: 0 }}
      />

      {/* top scrim + title/cue */}
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
            top: 60,
            left: 48,
            right: 48,
            textAlign: "center",
            fontFamily: "Arial, sans-serif",
            fontWeight: 1000,
            fontSize: 62,
            lineHeight: 1.04,
            color: "white",
            textShadow: "0 2px 8px rgba(0,0,0,.6)",
          }}
        >
          {scene.title}
        </div>
      )}
      {scene.cue && (
        <div
          style={{
            position: "absolute",
            top: 190,
            left: 60,
            right: 60,
            textAlign: "center",
            fontFamily: "Arial, sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: COLORS.gold,
            textShadow: "0 2px 6px rgba(0,0,0,.7)",
          }}
        >
          {scene.cue}
        </div>
      )}

      {/* AI reconstruction tag */}
      {showsAiTag(scene) && (
        <div
          style={{
            position: "absolute",
            top: 14,
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

      <HistoryHost
        animation={hostAnimation(scene.host)}
        expression={scene.host === "happy" ? "happy" : "confident"}
        width={300}
        style={{
          position: "absolute",
          left: hostLeft(scene.host),
          top: 1510,
        }}
      />
    </AbsoluteFill>
  );
}

export const ScenePlanVideo: React.FC = () => (
  <AbsoluteFill style={{ background: COLORS.ink }}>
    {scenes.map((scene, i) => (
      <Sequence
        key={scene.scene}
        from={sceneStarts[i]}
        durationInFrames={sceneFrames[i]}
      >
        <SceneView scene={scene} durationInFrames={sceneFrames[i]} />
        <Audio
          src={staticFile(
            `audio/scene-${String(scene.scene).padStart(2, "0")}.mp3`,
          )}
        />
      </Sequence>
    ))}
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 14,
        background: COLORS.jade,
      }}
    />
    <CaptionTrack />
  </AbsoluteFill>
);
