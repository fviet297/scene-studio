import React from "react";
import { useVideoConfig } from "remotion";
import { deliveryBand } from "./delivery-band";
import { useCaptionFont, type CaptionFontId } from "./caption-fonts";
import { strokeOutline } from "./text-style";

// The scene title drawn near the top of every scene. Style comes from projects/<slug>/branding.json
// `title` (scripts/lib/branding.mjs); the defaults reproduce the look it had before it was editable.
// Sizes are delivered-canvas pixels (1080 wide) scaled by deliveryBand's `unit`.

export type TitlePosition = "top" | "middle" | "bottom";

export interface TitleStyle {
  enabled: boolean;
  font: CaptionFontId;
  size: number;
  color: string;
  strokeWidth: number;
  strokeColor: string;
  backgroundOpacity: number;
  uppercase: boolean;
  shadow: boolean;
  // Dark gradient behind the top of the frame (drawn by SceneView); kept for contrast under the title.
  scrim: boolean;
  position: TitlePosition;
  // Extra nudge from the position preset, in 1080-wide canvas px; negative moves the title up.
  offsetY: number;
}

// Mirrors DEFAULT_BRANDING.title; bundles built before a field existed fall back to these.
export const DEFAULT_TITLE_STYLE: TitleStyle = {
  enabled: true,
  font: "be-vietnam",
  size: 52,
  color: "#ffffff",
  strokeWidth: 0,
  strokeColor: "#000000",
  backgroundOpacity: 0,
  uppercase: false,
  shadow: true,
  scrim: true,
  position: "top",
  offsetY: 0,
};

const LINE_HEIGHT = 1.1;
const TITLE_SHADOW = (px: (n: number) => number) =>
  `0 ${px(2)}px ${px(8)}px rgba(0,0,0,.6)`;

const ALIGN_BY_POSITION: Record<
  TitlePosition,
  React.CSSProperties["alignItems"]
> = {
  top: "flex-start",
  middle: "center",
  bottom: "flex-end",
};

export const resolveTitleStyle = (partial?: Partial<TitleStyle>): TitleStyle => ({
  ...DEFAULT_TITLE_STYLE,
  ...partial,
});

export function SceneTitle({
  text,
  style,
  box,
}: {
  text: string;
  style: TitleStyle;
  // Pixel box the title is laid out in (SceneView's overlayMetrics): `top` is where a "top" title
  // starts, `bottom` the clear space kept under a "bottom" one.
  box: { top: number; bottom: number; inset: number };
}) {
  const { width, height } = useVideoConfig();
  const font = useCaptionFont(style.font);
  const { unit } = deliveryBand(width, height);
  const px = (n: number) => Math.round(n * unit);
  const hasBackground = style.backgroundOpacity > 0;
  return (
    <div
      style={{
        position: "absolute",
        top: box.top,
        bottom: box.bottom,
        left: box.inset,
        right: box.inset,
        display: "flex",
        justifyContent: "center",
        alignItems: ALIGN_BY_POSITION[style.position],
        transform: `translateY(${px(style.offsetY)}px)`,
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontFamily: font.family,
          fontWeight: font.weight,
          fontSize: px(style.size),
          lineHeight: LINE_HEIGHT,
          color: style.color,
          // A plain title keeps its old unpadded box; padding only appears with a backing.
          padding: hasBackground ? `${px(10)}px ${px(24)}px` : undefined,
          borderRadius: hasBackground ? px(16) : undefined,
          background: hasBackground
            ? `rgba(0,0,0,${style.backgroundOpacity})`
            : undefined,
          textWrap: "balance",
          ...strokeOutline(px, style.strokeWidth, style.strokeColor),
          textShadow: style.shadow ? TITLE_SHADOW(px) : undefined,
        }}
      >
        {style.uppercase ? text.toLocaleUpperCase("vi") : text}
      </div>
    </div>
  );
}
