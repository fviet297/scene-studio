import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { HistoricalCharacter } from './characters/HistoricalCharacter';

export const CHARACTER_PREVIEW_FPS = 30;
export const CHARACTER_PREVIEW_DURATION = CHARACTER_PREVIEW_FPS * 8;

export const CharacterPuppetPreview: React.FC = () => {
  const { width, height } = useVideoConfig();
  const characterWidth = Math.round(width * 0.34);
  const characterHeight = Math.round(height * 0.34);

  return (
    <AbsoluteFill style={{ backgroundColor: '#f4efe6', color: '#2c241d', fontFamily: 'Georgia, serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: 100 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, letterSpacing: 3, textTransform: 'uppercase' }}>Character reference preview</div>
        <div style={{ fontSize: 22, opacity: 0.65, marginTop: 14 }}>Existing PNG assets, reusable Remotion motion layer</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 80 }}>
        <div style={{ textAlign: 'center' }}>
          <HistoricalCharacter character="ly-thai-to" referenceVersion="v2" animation="idle" width={characterWidth} height={characterHeight} />
          <div style={{ fontSize: 28, marginTop: 18 }}>Lý Thái Tổ</div>
        </div>
        <Sequence from={CHARACTER_PREVIEW_FPS} layout="none">
          <div style={{ textAlign: 'center' }}>
            <HistoricalCharacter character="ly-the-dan" referenceVersion="v2" animation="enter-right" width={characterWidth} height={characterHeight} />
            <div style={{ fontSize: 28, marginTop: 18 }}>Lý Thế Dân</div>
          </div>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
