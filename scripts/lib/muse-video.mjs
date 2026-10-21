// Image-to-video via a muse2api server (scripts/lib/muse-client.mjs). Flow:
//   POST /v1/videos — prompt + duration + aspect_ratio + the scene image as reference_image
//                     (the server uses it as the strict first frame)
//   GET  /v1/videos/{id} — poll until completed, then download the MP4
// Same call shape as replicate-video.mjs so motion-video.mjs can route a `muse:<model>` id here;
// `duration` arrives already snapped to the server's allowed lengths.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTask, pollTask } from './muse-client.mjs';
import { dataUri } from './replicate-image.mjs';
import { aspectInfo } from './aspect.mjs';

// The server waits up to MUSE2API_VIDEO_TIMEOUT (600s by default) per video, plus queueing.
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 180; // 15 minutes

export const generateSceneVideo = async ({ scene, imagePath, outputDir = 'public/scene-videos', prompt = '', model, duration, aspect, onLog, signal }) => {
  if (!existsSync(imagePath)) throw new Error(`Scene image not found: ${imagePath}`);
  const museModel = model.slice('muse:'.length);
  const body = {
    model: museModel,
    prompt: prompt || 'Subtle cinematic motion, preserve the historical illustration and character identity.',
    aspect_ratio: aspectInfo(aspect).ratio,
    reference_image: dataUri(imagePath),
    ...(duration ? { duration } : {}),
  };
  onLog?.(`POST /v1/videos model=${museModel} aspect=${body.aspect_ratio} dur=${duration ?? '-'}`);
  const id = await createTask('/v1/videos', body, 'muse video');
  onLog?.(`job accepted: ${id}`);
  const videoUrl = await pollTask('/v1/videos', id, {
    intervalMs: POLL_INTERVAL_MS, maxAttempts: POLL_MAX_ATTEMPTS, label: 'muse video', onLog, signal,
  });
  signal?.throwIfAborted(); // cancelled while the provider finished: keep the current clip

  const output = join(outputDir, `scene-${String(scene).padStart(2, '0')}.mp4`);
  mkdirSync(outputDir, { recursive: true });
  const videoResponse = await fetch(videoUrl);
  onLog?.(`download result: HTTP ${videoResponse.status}`);
  if (!videoResponse.ok) throw new Error(`muse video download ${videoResponse.status}`);
  writeFileSync(output, Buffer.from(await videoResponse.arrayBuffer()));
  onLog?.(`saved: ${output}`);
  return { output, model, videoUrl };
};
