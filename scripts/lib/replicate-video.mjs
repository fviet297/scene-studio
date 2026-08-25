// Image-to-video motion generation via Replicate. Replaces the earlier VMedia integration;
// keeps the same call shape (scene, imagePath, outputDir, prompt, onLog) plus an added `model`
// so review-server.mjs's motion-video endpoint can pass through the UI's model choice.
//
// Requires REPLICATE_API_TOKEN (shared with replicate-image.mjs).

import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { predict, dataUri } from './replicate-image.mjs';

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
const TIKTOK_WIDTH = 1088;
const TIKTOK_HEIGHT = 1920;

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

const assertTikTokResolution = (videoPath) => {
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
  if (width !== TIKTOK_WIDTH || height !== TIKTOK_HEIGHT) {
    throw new Error(
      `Expected ${TIKTOK_WIDTH}x${TIKTOK_HEIGHT}, received ${width}x${height}`,
    );
  }
};

// Fallback motion prompt when a scene has no hand-written `motion:` in the plan. Keeps the same
// house style lsvn authors by hand: animate-not-redesign, locked camera, matched environmental
// motion, stable character, stated intensity, artifact ban. The image `prompt` (English) hints
// at which elements can move; narration is intentionally NOT injected — it is Vietnamese and only
// confuses the image-to-video model. For per-scene control, author `motion:` in the plan instead.
export const buildMotionPrompt = ({ narration = '', scenePrompt = '' }) => [
  'Animate this existing historical illustration into a lively, cute, cinematic image-to-video shot.',
  'Preserve the exact character identity, face, hairstyle, costume, body proportions, colors, props, soldiers, architecture, lighting, and composition from the source image. Do not redesign, morph, replace, add, or remove any character or object. Do not change the historical period or visual style. No text, symbols, logos, or watermark.',
  'Keep the camera completely locked. No camera movement, zoom, pan, tilt, orbit, dolly, perspective shift, or scene transition.',
  'Create gentle, charming environmental motion: cloth, robes, sleeves and banners sway in a soft breeze; grass and reeds bend; water ripples and reflects; mist or dust drifts slowly; background figures make tiny natural idle movements while holding their formation.',
  scenePrompt.trim() ? `Elements present in this scene (animate only what is visible, do not add anything): ${scenePrompt.trim()}` : '',
  'Keep the main character(s) stable, recognizable, and visually consistent throughout. Do not change their facial expressions or poses. Use lively secondary motion rather than strong character animation. The scene should feel like a charming animated historical diorama: warm, playful, cinematic, and alive while remaining believable.',
  'Motion intensity: low to medium. Character motion: very subtle. Environmental motion: moderate and natural.',
  'No facial deformation, body morphing, warped limbs, extra fingers, duplicated soldiers, melting objects, sudden movements, exaggerated physics, or visual artifacts.',
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
    ...MODEL_INPUTS[chosenModel],
    ...(duration ? { duration } : {}),
  };
  onLog?.(`POST https://api.replicate.com/v1/models/${chosenModel}/predictions`);
  onLog?.(`payload: model=${chosenModel}${duration ? `, duration=${duration}` : ''}`);
  const videoUrl = await predict(token, chosenModel, input);
  onLog?.('job completed; video URL received');

  const output = join(outputDir, `scene-${String(scene).padStart(2, '0')}.mp4`);
  const temporaryOutput = `${output}.tmp`;
  mkdirSync(outputDir, { recursive: true });
  const videoResponse = await fetch(videoUrl);
  onLog?.(`download result: HTTP ${videoResponse.status}`);
  if (!videoResponse.ok) throw new Error(`Replicate video download ${videoResponse.status}`);
  writeFileSync(temporaryOutput, Buffer.from(await videoResponse.arrayBuffer()));
  try {
    assertTikTokResolution(temporaryOutput);
    renameSync(temporaryOutput, output);
  } catch (error) {
    unlinkSync(temporaryOutput);
    throw error;
  }
  onLog?.(`saved: ${output}`);
  return { output, model: chosenModel, videoUrl };
};
