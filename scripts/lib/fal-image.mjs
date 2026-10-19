// fal.ai scene-image generation. Provides the fal entries for the review panel's image-model
// picker and shapes each model's input, so replicate-image.mjs can route a `fal-ai/...` model id
// here instead of to Replicate. fal accepts base64 data URIs for image_urls, so references are
// passed the same way as the Replicate path (no separate upload step).
import { falPredict, falOutputUrl } from './fal-client.mjs';
import { aspectInfo } from './aspect.mjs';

// fal image models offered in the picker. `id` is the edit (image-to-image) endpoint — the common
// case, since most scenes lock a character reference. A no-reference (text-to-image) scene is
// auto-routed to the model's text sibling below, mirroring how the Replicate models transparently
// handle both a referenced and an unreferenced scene.
export const FAL_IMAGE_MODELS = [
  { id: 'fal-ai/bytedance/seedream/v4/edit', label: 'Seedream v4 — nhiều tham chiếu, giữ mặt từng người tốt nhất', price: null },
  { id: 'fal-ai/nano-banana/edit', label: 'Nano Banana / Gemini — nhanh, nhiều tham chiếu', price: null },
];

const TEXT_SIBLING = {
  'fal-ai/bytedance/seedream/v4/edit': 'fal-ai/bytedance/seedream/v4/text-to-image',
  'fal-ai/nano-banana/edit': 'fal-ai/nano-banana',
};

// Shape one model's input. Seedream uses image_size presets; nano-banana uses aspect_ratio. Both
// take an image_urls array of references (data URIs) that is simply omitted on a text-to-image call.
const buildFalImageInput = (model, { prompt, refUris, aspect }) => {
  const hasRefs = refUris.length > 0;
  const info = aspectInfo(aspect);
  if (model.startsWith('fal-ai/bytedance/seedream')) {
    return { prompt, image_size: info.falImageSize, num_images: 1, ...(hasRefs ? { image_urls: refUris } : {}) };
  }
  // nano-banana (Gemini): aspect_ratio instead of image_size, jpeg out to match the .jpg pipeline.
  return { prompt, aspect_ratio: info.ratio, num_images: 1, output_format: 'jpeg', ...(hasRefs ? { image_urls: refUris } : {}) };
};

// Run one fal image model → returns { url, via }. `refUris` are base64 data URIs (already built by
// the caller); an empty array routes to the text-to-image sibling endpoint.
export const falImageUrl = async (model, { prompt, refUris = [], aspect, onLog } = {}) => {
  const endpoint = refUris.length ? model : (TEXT_SIBLING[model] ?? model);
  onLog?.(`fal image model=${endpoint}, refs=${refUris.length}`);
  onLog?.(`POST https://queue.fal.run/${endpoint}`);
  const result = await falPredict(endpoint, buildFalImageInput(endpoint, { prompt, refUris, aspect }), { onLog });
  onLog?.('prediction succeeded; image URL received');
  return { url: falOutputUrl(result), via: endpoint };
};
