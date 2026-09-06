import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
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

// --- Overlay sizing -------------------------------------------------------------------------
// Both aspects are delivered on the same 1080x1920 canvas the platform encodes. A 9:16 master
// fills it 1:1. A 16:9 master is centre-cropped to 3:2 and scaled into a 1080x720 band by
// scripts/wrap-vertical.mjs, so an overlay pixel drawn on that master lands at 0.667x on the
// phone. Multiplying every horizontal and typographic value by `unit` cancels that out, so the
// title reads at the same apparent size in both aspects.
const DELIVERY_WIDTH = 1080;
const VERTICAL_BAND_RATIO = 3 / 2; // keep in sync with BAND_RATIO in scripts/wrap-vertical.mjs

// Scrim and vertical placement as fractions of composition height.
//
// `vertical` holds the original hand-tuned 1080x1920 numbers exactly. There the scrims are
// load-bearing: TikTok/Reels/Shorts draw a back button and search icon over the top of the
// picture and a share rail down its right edge, so the gradients buy contrast under their
// chrome as well as under the title.
//
// `wide` exists because that rationale disappears once a 16:9 master is wrapped: the picture
// only occupies y=600..1320 of the delivered canvas and the chrome sits over the plain black
// bars, never over artwork. So the top scrim shrinks to a backing for the title, and the bottom
// scrim goes to zero — SceneView renders nothing down there, and every darkened row costs
// artwork the 15.6% width crop has already paid for.
const OVERLAY_PROFILES = {
  vertical: {
    topScrim: 340 / 1920,
    titleTop: 260 / 1920,
    tagTop: 200 / 1920,
    bottomScrim: 460 / 1920,
  },
  wide: {
    topScrim: 162 / 1080,
    titleTop: 97 / 1080,
    tagTop: 49 / 1080,
    bottomScrim: 0,
  },
} as const;

function overlayMetrics(width: number, height: number) {
  // Width that survives to the delivered canvas: the whole frame when it is already vertical,
  // the 3:2 centre crop when it is wider than that. Anything drawn outside that strip is thrown
  // away by wrap-vertical.mjs, so horizontal insets are measured from the crop edge, not the
  // frame edge — otherwise a 16:9 master puts the AI tag where the crop cuts through it.
  const bandWidth = Math.min(width, height * VERTICAL_BAND_RATIO);
  const cropInset = Math.round((width - bandWidth) / 2);
  const unit = bandWidth / DELIVERY_WIDTH;
  const profile =
    width > height ? OVERLAY_PROFILES.wide : OVERLAY_PROFILES.vertical;
  const px = (base: number) => Math.round(base * unit);
  return {
    topScrimHeight: Math.round(height * profile.topScrim),
    bottomScrimHeight: Math.round(height * profile.bottomScrim),
    titleTop: Math.round(height * profile.titleTop),
    titleInset: cropInset + px(110),
    titleFontSize: px(52),
    titleShadow: `0 ${px(2)}px ${px(8)}px rgba(0,0,0,.6)`,
    tagTop: Math.round(height * profile.tagTop),
    tagLeft: cropInset + px(14),
    tagFontSize: px(15),
    tagPadding: `${px(4)}px ${px(9)}px`,
    tagRadius: px(6),
  };
}

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
  const { width, height } = useVideoConfig();
  const overlay = overlayMetrics(width, height);
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

      {/* top scrim + title, sized by overlayMetrics for the current aspect */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: overlay.topScrimHeight,
          background: "linear-gradient(rgba(0,0,0,.74), transparent)",
        }}
      />
      {scene.title && (
        <div
          style={{
            position: "absolute",
            top: overlay.titleTop,
            left: overlay.titleInset,
            right: overlay.titleInset,
            textAlign: "center",
            fontFamily: "Arial, sans-serif",
            fontWeight: 1000,
            fontSize: overlay.titleFontSize,
            lineHeight: 1.1,
            color: "white",
            textShadow: overlay.titleShadow,
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
            top: overlay.tagTop,
            left: overlay.tagLeft,
            padding: overlay.tagPadding,
            background: "rgba(25,23,22,.82)",
            color: COLORS.paper,
            fontFamily: "Arial, sans-serif",
            fontWeight: 800,
            fontSize: overlay.tagFontSize,
            borderRadius: overlay.tagRadius,
          }}
        >        </div>
      )}

      {/* bottom scrim — omitted entirely on the wide profile, which sets its height to 0 */}
      {overlay.bottomScrimHeight > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: overlay.bottomScrimHeight,
            background: "linear-gradient(transparent, rgba(0,0,0,.82))",
          }}
        />
      )}
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
    <AbsoluteFill
      style={{
        background: COLORS.ink,
      }}
    >
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
