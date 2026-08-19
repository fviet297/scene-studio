import type React from "react";

// Any id present in the active project's src/characters-data.json (generated from that
// project's scene-plan.md `## characters` block) — not a fixed union, since the character set
// changes per project.
export type HistoricalCharacterId = string;

export type HistoricalCharacterAnimation =
  | "still"
  | "idle"
  | "enter-left"
  | "enter-right"
  | "emphasis"
  | "exit-left"
  | "exit-right";

export type HistoricalCharacterReferenceVersion = "current" | "v2";

export interface HistoricalCharacterProps {
  character: HistoricalCharacterId;
  animation?: HistoricalCharacterAnimation;
  referenceVersion?: HistoricalCharacterReferenceVersion;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
}
