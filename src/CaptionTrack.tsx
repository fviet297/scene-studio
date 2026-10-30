import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { deliveryBand } from "./delivery-band";
import { useCaptionFont, type CaptionFontId } from "./caption-fonts";

// Burned-in narration subtitles. scripts/lib/caption-align.mjs spreads each scene's words across
// the speech regions of its audio, so a word's start/end is approximate (no word-level ASR) but
// tracks the delivery rhythm. The current group stays on screen as a whole so the line never
// reflows; words fill with the "spoken" colour as they are read. Sizes are delivered-canvas pixels
// (1080 wide) scaled by deliveryBand's `unit`, so the text reads the same in 9:16 and in the 16:9
// master's 3:2 strip. Style comes from projects/<slug>/branding.json (scripts/lib/branding.mjs).

export type CaptionWord = { text: string; start: number; end: number };
export type CaptionGroup = CaptionWord[];

export type CaptionPosition = "top" | "middle" | "bottom";
// 16:9 only: "crop" stays inside the 3:2 strip the 9:16 export keeps, "frame" spans the real frame.
export type CaptionAnchor = "crop" | "frame";

// karaoke: the spoken colour sweeps across the word; word: the whole word switches colour when it
// is reached; none: no highlight, every word keeps the unspoken colour.
export type CaptionHighlight = "karaoke" | "word" | "none";

export interface CaptionStyle {
  enabled: boolean;
  font: CaptionFontId;
  size: number;
  strokeWidth: number;
  backgroundOpacity: number;
  uppercase: boolean;
  highlight: CaptionHighlight;
  position: CaptionPosition;
  // Extra nudge from the position preset, in 1080-wide canvas px; negative moves the caption up.
  offsetY: number;
  anchor: CaptionAnchor;
  spokenColor: string;
  unspokenColor: string;
}

// Mirrors DEFAULT_BRANDING.captions; bundles built before a field existed fall back to these.
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  enabled: false,
  font: "be-vietnam",
  size: 48,
  strokeWidth: 7,
  backgroundOpacity: 0.42,
  uppercase: false,
  highlight: "karaoke",
  position: "bottom",
  offsetY: 0,
  anchor: "crop",
  spokenColor: "#f6c85f",
  unspokenColor: "#ffffff",
};

const LINE_HEIGHT = 1.28;
const FADE_FRAMES = 4;
const ACTIVE_WORD_SCALE = 1.06;

// Vertical: the caption stays between the platform chrome (TikTok ~200px at the top, ~480px at the
// bottom, see BrandOverlay SAFE_EDGES) and clear of the right-edge action rail. Wide: no chrome
// over the picture, so the box is the whole strip minus a margin.
const VERTICAL_SAFE = { top: 200 / 1920, bottom: 480 / 1920 };
const VERTICAL_INSET = { left: 60, right: 190 };
const WIDE_INSET = { side: 60, edge: 36 };

const ALIGN_BY_POSITION: Record<
  CaptionPosition,
  React.CSSProperties["alignItems"]
> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

const wordProgress = (word: CaptionWord, seconds: number) =>
  interpolate(
    seconds,
    [word.start, Math.max(word.end, word.start + 0.01)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

const outline = (
  px: (n: number) => number,
  strokeWidth: number,
): React.CSSProperties => ({
  WebkitTextStroke:
    strokeWidth > 0 ? `${px(strokeWidth)}px rgba(0,0,0,.78)` : undefined,
  paintOrder: "stroke fill",
  textShadow: `0 ${px(3)}px ${px(10)}px rgba(0,0,0,.55)`,
});

function CaptionWordView({
  word,
  seconds,
  px,
  style,
}: {
  word: CaptionWord;
  seconds: number;
  px: (n: number) => number;
  style: CaptionStyle;
}) {
  const progress = wordProgress(word, seconds);
  const isActive = progress > 0 && progress < 1;
  const textStyle = outline(px, style.strokeWidth);
  const text = style.uppercase ? word.text.toLocaleUpperCase("vi") : word.text;
  if (style.highlight !== "karaoke") {
    const reached = style.highlight === "word" && progress > 0;
    return (
      <span
        style={{
          ...textStyle,
          display: "inline-block",
          color: reached ? style.spokenColor : style.unspokenColor,
          transform: `scale(${reached && isActive ? ACTIVE_WORD_SCALE : 1})`,
        }}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        transform: `scale(${isActive ? ACTIVE_WORD_SCALE : 1})`,
      }}
    >
      <span style={{ ...textStyle, color: style.unspokenColor }}>{text}</span>
      <span
        aria-hidden
        style={{
          ...textStyle,
          position: "absolute",
          left: 0,
          top: 0,
          color: style.spokenColor,
          clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
        }}
      >
        {text}
      </span>
    </span>
  );
}

function captionBox(
  style: CaptionStyle,
  frame: { width: number; height: number },
  px: (n: number) => number,
  cropInset: number,
  isWide: boolean,
): React.CSSProperties {
  if (!isWide) {
    return {
      left: px(VERTICAL_INSET.left),
      right: px(VERTICAL_INSET.right),
      top: Math.round(frame.height * VERTICAL_SAFE.top),
      bottom: Math.round(frame.height * VERTICAL_SAFE.bottom),
    };
  }
  const sideInset =
    (style.anchor === "frame" ? 0 : cropInset) + px(WIDE_INSET.side);
  return {
    left: sideInset,
    right: sideInset,
    top: px(WIDE_INSET.edge),
    bottom: px(WIDE_INSET.edge),
  };
}

export function CaptionTrack({
  groups,
  style: partialStyle,
}: {
  groups: CaptionGroup[];
  style?: Partial<CaptionStyle>;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const seconds = frame / fps;
  const style = { ...DEFAULT_CAPTION_STYLE, ...partialStyle };
  const font = useCaptionFont(style.font);
  const group = groups.find(
    (g) =>
      g.length > 0 && seconds >= g[0].start && seconds < g[g.length - 1].end,
  );
  if (!group) return null;

  const { unit, isWide, cropInset } = deliveryBand(width, height);
  const px = (n: number) => Math.round(n * unit);
  const startFrame = Math.round(group[0].start * fps);
  const endFrame = Math.round(group[group.length - 1].end * fps);
  const fadeIn = interpolate(
    frame,
    [startFrame, startFrame + FADE_FRAMES],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const fadeOut = interpolate(
    frame,
    [endFrame - FADE_FRAMES, endFrame],
    [1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <div
      style={{
        position: "absolute",
        ...captionBox(style, { width, height }, px, cropInset, isWide),
        display: "flex",
        justifyContent: "center",
        alignItems: ALIGN_BY_POSITION[style.position],
        opacity: Math.min(fadeIn, fadeOut),
        transform: `translateY(${px(style.offsetY) + (1 - fadeIn) * px(10)}px)`,
      }}
    >
      <p
        style={{
          margin: 0,
          padding: `${px(10)}px ${px(24)}px`,
          borderRadius: px(16),
          background:
            style.backgroundOpacity > 0
              ? `rgba(0,0,0,${style.backgroundOpacity})`
              : "transparent",
          fontFamily: font.family,
          fontWeight: font.weight,
          fontSize: px(style.size),
          lineHeight: LINE_HEIGHT,
          textAlign: "center",
          textWrap: "balance",
        }}
      >
        {group.map((word, index) => (
          <React.Fragment key={`${word.start}-${index}`}>
            {index > 0 && " "}
            <CaptionWordView
              word={word}
              seconds={seconds}
              px={px}
              style={style}
            />
          </React.Fragment>
        ))}
      </p>
    </div>
  );
}
