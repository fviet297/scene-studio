/**
 * HistoryHost — public component.
 *
 * Reads the current Remotion frame, resolves the chosen animation + expression
 * into a pose/face, and hands them to the presentational {@link HistoryHostPuppet}.
 * Inside a <Sequence>, `useCurrentFrame` is local to that sequence, so a clip
 * plays from its start automatically.
 *
 *   <HistoryHost animation="wave" expression="happy" />
 *   <HistoryHost animation="point-left" expression="confident" />
 */
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { HistoryHostProps } from './HistoryHost.types';
import { HistoryHostPuppet } from './HistoryHostPuppet';
import { resolveFrame } from './HistoryHostAnimation';

export function HistoryHost({
  animation = 'idle',
  expression = 'neutral',
  width,
  height,
  style,
  className,
}: HistoryHostProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const { pose, face } = resolveFrame(animation, expression, { frame, fps, durationInFrames });

  return (
    <HistoryHostPuppet
      pose={pose}
      face={face}
      width={width}
      height={height}
      style={style}
      className={className}
    />
  );
}
