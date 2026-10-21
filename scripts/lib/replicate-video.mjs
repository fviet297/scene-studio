// Image-to-video motion generation via Replicate. Replaces the earlier VMedia integration;
// keeps the same call shape (scene, imagePath, outputDir, prompt, onLog) plus an added `model`
// so review-server.mjs's motion-video endpoint can pass through the UI's model choice.
//
// Requires REPLICATE_API_TOKEN (shared with replicate-image.mjs).

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { predict, dataUri } from './replicate-image.mjs';
import { aspectInfo } from './aspect.mjs';

// Curated image-to-video models offered in the review panel's model picker. Seedance is first
// so 1080p TikTok-ready output is the panel's default selection and fallback.
export const VIDEO_MODELS = [
  'bytedance/seedance-1-pro-fast',
  'wan-video/wan-2.5-i2v',
  'xai/grok-imagine-video',
  'kwaivgi/kling-v2.5-turbo-pro',
  'minimax/hailuo-2.3-fast',
];
const DEFAULT_MODEL = 'bytedance/seedance-1-pro-fast';
// Minimum long-edge every provider must clear; the orientation (portrait vs landscape) is checked
// against the project aspect instead of an exact WxH, since each model rounds 1080p differently.
const MIN_LONG_EDGE = 1080;
const MIN_SHORT_EDGE = 600;

// Models that accept an `aspect_ratio` field (others follow the source image's ratio).
const ASPECT_RATIO_MODELS = new Set(['bytedance/seedance-1-pro-fast']);

// Each model names its image-to-video input field differently.
const IMAGE_FIELD = {
  'xai/grok-imagine-video': 'image',
  'kwaivgi/kling-v2.5-turbo-pro': 'start_image',
  'bytedance/seedance-1-pro-fast': 'image',
  'wan-video/wan-2.5-i2v': 'image',
  'minimax/hailuo-2.3-fast': 'first_frame_image',
};

const MODEL_INPUTS = {
  'bytedance/seedance-1-pro-fast': {
    fps: 24,
    resolution: '1080p',
  },
};

const assertResolution = (videoPath, aspect) => {
  const metadata = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      videoPath,
    ],
    { encoding: 'utf8' },
  ).trim();
  const [width, height] = metadata.split(',').map(Number);
  const info = aspectInfo(aspect);
  const wantLandscape = info.orientation === 'horizontal';
  const isLandscape = width > height;
  if (info.orientation !== 'square' && wantLandscape !== isLandscape) {
    throw new Error(`Expected ${info.orientation} (${info.ratio}) video, received ${width}x${height}`);
  }
  if (Math.max(width, height) < MIN_LONG_EDGE || Math.min(width, height) < MIN_SHORT_EDGE) {
    throw new Error(`Video too small for ${info.ratio}: received ${width}x${height}`);
  }
};

// Fallback motion prompt when a scene has no hand-written `motion:` in the plan. Follows the same
// house style lsvn/trangca author by hand: camera move, main action, strong environmental motion,
// identity/style lock only. Composition is deliberately NOT locked — "preserve the composition /
// do not add or remove anything" makes image-to-video models return a near-still frame. The image
// `prompt` (English) hints at which elements can move; narration is intentionally NOT injected —
// it is Vietnamese and only confuses the model. For per-scene control, author `motion:` instead.
export const buildMotionPrompt = ({ narration = '', scenePrompt = '' }) => [
  'Animate this historical illustration into a dynamic cinematic shot with clearly visible motion from the first second.',
  'The camera moves with purpose: a steady push-in or a tracking move that follows the main action.',
  scenePrompt.trim() ? `The main character performs the action of this scene with clear, natural movement, and the surroundings come alive: ${scenePrompt.trim()}` : 'The main character moves clearly and naturally, and the surroundings come alive.',
  'Wind, water, fire, smoke, banners and background figures move strongly and continuously across the whole frame.',
  'Keep the characters\' faces and costumes and the art style consistent; no new characters, no text or watermark.',
  'Motion intensity medium to high, character motion clear and natural, environmental motion strong across the whole frame.',
  'No face deformation, warped limbs, extra fingers, duplicated people, morphing objects.',
].join('\n');

export const generateSceneVideo = async ({ scene, imagePath, outputDir = 'public/scene-videos', prompt = '', model, duration, aspect, onLog, signal }) => {
  if (!existsSync(imagePath)) throw new Error(`Scene image not found: ${imagePath}`);
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('Missing REPLICATE_API_TOKEN in .env');
  const chosenModel = model || process.env.REPLICATE_VIDEO_MODEL || DEFAULT_MODEL;
  const imageField = IMAGE_FIELD[chosenModel];
  if (!imageField) throw new Error(`Unknown motion video model: ${chosenModel}`);

  const input = {
    prompt: prompt || 'Subtle cinematic motion, preserve the historical illustration and character identity.',
    [imageField]: dataUri(imagePath),
    ...MODEL_INPUTS[chosenModel],
    ...(ASPECT_RATIO_MODELS.has(chosenModel) ? { aspect_ratio: aspectInfo(aspect).ratio } : {}),
    ...(duration ? { duration } : {}),
  };
  onLog?.(`POST https://api.replicate.com/v1/models/${chosenModel}/predictions`);
  onLog?.(`payload: model=${chosenModel}${duration ? `, duration=${duration}` : ''}`);
  const videoUrl = await predict(token, chosenModel, input, { signal });
  onLog?.('job completed; video URL received');
  signal?.throwIfAborted(); // cancelled while the provider finished: keep the current clip

  const output = join(outputDir, `scene-${String(scene).padStart(2, '0')}.mp4`);
  const temporaryOutput = `${output}.tmp`;
  mkdirSync(outputDir, { recursive: true });
  const videoResponse = await fetch(videoUrl);
  onLog?.(`download result: HTTP ${videoResponse.status}`);
  if (!videoResponse.ok) throw new Error(`Replicate video download ${videoResponse.status}`);
  writeFileSync(temporaryOutput, Buffer.from(await videoResponse.arrayBuffer()));
  try {
    assertResolution(temporaryOutput, aspect);
    renameSync(temporaryOutput, output);
  } catch (error) {
    unlinkSync(temporaryOutput);
    throw error;
  }
  onLog?.(`saved: ${output}`);
  return { output, model: chosenModel, videoUrl };
};
