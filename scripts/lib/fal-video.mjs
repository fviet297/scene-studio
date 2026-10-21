// fal.ai image-to-video motion generation. Same call shape as replicate-video.mjs
// (scene, imagePath, outputDir, prompt, model, duration, onLog) so motion-video.mjs can route a
// `fal-ai/...` model id here. fal accepts a base64 data URI for image_url, so no upload step.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { falPredict, falOutputUrl } from './fal-client.mjs';
import { dataUri } from './replicate-image.mjs';
import { aspectInfo } from './aspect.mjs';

// fal image-to-video models offered in the review panel's motion-video picker.
export const FAL_VIDEO_MODELS = [
  'fal-ai/bytedance/seedance/v1/pro/image-to-video',
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
  'fal-ai/wan-25-preview/image-to-video',
  'fal-ai/veo3.1/image-to-video',
];

// Per-model extra input beyond prompt/image_url/duration. Resolution is fixed at 1080p where the
// model exposes it; the aspect ratio is injected per-project below. Veo generates audio by
// default, disabled here since narration is added later.
const MODEL_INPUTS = {
  'fal-ai/bytedance/seedance/v1/pro/image-to-video': { resolution: '1080p' },
  'fal-ai/wan-25-preview/image-to-video': { resolution: '1080p' },
  'fal-ai/veo3.1/image-to-video': { resolution: '1080p', generate_audio: false },
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': {},
};

// Models that accept an `aspect_ratio` field (the others follow the source image's ratio).
const ASPECT_RATIO_MODELS = new Set([
  'fal-ai/bytedance/seedance/v1/pro/image-to-video',
  'fal-ai/veo3.1/image-to-video',
]);

// Veo expects the duration as "6s"; the other models take a bare "6". motion-video.mjs already
// snapped `duration` to a value the model accepts, so only the format differs here.
const formatDuration = (model, duration) =>
  duration ? (model.startsWith('fal-ai/veo') ? `${duration}s` : String(duration)) : undefined;

export const generateSceneVideo = async ({ scene, imagePath, outputDir = 'public/scene-videos', prompt = '', model, duration, aspect, onLog, signal }) => {
  if (!existsSync(imagePath)) throw new Error(`Scene image not found: ${imagePath}`);
  const durationValue = formatDuration(model, duration);
  const input = {
    prompt: prompt || 'Subtle cinematic motion, preserve the historical illustration and character identity.',
    image_url: dataUri(imagePath),
    ...MODEL_INPUTS[model],
    ...(ASPECT_RATIO_MODELS.has(model) ? { aspect_ratio: aspectInfo(aspect).ratio } : {}),
    ...(durationValue ? { duration: durationValue } : {}),
  };
  onLog?.(`POST https://queue.fal.run/${model}`);
  onLog?.(`payload: model=${model}${durationValue ? `, duration=${durationValue}` : ''}`);
  const videoUrl = falOutputUrl(await falPredict(model, input, { onLog, signal }));
  onLog?.('job completed; video URL received');
  signal?.throwIfAborted(); // cancelled while the provider finished: keep the current clip

  const output = join(outputDir, `scene-${String(scene).padStart(2, '0')}.mp4`);
  mkdirSync(outputDir, { recursive: true });
  const videoResponse = await fetch(videoUrl);
  onLog?.(`download result: HTTP ${videoResponse.status}`);
  if (!videoResponse.ok) throw new Error(`fal video download ${videoResponse.status}`);
  writeFileSync(output, Buffer.from(await videoResponse.arrayBuffer()));
  onLog?.(`saved: ${output}`);
  return { output, model, videoUrl };
};
