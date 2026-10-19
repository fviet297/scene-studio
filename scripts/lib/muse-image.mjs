// Scene-image generation via a muse2api server (scripts/lib/muse-client.mjs). Flow:
//   POST /v1/images/tasks — prompt + aspect_ratio (+ reference_image to lock a reference)
//   GET  /v1/images/tasks/{id} — poll until completed, then read the media url
// replicate-image.mjs routes any `muse:<model>` image id here. Like VMedia, the server takes a
// single reference image, so a multi-character scene keeps only its first reference.
import { createTask, pollTask } from './muse-client.mjs';
import { aspectInfo } from './aspect.mjs';

// The server queues behind one shared browser and waits up to MUSE2API_IMAGE_TIMEOUT (240s by
// default) per image, so allow for queueing on top of that.
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 200; // 10 minutes

export const MUSE_IMAGE_MODELS = [
  { id: 'muse:muse-image', label: 'Muse Image — 1 tham chiếu, quota web miễn phí', price: 0 },
];

// Run one muse2api image model → { url, via }. `refDataUri` (optional, WITH the data: prefix)
// switches the server to reference-image (edit) mode.
export const museImageUrl = async (model, { prompt, refDataUri, aspect, onLog } = {}) => {
  const body = {
    model, prompt, aspect_ratio: aspectInfo(aspect).ratio, response_format: 'url',
    ...(refDataUri ? { reference_image: refDataUri } : {}),
  };
  onLog?.(`POST /v1/images/tasks model=${model} aspect=${body.aspect_ratio}${refDataUri ? ' (edit)' : ''}`);
  const id = await createTask('/v1/images/tasks', body, 'muse image');
  onLog?.(`task accepted: ${id}; polling for image`);
  const url = await pollTask('/v1/images/tasks', id, {
    intervalMs: POLL_INTERVAL_MS, maxAttempts: POLL_MAX_ATTEMPTS, label: 'muse image', onLog,
  });
  onLog?.('image URL received');
  return { url, via: `muse:${model}` };
};
