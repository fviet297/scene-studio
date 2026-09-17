// Per-scene emotion for OmniVoice narration.
//
// Clone mode sounds monotone out of the box because class_temperature is 0 (greedy token
// sampling) and every scene shares one flat speed/guidance. These presets vary the generation
// params per scene so the delivery has range, WITHOUT inline text markers ([sigh], [surprise-*],
// which are English/Chinese-flavoured and risky in Vietnamese) and WITHOUT changing the cloned
// "history" voice itself — only its pacing and prosody move.
//
// A scene's mood comes from its `cue:` field in the plan (editable in the review panel). An empty
// or unrecognised cue falls back to `neutral`, which is already livelier than the old flat default.
//
// Each preset overrides these four params on top of the base payload in generate-narration.mjs:
//   speed                — pacing (0.5 slow/weighty … 1.5 fast/urgent)
//   guidance_scale       — emphasis / commitment (0..4; higher = more deliberate)
//   position_temperature — prosodic variety (0 flat … higher livelier)
//   class_temperature    — token-sampling liveliness (0 = monotone; the key knob for expression)
//
// Two limits learned from Whisper QA, both of which showed up as dropped words:
//
//   speed never exceeds 1.0. The model does not speak faster — it shortens the target audio it
//   has to fit the text into (omnivoice `_estimate_target_tokens` divides the estimate by speed).
//   At speed 1.12 the tense scenes landed at 20-21 characters/second and the model started
//   discarding content: scene 12's "Chu Du mượn gió." vanished outright. Urgency comes from
//   guidance_scale and position_temperature instead, which change delivery, not the budget.
//
//   class_temperature stays modest (≤ 0.5). It is the randomness knob, so it buys expression and
//   mispronunciations from the same purse — at 0.7 "mấy hàng cọc gỗ" came back as "mấy hàng quả".
//   guidance_scale is raised to compensate: stronger conditioning tracks the text more closely.
export const EMOTIONS = {
  neutral:  { speed: 1.0,  guidance_scale: 2.6, position_temperature: 6, class_temperature: 0.40 },
  dramatic: { speed: 0.95, guidance_scale: 3.0, position_temperature: 7, class_temperature: 0.50 },
  tense:    { speed: 1.0,  guidance_scale: 3.0, position_temperature: 7, class_temperature: 0.45 },
  somber:   { speed: 0.9,  guidance_scale: 2.8, position_temperature: 5, class_temperature: 0.35 },
  hopeful:  { speed: 0.98, guidance_scale: 2.7, position_temperature: 6, class_temperature: 0.45 },
  curious:  { speed: 1.0,  guidance_scale: 2.6, position_temperature: 7, class_temperature: 0.50 },
};

export const EMOTION_NAMES = Object.keys(EMOTIONS);

// Vietnamese + English keywords a free-text `cue:` may contain, mapped to a preset. First match
// wins, so order runs specific → generic; a cue like "trận đánh căng thẳng" resolves to `tense`.
const ALIASES = [
  [/dramatic|hùng|hào hùng|hoành tráng|khí thế|anh hùng|vinh quang|chiến thắng|khải hoàn/i, 'dramatic'],
  [/tense|căng|gấp|kịch tính|dồn dập|nguy|trận|chiến đấu|truy đuổi|phục kích/i, 'tense'],
  [/somber|trầm|buồn|bi ai|tang|phản bội|hy sinh|đau/i, 'somber'],
  [/hopeful|tự hào|hy vọng|tươi sáng|ấm áp|di sản|trường tồn|biết ơn/i, 'hopeful'],
  [/curious|hỏi|câu hỏi|thắc mắc|bình luận|tò mò|gợi mở/i, 'curious'],
  [/neutral|kể|dẫn chuyện|bối cảnh|giới thiệu|trung tính/i, 'neutral'],
];

// Resolve a free-text cue to a preset name: an exact preset name wins, else a keyword alias,
// else neutral.
export const emotionName = (cue) => {
  const c = String(cue ?? '').trim().toLowerCase();
  if (!c) return 'neutral';
  if (EMOTIONS[c]) return c;
  for (const [re, name] of ALIASES) if (re.test(c)) return name;
  return 'neutral';
};

// The param overrides for a cue plus the resolved preset name (for logging).
export const resolveEmotion = (cue) => {
  const name = emotionName(cue);
  return { name, params: EMOTIONS[name] };
};
