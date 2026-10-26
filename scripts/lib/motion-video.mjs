// Motion-video model picker + dispatcher. The review panel lets the user pick any model from
// MOTION_VIDEO_MODELS; this routes the call to the right provider (Replicate, Plenx AI or muse2api)
// so review-server.mjs stays provider-agnostic.
import { generateSceneVideo as replicateGenerate, VIDEO_MODELS as REPLICATE_MODELS, buildMotionPrompt } from './replicate-video.mjs';
import { generateSceneVideo as museGenerate } from './muse-video.mjs';
import { generateSceneVideo as plenxGenerate, PLENX_VIDEO_MODELS } from './plenx-video.mjs';

// Each Replicate model's allowed video length, so the generated clip never runs far longer than
// the scene's narration audio. `discrete` models only accept specific lengths; others accept any
// integer within [min, max].
const DURATION_RULES = {
  'xai/grok-imagine-video': { min: 1, max: 15 },
  'kwaivgi/kling-v2.5-turbo-pro': { discrete: [5, 10] },
  'bytedance/seedance-1-pro-fast': { min: 3, max: 12 },
  'wan-video/wan-2.5-i2v': { discrete: [5, 10] },
  'minimax/hailuo-2.3-fast': { discrete: [6, 10] },
  // muse2api (scripts/lib/muse-video.mjs) — lengths its README accepts; the final clip length is
  // decided upstream by Muse.
  'muse:muse-video': { discrete: [5, 6, 8, 10] },
  // Plenx AI Video Omni (scripts/lib/plenx-video.mjs), lengths per plenxai.com/api/v1/developer/models
  'plenx:omni-flash-video': { min: 3, max: 10 },
  'plenx:flux-3': { min: 5, max: 20 },
};

// Human-readable allowed-length hint for the UI's duration box. Discrete models list their exact
// values (a non-matching entry snaps up to the next one); range models show min–max.
const describeDurationRule = (rule) =>
  !rule ? 'độ dài bất kỳ' : rule.discrete ? `chỉ ${rule.discrete.join(' / ')}s` : `${rule.min}–${rule.max}s`;

const MUSE_VIDEO_MODEL = 'muse:muse-video';

export const MOTION_VIDEO_MODELS = [
  ...REPLICATE_MODELS.map((id) => ({ id, label: id, durations: describeDurationRule(DURATION_RULES[id]) })),
  ...PLENX_VIDEO_MODELS.map((id) => ({ id, label: id.slice('plenx:'.length), durations: describeDurationRule(DURATION_RULES[id]) })),
  { id: MUSE_VIDEO_MODEL, label: 'Muse Video — quota web miễn phí', durations: describeDurationRule(DURATION_RULES[MUSE_VIDEO_MODEL]) },
];

export { buildMotionPrompt };

// Smallest allowed duration that still covers the audio, so the clip isn't padded much past where
// the narration ends; falls back to the model's longest option if the audio outruns it. Used for
// Replicate and muse2api.
const pickDuration = (model, audioSeconds) => {
  const rule = DURATION_RULES[model];
  if (!rule || !Number.isFinite(audioSeconds)) return undefined;
  if (rule.discrete) return rule.discrete.find((d) => d >= audioSeconds) ?? rule.discrete[rule.discrete.length - 1];
  return Math.min(rule.max, Math.max(rule.min, Math.ceil(audioSeconds)));
};

// `requested` (seconds) is an optional user override from the review panel's duration box; when
// absent the clip length is matched to the narration audio. The target is snapped to the model's
// allowed lengths of the chosen model.
export const generateSceneVideo = async ({ model, audioSeconds, duration: requested, ...rest }) => {
  const target = Number.isFinite(requested) && requested > 0 ? requested : audioSeconds;
  const duration = pickDuration(model, target);
  if (model.startsWith('muse:')) return museGenerate({ ...rest, model, duration });
  if (model.startsWith('plenx:')) return plenxGenerate({ ...rest, model, duration });
  return replicateGenerate({ ...rest, model, duration });
};
