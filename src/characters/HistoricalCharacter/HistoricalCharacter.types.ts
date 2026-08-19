import type React from 'react';

export type HistoricalCharacterId = 'ly-thai-to' | 'ly-the-dan';

export type HistoricalCharacterAnimation =
  | 'still'
  | 'idle'
  | 'enter-left'
  | 'enter-right'
  | 'emphasis'
  | 'exit-left'
  | 'exit-right';

export type HistoricalCharacterReferenceVersion = 'current' | 'v2';

export interface HistoricalCharacterProps {
  character: HistoricalCharacterId;
  animation?: HistoricalCharacterAnimation;
  referenceVersion?: HistoricalCharacterReferenceVersion;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  className?: string;
}
