// Motion-video model picker + dispatcher. The review panel lets the user pick any model from
// MOTION_VIDEO_MODELS; this routes the call to the right provider (Replicate or the original
// VMedia integration) so review-server.mjs stays provider-agnostic.
import { generateSceneVideo as replicateGenerate, VIDEO_MODELS as REPLICATE_MODELS, buildMotionPrompt } from './replicate-video.mjs';
import { generateSceneVideo as vmediaGenerate } from './vmedia-video.mjs';

// The id routes to VMedia; the label shown in the UI names its underlying model
// (configured via VMEDIA_VIDEO_MODEL, wan_2_5 by default — see .env.example).
const VMEDIA_MODEL = { id: 'vmedia:wan_2_5', label: 'wan_2_5 (VMedia)', provider: 'vmedia' };

export const MOTION_VIDEO_MODELS = [
  ...REPLICATE_MODELS.map((id) => ({ id, label: id, provider: 'replicate' })),
  VMEDIA_MODEL,
];

export { buildMotionPrompt };

// Each model's allowed video length, so the generated clip never runs far longer than the
// scene's narration audio. `discrete` models only accept specific lengths; others accept any
// integer within [min, max].
const DURATION_RULES = {
  'xai/grok-imagine-video': { min: 1, max: 15 },
  'kwaivgi/kling-v2.5-turbo-pro': { discrete: [5, 10] },
  'bytedance/seedance-1-pro-fast': { min: 3, max: 12 },
  'wan-video/wan-2.5-i2v': { discrete: [5, 10] },
  'minimax/hailuo-2.3-fast': { discrete: [6, 10] },
  [VMEDIA_MODEL.id]: { min: 3, max: 10 },
};

// Smallest allowed duration that still covers the audio, so the clip isn't padded much past
// where the narration ends; falls back to the model's longest option if the audio outruns it.
const pickDuration = (model, audioSeconds) => {
  const rule = DURATION_RULES[model];
  if (!rule || !Number.isFinite(audioSeconds)) return undefined;
  if (rule.discrete) return rule.discrete.find((d) => d >= audioSeconds) ?? rule.discrete[rule.discrete.length - 1];
  return Math.min(rule.max, Math.max(rule.min, Math.ceil(audioSeconds)));
};

export const generateSceneVideo = async ({ model, audioSeconds, ...rest }) => {
  const duration = pickDuration(model, audioSeconds);
  if (model === VMEDIA_MODEL.id) return vmediaGenerate({ ...rest, duration });
  return replicateGenerate({ ...rest, model, duration });
};
