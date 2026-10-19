// Motion-video model picker + dispatcher. The review panel lets the user pick any model from
// MOTION_VIDEO_MODELS; this routes the call to the right provider (Replicate, fal, Gommo/VMedia, or muse2api)
// so review-server.mjs stays provider-agnostic.
import { generateSceneVideo as replicateGenerate, VIDEO_MODELS as REPLICATE_MODELS, buildMotionPrompt } from './replicate-video.mjs';
import { generateSceneVideo as vmediaGenerate } from './vmedia-video.mjs';
import { generateSceneVideo as falGenerate, FAL_VIDEO_MODELS } from './fal-video.mjs';
import { generateSceneVideo as museGenerate } from './muse-video.mjs';

// VMedia (Gommo) image-to-video slugs offered in the picker, read from VMEDIA_VIDEO_MODELS
// (comma-separated); each becomes a "vmedia:<slug>" entry. Slugs come from POST /ai/models
// type=video. Falls back to VMEDIA_VIDEO_MODEL then a curated default set. vmedia-video.mjs snaps
// the request to each model's live capabilities, so adding a slug the account has needs only env.
const VMEDIA_DEFAULT = 'veo_3_1,wan_2_5,kling_video_2_5,seedance_20_pro,hailuo_2_3';
const vmediaSlugs = () => (process.env.VMEDIA_VIDEO_MODELS ?? process.env.VMEDIA_VIDEO_MODEL ?? VMEDIA_DEFAULT)
  .split(',').map((slug) => slug.trim()).filter(Boolean);
const VMEDIA_MODELS = vmediaSlugs().map((slug) => ({ id: `vmedia:${slug}`, label: slug, durations: 'làm tròn theo model' }));

// Each Replicate/fal model's allowed video length, so the generated clip never runs far longer than
// the scene's narration audio. `discrete` models only accept specific lengths; others accept any
// integer within [min, max]. (VMedia durations are read live per model, not listed here.)
const DURATION_RULES = {
  'xai/grok-imagine-video': { min: 1, max: 15 },
  'kwaivgi/kling-v2.5-turbo-pro': { discrete: [5, 10] },
  'bytedance/seedance-1-pro-fast': { min: 3, max: 12 },
  'wan-video/wan-2.5-i2v': { discrete: [5, 10] },
  'minimax/hailuo-2.3-fast': { discrete: [6, 10] },
  // fal image-to-video (scripts/lib/fal-video.mjs)
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': { min: 3, max: 12 },
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': { discrete: [5, 10] },
  'fal-ai/wan-25-preview/image-to-video': { discrete: [5, 10] },
  'fal-ai/veo3.1/image-to-video': { discrete: [4, 6, 8] },
  // muse2api (scripts/lib/muse-video.mjs) — lengths its README accepts; the final clip length is
  // decided upstream by Muse.
  'muse:muse-video': { discrete: [5, 6, 8, 10] },
};

// Human-readable allowed-length hint for the UI's duration box. Discrete models list their exact
// values (a non-matching entry snaps up to the next one); range models show min–max.
const describeDurationRule = (rule) =>
  !rule ? 'độ dài bất kỳ' : rule.discrete ? `chỉ ${rule.discrete.join(' / ')}s` : `${rule.min}–${rule.max}s`;

// fal ids are long endpoint paths; the picker groups by provider, so the label keeps only the
// model part ("kling-video/v2.5-turbo/pro").
const falLabel = (id) => id.replace(/^fal-ai\//, '').replace(/\/image-to-video$/, '');

// muse2api video is not listed: muse.ai currently refuses video generation by region. Its
// dispatch branch below stays, reachable by typing `muse:muse-video` into the custom-model field.
export const MOTION_VIDEO_MODELS = [
  ...REPLICATE_MODELS.map((id) => ({ id, label: id, durations: describeDurationRule(DURATION_RULES[id]) })),
  ...FAL_VIDEO_MODELS.map((id) => ({ id, label: falLabel(id), durations: describeDurationRule(DURATION_RULES[id]) })),
  ...VMEDIA_MODELS,
];

export { buildMotionPrompt };

// Smallest allowed duration that still covers the audio, so the clip isn't padded much past where
// the narration ends; falls back to the model's longest option if the audio outruns it. Used for
// Replicate/fal only — VMedia snaps against its live per-model durations in vmedia-video.mjs.
const pickDuration = (model, audioSeconds) => {
  const rule = DURATION_RULES[model];
  if (!rule || !Number.isFinite(audioSeconds)) return undefined;
  if (rule.discrete) return rule.discrete.find((d) => d >= audioSeconds) ?? rule.discrete[rule.discrete.length - 1];
  return Math.min(rule.max, Math.max(rule.min, Math.ceil(audioSeconds)));
};

// `requested` (seconds) is an optional user override from the review panel's duration box; when
// absent the clip length is matched to the narration audio. The target is snapped to the model's
// allowed lengths (by Replicate/fal here, or by vmedia-video.mjs from live capabilities).
export const generateSceneVideo = async ({ model, audioSeconds, duration: requested, ...rest }) => {
  const target = Number.isFinite(requested) && requested > 0 ? requested : audioSeconds;
  if (model.startsWith('vmedia:')) return vmediaGenerate({ ...rest, targetSeconds: target, vmediaModel: model.slice('vmedia:'.length) });
  const duration = pickDuration(model, target);
  if (model.startsWith('fal-ai/')) return falGenerate({ ...rest, model, duration });
  if (model.startsWith('muse:')) return museGenerate({ ...rest, model, duration });
  return replicateGenerate({ ...rest, model, duration });
};
