import type { CSSProperties } from "react";
import { EASE_IN_OUT, clamp } from "../animation/motion";
import type { TransitionType } from "./types";

// How the incoming scene is drawn while it enters over the outgoing one (which stays put underneath).
// `progress` is 0 at the start of the overlap and 1 once the scene is fully in; the result is a pure
// function of it so the player, Studio and the render agree frame for frame.
export type TransitionFrame = {
  style: CSSProperties;
  // 0..1 white flash drawn above the incoming scene (the "flash" type).
  flash: number;
};

const FULL: TransitionFrame = { style: {}, flash: 0 };
const ZOOM_FROM = 1.14;
const IRIS_MAX_RADIUS_PERCENT = 75;

export function transitionFrame(
  type: TransitionType,
  linearProgress: number,
): TransitionFrame {
  const p = EASE_IN_OUT(clamp(linearProgress, 0, 1));
  if (p >= 1) return FULL;
  switch (type) {
    case "wipe":
      return {
        style: { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` },
        flash: 0,
      };
    case "slide":
      return {
        style: { transform: `translateX(${(1 - p) * 100}%)` },
        flash: 0,
      };
    case "zoom":
      return {
        style: {
          opacity: p,
          transform: `scale(${1 + (1 - p) * (ZOOM_FROM - 1)})`,
        },
        flash: 0,
      };
    case "iris":
      return {
        style: {
          clipPath: `circle(${p * IRIS_MAX_RADIUS_PERCENT}% at 50% 50%)`,
        },
        flash: 0,
      };
    case "flash":
      return {
        style: { opacity: p < 0.5 ? 0 : 1 },
        flash: 1 - Math.abs(2 * p - 1),
      };
    case "none":
      return FULL;
    default:
      return { style: { opacity: p }, flash: 0 };
  }
}
