import type React from "react";

// Any id in a project's scene-plan.md `## characters` block — not a fixed union, since the
// character set changes per project.
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
  // Project slug the character id belongs to (ids repeat across projects, e.g. char-a).
  project: string;
  character: HistoricalCharacterId;
  animation?: HistoricalCharacterAnimation;
  referenceVersion?: HistoricalCharacterReferenceVersion;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
}
