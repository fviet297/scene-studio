// Image-to-video motion generation via Replicate. Replaces the earlier VMedia integration;
// keeps the same call shape (scene, imagePath, outputDir, prompt, onLog) plus an added `model`
// so review-server.mjs's motion-video endpoint can pass through the UI's model choice.
//
// Requires REPLICATE_API_TOKEN (shared with replicate-image.mjs).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { predict, dataUri } from './replicate-image.mjs';

// Curated image-to-video models offered in the review panel's model picker. wan-video is first,
// so it is the panel's default selection and the DEFAULT_MODEL fallback below.
export const VIDEO_MODELS = [
  'wan-video/wan-2.5-i2v',
  'xai/grok-imagine-video',
  'kwaivgi/kling-v2.5-turbo-pro',
  'bytedance/seedance-1-pro-fast',
  'minimax/hailuo-2.3-fast',
];
const DEFAULT_MODEL = VIDEO_MODELS[0];

// Each model names its image-to-video input field differently.
const IMAGE_FIELD = {
  'xai/grok-imagine-video': 'image',
  'kwaivgi/kling-v2.5-turbo-pro': 'start_image',
  'bytedance/seedance-1-pro-fast': 'image',
  'wan-video/wan-2.5-i2v': 'image',
  'minimax/hailuo-2.3-fast': 'first_frame_image',
};

export const buildMotionPrompt = ({ narration = '', scenePrompt = '' }) => [
  'Animate this existing 2D historical illustration as a restrained cinematic image-to-video shot.',
  'Preserve the exact character identity, face, costume, proportions, colors, architecture, props, and composition from the source image.',
  'Do not redesign the character, add new people or objects, change the historical period, or introduce text, symbols, watermark, or camera cuts.',
  'Use only subtle natural motion: small cloth and water movement, and minimal believable background motion.',
  `Historical context and intended action: ${narration.trim() || 'preserve the scene action from the source image.'}`,
  scenePrompt.trim() ? `Source scene specification: ${scenePrompt.trim()}` : '',
].filter(Boolean).join('\n');

export const generateSceneVideo = async ({ scene, imagePath, outputDir = 'public/scene-videos', prompt = '', model, duration, onLog }) => {
  if (!existsSync(imagePath)) throw new Error(`Scene image not found: ${imagePath}`);
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('Missing REPLICATE_API_TOKEN in .env');
  const chosenModel = model || process.env.REPLICATE_VIDEO_MODEL || DEFAULT_MODEL;
  const imageField = IMAGE_FIELD[chosenModel];
  if (!imageField) throw new Error(`Unknown motion video model: ${chosenModel}`);

  const input = {
    prompt: prompt || 'Subtle cinematic motion, preserve the historical illustration and character identity.',
    [imageField]: dataUri(imagePath),
    ...(duration ? { duration } : {}),
  };
  onLog?.(`POST https://api.replicate.com/v1/models/${chosenModel}/predictions`);
  onLog?.(`payload: model=${chosenModel}${duration ? `, duration=${duration}` : ''}`);
  const videoUrl = await predict(token, chosenModel, input);
  onLog?.('job completed; video URL received');

  const output = join(outputDir, `scene-${String(scene).padStart(2, '0')}.mp4`);
  mkdirSync(outputDir, { recursive: true });
  const videoResponse = await fetch(videoUrl);
  onLog?.(`download result: HTTP ${videoResponse.status}`);
  if (!videoResponse.ok) throw new Error(`Replicate video download ${videoResponse.status}`);
  writeFileSync(output, Buffer.from(await videoResponse.arrayBuffer()));
  onLog?.(`saved: ${output}`);
  return { output, model: chosenModel, videoUrl };
};
