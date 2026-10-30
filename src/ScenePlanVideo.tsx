import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
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
import { deliveryBand } from "./delivery-band";
import { BrandOverlay, type Branding } from "./BrandOverlay";
import { CaptionTrack, type CaptionGroup } from "./CaptionTrack";
import { GRADE_FILTER, ProjectEffects } from "./effects/ProjectEffects";
import { transitionFrame } from "./effects/transitions";
import {
  DEFAULT_EFFECTS,
  resolveEffects,
  type EffectsConfig,
} from "./effects/types";

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

export type ProjectCharacter = {
  id: string;
  name: string;
  aliases: readonly string[];
  // staticFile()-relative reference image, and its puppet-ready v2 (falls back to `image`).
  image: string;
  imageV2: string;
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
  // Per-scene motion clip length in seconds (0 = no clip). The composition derives the real rate
  // from it because the Sequence is `overlap` frames longer than the scene (see motionRate).
  motionClipSeconds?: number[];
  // Per-scene seconds at the end of the motion clip where it has eased to a near stop (measured by
  // scripts/lib/motion-tail.mjs); the next scene's transition starts that early to dissolve over it.
  motionTailSeconds?: number[];
  // Per-scene seconds skipped at the start of the motion clip (soft, jittery first frames).
  motionHeadSeconds?: number[];
  uploadedScenes: number[];
  // The plan's `## characters` block, enriched from each profile.json; absent in older bundles.
  characters?: ProjectCharacter[];
  // Stamped by the builder: public/projects/<slug>/overlay/news-overlay.png exists.
  hasOverlay?: boolean;
  // Stamped by the builder: public/projects/<slug>/overlay/news-title.png exists.
  hasTitleOverlay?: boolean;
  // Scene number the headline card enters on (plan header `title-overlay-scene:`); default first.
  titleOverlayScene?: number;
  // Stamped by the builder from projects/<slug>/branding.json; absent in bundles built before it.
  branding?: Branding;
  // Word timings in absolute seconds (scripts/lib/caption-align.mjs); empty until every scene has audio.
  captionGroups?: CaptionGroup[];
};

const PLACEHOLDER_SCENE_SECONDS = 4;
// A scene's <video> and narration <Audio> are mounted this long before they start, so the browser
// has loaded them by the time the previous scene hands over; otherwise the player stalls at each
// scene boundary while the next file loads.
const PREMOUNT_SECONDS = 2;

// The incoming scene starts `effects.transition.frames` early and enters over the outgoing one's
// tail (dissolve, wipe, slide...); narration stays on the scene's true start.

// --- Overlay sizing -------------------------------------------------------------------------
// Horizontal and typographic values scale by deliveryBand().unit; see src/delivery-band.ts.

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
  const { cropInset, unit, isWide } = deliveryBand(width, height);
  const profile = isWide ? OVERLAY_PROFILES.wide : OVERLAY_PROFILES.vertical;
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

// How the scene is drawn while it enters. The default crossfade keeps the original eased dissolve;
// the other types come from effects/transitions.ts.
function enterTransition(
  effects: EffectsConfig,
  localFrame: number,
  durationInFrames: number,
  overlapFrames: number,
): { style: React.CSSProperties; flash: number } {
  const { type } = effects.transition;
  if (type === "crossfade") {
    return {
      style: {
        opacity: transitionOpacity(
          localFrame,
          durationInFrames,
          overlapFrames,
          0,
        ),
      },
      flash: 0,
    };
  }
  return transitionFrame(
    type,
    overlapFrames > 0 ? localFrame / overlapFrames : 1,
  );
}

// How many frames early a scene starts. At least the chosen transition length; when the previous
// scene's motion clip has eased to a near stop, long enough to dissolve over that dead tail
// instead of showing it as a stall. A cut (0 frames) stays a cut.
const MAX_TAIL_OVERLAP_FRAMES = 30;
function transitionOverlapFrames(
  transitionFrames: number,
  previousTailSeconds: number | undefined,
  previousSceneFrames: number,
  fps: number,
): number {
  if (transitionFrames === 0) return 0;
  const tailFrames = Math.min(
    MAX_TAIL_OVERLAP_FRAMES,
    Math.ceil((previousTailSeconds ?? 0) * fps),
  );
  return Math.min(Math.max(transitionFrames, tailFrames), previousSceneFrames);
}

