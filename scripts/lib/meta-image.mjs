// Scene-image generation via the Meta Model API (api.meta.ai, model `muse-image-1.0`).
// replicate-image.mjs routes any `meta:<model>` id here. It speaks the OpenAI Images protocol
// (openai-image.mjs): `size` is read as an aspect ratio only (the model picks its own resolution).
// Meta has no video generation model, so there is no motion counterpart to this file.
import { openaiImageUrl } from './openai-image.mjs';
import { builtinDefault } from './model-config.mjs';

export const META_IMAGE_MODELS = [
  { id: 'meta:muse-image-1.0', label: 'Muse Image 1.0 — nhiều tham chiếu (~$0.01/ảnh)', price: 0.01 },
];

const apiKey = () => {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error('MODEL_API_KEY not set (Meta Model API key, put it in .env or the model manager).');
  return key;
};

// Run one Meta image model → { url, via }. `refUris` are base64 data URIs.
export const metaImageUrl = (model, { prompt, refUris = [], size, onLog } = {}) => openaiImageUrl({
  label: 'meta',
  baseUrl: (process.env.META_BASE_URL ?? builtinDefault('meta', 'baseUrl')).replace(/\/+$/, ''),
  apiKey: apiKey(),
  model, prompt, refUris, size, onLog,
});
