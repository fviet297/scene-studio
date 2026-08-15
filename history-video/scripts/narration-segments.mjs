// TEMPLATE — single source of truth for narration: one segment per visual scene.
// Each segment becomes its own audio file (public/audio/scene-NN.mp3) so a mispronounced
// part is regenerated in isolation. Replace these placeholders with the real per-scene
// narration for your project. Spell numbers out in the target language for the TTS engine
// (e.g. Vietnamese: 1789 → "một nghìn bảy trăm tám mươi chín").

export const SEGMENTS = [
  { scene: 1, text: 'Câu mở đầu của scene một. Câu thứ hai của scene một.' },
  { scene: 2, text: 'Nội dung narration cho scene hai.' },
  { scene: 3, text: 'Nội dung narration cho scene ba.' },
  // ... one entry per scene, scene numbers 1..N in order ...
];
