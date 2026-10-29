import React from "react";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { deliveryBand } from "./delivery-band";
import type { CaptionStyle } from "./CaptionTrack";

// Channel branding over the whole render: a corner logo + name, and a large faint centre
// watermark that makes a cropped re-upload still carry the mark. Settings come from
// projects/<slug>/branding.json (scripts/lib/branding.mjs); sizes are delivered-canvas pixels.

export type BrandPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

// 16:9 only: corner measured from the 3:2 strip wrap-vertical.mjs keeps ("crop") or from the
// real frame edge ("frame", for a YouTube-only upload).
export type BrandAnchor = "crop" | "frame";

export interface Branding {
  // Brand name under the corner logo and in the watermark; empty shows the logo alone.
  name: string;
  // margin / size / textSize are delivered-canvas pixels (1080 wide), set in the panel.
  logo: {
    enabled: boolean;
    position: BrandPosition;
    anchor: BrandAnchor;
    opacity: number;
    margin: number;
    size: number;
    textSize: number;
  };
  watermark: { enabled: boolean; opacity: number };
  // Narration subtitles (CaptionTrack.tsx); absent in bundles built before the setting existed.
  captions?: Partial<CaptionStyle>;
}

const LOGO_SRC = "brand/logo.svg";
const FONT = "Arial, sans-serif";

// Gap between the logo and the brand name under it, in delivered pixels.
const BADGE_GAP = 4;
// The vertical AI tag sits at the top-left corner (SceneView); a top-left badge drops below it.
const TOP_LEFT_TAG_CLEARANCE = 60;

// Safe area the margin is measured from, as fractions of composition height. Vertical: TikTok
// keeps ~220px at the top and ~480px at the bottom under its chrome, Shorts ~180-290px top and
// ~290-380px bottom (third-party measurements, no official spec), so the badge starts below the
// top chrome and above the Shorts caption block. Wide: the picture is a band between black bars
// with no chrome over it, so the margin counts from the frame edge.
const SAFE_EDGES = {
  vertical: { top: 200 / 1920, bottom: 400 / 1920 },
  wide: { top: 0, bottom: 0 },
} as const;

// Centre watermark: logo width as a share of the delivered band.
const WATERMARK_LOGO_SHARE = 0.46;
const WATERMARK_TEXT = 110;

const textShadow = (px: (n: number) => number) =>
  `0 ${px(2)}px ${px(6)}px rgba(0,0,0,.65)`;

function CornerBadge({
  branding,
  name,
}: {
  branding: Branding["logo"];
  name: string;
}) {
  const { width, height } = useVideoConfig();
  const band = deliveryBand(width, height);
  const { unit, isWide } = band;
  const cropInset = branding.anchor === "frame" ? 0 : band.cropInset;
  const px = (n: number) => Math.round(n * unit);
  const safe = isWide ? SAFE_EDGES.wide : SAFE_EDGES.vertical;
  const [vertical, horizontal] = branding.position.split("-");
  const margin = px(branding.margin);
  const tagClearance =
    !isWide && branding.position === "top-left"
      ? px(TOP_LEFT_TAG_CLEARANCE)
      : 0;
  const placement: React.CSSProperties = {
    ...(vertical === "top"
      ? { top: Math.round(height * safe.top) + margin + tagClearance }
      : { bottom: Math.round(height * safe.bottom) + margin }),
    [horizontal === "left" ? "left" : "right"]: cropInset + margin,
  };
  return (
    <div
      style={{
        position: "absolute",
        ...placement,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: px(BADGE_GAP),
        opacity: branding.opacity,
      }}
    >
      <Img
        src={staticFile(LOGO_SRC)}
        style={{
          height: px(branding.size),
          filter: `drop-shadow(0 ${px(2)}px ${px(5)}px rgba(0,0,0,.6))`,
        }}
      />
      {name && (
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: px(branding.textSize),
            lineHeight: 1,
            letterSpacing: "0.14em",
            // Letter spacing trails the last glyph; pad the start so the name centres under the logo.
            paddingLeft: "0.14em",
            color: "white",
            textShadow: textShadow(px),
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}

function CentreWatermark({ opacity, name }: { opacity: number; name: string }) {
  const { width, height } = useVideoConfig();
  const { bandWidth, unit } = deliveryBand(width, height);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        opacity,
      }}
    >
      <Img
        src={staticFile(LOGO_SRC)}
        style={{ width: Math.round(bandWidth * WATERMARK_LOGO_SHARE) }}
      />
      {name && (
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: Math.round(WATERMARK_TEXT * unit),
            letterSpacing: "0.2em",
            color: "white",
          }}
        >
          {name}
        </span>
      )}
    </AbsoluteFill>
  );
}

export function BrandOverlay({ branding }: { branding: Branding }) {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {branding.watermark.enabled && branding.watermark.opacity > 0 && (
        <CentreWatermark
          opacity={branding.watermark.opacity}
          name={branding.name}
        />
      )}
      {branding.logo.enabled && branding.logo.opacity > 0 && (
        <CornerBadge branding={branding.logo} name={branding.name} />
      )}
    </AbsoluteFill>
  );
}
