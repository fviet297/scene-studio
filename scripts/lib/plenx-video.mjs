// Image-to-video via Plenx AI's Video Omni endpoint (scripts/lib/plenx-client.mjs). Flow:
//   POST /developer/media-upload/direct — the scene image → a public URL
//   POST /developer/generate/video-omni — prompt + input_image_url (I2V) + duration + aspect_ratio
//   GET  /developer/status/{task_id}    — poll until completed, then download result_url
// Same call shape as replicate-video.mjs so motion-video.mjs can route a `plenx:<model>` id here;
// `duration` arrives already snapped to the model's allowed lengths. The server picks the model's
// default server (priced in credits at plenxai.com/api/v1/developer/models).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createTask, pollTask, uploadImage } from './plenx-client.mjs';
import { dataUri } from './replicate-image.mjs';
import { aspectInfo } from './aspect.mjs';

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 300; // 20 minutes
// Resolution per model, from the prices of each model's default server at
// plenxai.com/api/v1/developer/models: omni-flash-video has 1080p (2 credits/s, 720p is 1);
// flux-3 has only 720p there (1080p exists only on the 7x dearer PCS server). Unlisted models get
// 720p, the one resolution every server offers. PLENX_VIDEO_RESOLUTION overrides them all.
const MODEL_RESOLUTION = { 'omni-flash-video': '1080p', 'flux-3': '720p' };
const FALLBACK_RESOLUTION = '720p';
const DEFAULT_PROMPT = 'Subtle cinematic motion, preserve the historical illustration and character identity.';

// Models that accept `generate_audio`; the narration is recorded separately, so it is switched off.
// Other models (omni-flash-video) take no such field and are left alone.
const AUDIO_TOGGLE = /^(seedance-|flux-3$|kling-4\.0|minimax-h3)/;

export const PLENX_VIDEO_MODELS = ['plenx:omni-flash-video', 'plenx:flux-3'];

const requestBody = ({ model, prompt, imageUrl, duration, aspect }) => ({
  model,
  prompt: prompt || DEFAULT_PROMPT,
  input_image_url: imageUrl,
  aspect_ratio: aspectInfo(aspect).ratio,
  resolution: process.env.PLENX_VIDEO_RESOLUTION || MODEL_RESOLUTION[model] || FALLBACK_RESOLUTION,
  ...(duration ? { duration } : {}),
  ...(AUDIO_TOGGLE.test(model) ? { generate_audio: false } : {}),
});

const downloadVideo = async (videoUrl, output, onLog) => {
  const response = await fetch(videoUrl);
  onLog?.(`download result: HTTP ${response.status}`);
  if (!response.ok) throw new Error(`plenx video download ${response.status}`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, Buffer.from(await response.arrayBuffer()));
};

export const generateSceneVideo = async ({
  scene, imagePath, outputDir = 'public/scene-videos', prompt = '', model, duration, aspect, onLog, signal,
  pollIntervalMs = POLL_INTERVAL_MS,
}) => {
  if (!existsSync(imagePath)) throw new Error(`Scene image not found: ${imagePath}`);
  const sceneName = `scene-${String(scene).padStart(2, '0')}`;
  const plenxModel = model.slice('plenx:'.length);

  onLog?.('uploading scene image to Plenx');
  const imageUrl = await uploadImage(dataUri(imagePath), `${sceneName}.jpg`, onLog);
  const body = requestBody({ model: plenxModel, prompt, imageUrl, duration, aspect });
  onLog?.(`POST /developer/generate/video-omni model=${plenxModel} aspect=${body.aspect_ratio} dur=${duration ?? '-'} res=${body.resolution}`);
  const taskId = await createTask('/developer/generate/video-omni', body, 'plenx video');
  onLog?.(`task accepted: ${taskId}`);
  const videoUrl = await pollTask(taskId, {
    intervalMs: pollIntervalMs, maxAttempts: POLL_MAX_ATTEMPTS, label: 'plenx video', onLog, signal,
  });
  signal?.throwIfAborted(); // cancelled while the provider finished: keep the current clip

  const output = join(outputDir, `${sceneName}.mp4`);
  await downloadVideo(videoUrl, output, onLog);
  onLog?.(`saved: ${output}`);
  return { output, model, videoUrl };
};
