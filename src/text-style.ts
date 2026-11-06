import type React from "react";

// Helpers shared by the burned-in text layers (CaptionTrack, SceneTitle) so an outline looks the
// same on both. Colours arrive as "#rrggbb" (scripts/lib/branding.mjs validates them).

// The old caption outline was black at this opacity; kept so a default stroke colour changes nothing.
const OUTLINE_ALPHA = 0.78;

export const withAlpha = (hex: string, alpha: number): string => {
  const channel = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgba(${channel(0)},${channel(1)},${channel(2)},${alpha})`;
};

// Stroke painted under the fill, so thick outlines do not eat into the glyph.
export const strokeOutline = (
  px: (n: number) => number,
  strokeWidth: number,
  strokeColor: string,
): React.CSSProperties => ({
  WebkitTextStroke:
    strokeWidth > 0
      ? `${px(strokeWidth)}px ${withAlpha(strokeColor, OUTLINE_ALPHA)}`
      : undefined,
  paintOrder: "stroke fill",
});