// A clip shorter than its Sequence is slowed to span all of it, so it never freezes on its last
// frame. The Sequence starts `overlap` frames before the scene's own start (the transition), so
// it is longer than the scene the builder measured; bundles built before motionClipSeconds fall
// back to the builder's own rate. The soft head the clip skips (headSeconds) is not played, so it
// does not count towards the clip's length.
function motionRate(
  clipSeconds: number | undefined,
  builderRate: number | undefined,
  headSeconds: number,
  sequenceFrames: number,
  fps: number,
): number {
  if (clipSeconds === undefined) return builderRate ?? 1;
  const sequenceSeconds = sequenceFrames / fps;
  const playedSeconds = clipSeconds - headSeconds;
  return playedSeconds > 0 && playedSeconds < sequenceSeconds
    ? playedSeconds / sequenceSeconds
    : 1;
}

export function SceneView({
  scene,
  projectSlug,
  durationInFrames,
  publicPrefix,
  uploadedScenes = [],
  motionPlaybackRate = 1,
  motionStartFromSeconds = 0,
  fadeInFrames = 0,
  effects = DEFAULT_EFFECTS,
}: {
  scene: Scene;
  projectSlug: string;
  durationInFrames: number;
  publicPrefix: string;
  uploadedScenes?: number[];
  motionPlaybackRate?: number;
  motionStartFromSeconds?: number;
  fadeInFrames?: number;
  effects?: EffectsConfig;
}) {
  const local = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const overlay = overlayMetrics(width, height);
  const motion = getSceneMotion(projectSlug, scene.scene);
  // Fade the whole scene (image + overlays together) in over the previous scene, which is still
  // on screen underneath (see CROSSFADE_FRAMES) — a true cross-dissolve, never a dip to black.
  // The CinematicScene's own transition is disabled here to avoid double-fading the image.
  const enter = enterTransition(effects, local, durationInFrames, fadeInFrames);
  const atmosphere = {
    ...motion.atmosphere,
    ...(effects.vignette ? {} : { vignette: false }),
    ...(effects.grain ? {} : { grain: false }),
  };
  const sceneNo = String(scene.scene).padStart(2, "0");
  const src = `${publicPrefix}/images/scene-${sceneNo}.jpg`;
  const videoSrc = `${publicPrefix}/scene-videos/scene-${sceneNo}.mp4`;
  // A user-uploaded photo (per the asset manifest) must NOT show the "AI phục dựng" tag.
  const showsAiTag =
    scene.image.kind === "ai" && !new Set(uploadedScenes).has(scene.scene);
  return (
    <AbsoluteFill
      style={{ ...enter.style, background: motion.background ?? COLORS.ink }}
    >
      {scene.motionVideo ? (
        <CinematicVideoScene
          src={videoSrc}
          playbackRate={motionPlaybackRate}
          startFromSeconds={motionStartFromSeconds}
          motion={{ ...motion, atmosphere, transitionIn: 0, transitionOut: 0 }}
        />
      ) : (
        <CinematicScene
          src={src}
          durationInFrames={durationInFrames}
          motion={{ ...motion, atmosphere, transitionIn: 0, transitionOut: 0 }}
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
        >
          {" "}
        </div>
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
      {enter.flash > 0 && (
        <AbsoluteFill
          style={{
            background: "#fff",
            opacity: enter.flash,
            pointerEvents: "none",
          }}
        />
      )}
    </AbsoluteFill>
  );
}

const TITLE_ON_SCREEN_SECONDS = 3;
const TITLE_SLIDE_FRAMES = 12;
// Far enough left to clear the card (left inset + card width) on a 1920-wide frame.
const TITLE_OFFSCREEN_X = -1000;

// Headline card over the opening seconds: slides in from the left, holds, slides back out so it
// stops covering the artwork after the hook.
function TitleOverlay({
  src,
  durationInFrames,
}: {
  src: string;
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const slide = Math.min(TITLE_SLIDE_FRAMES, Math.floor(durationInFrames / 3));
  const x = interpolate(
    frame,
    [0, slide, durationInFrames - slide, durationInFrames],
    [TITLE_OFFSCREEN_X, 0, 0, TITLE_OFFSCREEN_X],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );
  return (
    <Img
      src={src}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        transform: `translateX(${x}px)`,
      }}
    />
  );
}

export const ScenePlanVideo: React.FC<{ project: ProjectData }> = ({
  project,
}) => {
  const { frames, starts } = sceneTimeline(
    project.scenes,
    project.sceneDurations,
  );
  const effects = resolveEffects(project.branding?.effects);
  const transitionFrames =
    effects.transition.type === "none" ? 0 : effects.transition.frames;
  const titleIndex = Math.max(
    0,
    project.scenes.findIndex((s) => s.scene === project.titleOverlayScene),
  );
  const titleFrames = Math.min(
    frames[titleIndex] ?? 0,
    TITLE_ON_SCREEN_SECONDS * FPS,
  );
  return (
    <AbsoluteFill
      style={{
        background: COLORS.ink,
      }}
    >
      <AbsoluteFill style={{ filter: GRADE_FILTER[effects.grade] }}>
        {project.scenes.map((scene, i) => {
          // Each scene starts early by `overlap` frames and fades in over its predecessor's tail;
          // narration stays on the scene's true start, so captions and audio are not shifted.
          const overlap =
            i === 0
              ? 0
              : transitionOverlapFrames(
                  transitionFrames,
                  project.motionTailSeconds?.[i - 1],
                  frames[i - 1],
                  project.fps,
                );
          return (
            <React.Fragment key={scene.scene}>
              <Sequence
                from={starts[i] - overlap}
                durationInFrames={frames[i] + overlap}
                premountFor={PREMOUNT_SECONDS * project.fps}
              >
                <SceneView
                  scene={scene}
                  projectSlug={project.slug}
                  durationInFrames={frames[i] + overlap}
                  publicPrefix={project.publicPrefix}
                  uploadedScenes={project.uploadedScenes}
                  motionPlaybackRate={motionRate(
                    project.motionClipSeconds?.[i],
                    project.motionPlaybackRates?.[i],
                    project.motionHeadSeconds?.[i] ?? 0,
                    frames[i] + overlap,
                    project.fps,
                  )}
                  motionStartFromSeconds={project.motionHeadSeconds?.[i] ?? 0}
                  fadeInFrames={overlap}
                  effects={effects}
                />
              </Sequence>
              {scene.hasAudio && (
                <Sequence
                  from={starts[i]}
                  durationInFrames={frames[i]}
                  premountFor={PREMOUNT_SECONDS * project.fps}
                >
                  <Audio
                    src={staticFile(
                      `${project.publicPrefix}/audio/scene-${String(scene.scene).padStart(2, "0")}.mp3`,
                    )}
                  />
                </Sequence>
              )}
            </React.Fragment>
          );
        })}
        <ProjectEffects effects={effects} />
      </AbsoluteFill>
      {project.hasTitleOverlay && titleFrames > 0 && (
        <Sequence from={starts[titleIndex]} durationInFrames={titleFrames}>
          <TitleOverlay
            src={staticFile(`${project.publicPrefix}/overlay/news-title.png`)}
            durationInFrames={titleFrames}
          />
        </Sequence>
      )}
      {project.hasOverlay && (
        <Img
          src={staticFile(`${project.publicPrefix}/overlay/news-overlay.png`)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        />
      )}
      {project.branding?.captions?.enabled && (
        <CaptionTrack
          groups={project.captionGroups ?? []}
          style={project.branding.captions}
        />
      )}
      {project.branding && <BrandOverlay branding={project.branding} />}
    </AbsoluteFill>
  );
};
