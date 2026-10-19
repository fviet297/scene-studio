// Scene-image generation via the Gommo AI API (api.gommo.net, the "VMedia" service). Flow:
//   POST /ai/generateImage — model + prompt (+ editImage/base64Image to lock a reference)
//   POST /ai/image — poll until status SUCCESS, then read the image url
// replicate-image.mjs routes any `vmedia:<slug>` image model here. Reference locking uses a single
// base64 image (edit mode); multi-reference scenes fall back to that one reference.
import { gommoPost, getModelCaps, pickCap, projectId } from './gommo-client.mjs';
import { aspectInfo } from './aspect.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Curated Gommo image models offered in the picker; override via VMEDIA_IMAGE_MODELS
// (comma-separated slugs, e.g. "seedream_5_0,google_image_gen_banana_pro"). Slugs come from
// POST /ai/models type=image.
const imageSlugs = () => (process.env.VMEDIA_IMAGE_MODELS ?? 'google_image_gen_banana_pro,seedream_4_5,seedream_5_0')
  .split(',').map((slug) => slug.trim()).filter(Boolean);
export const VMEDIA_IMAGE_MODELS = imageSlugs().map((slug) => ({ id: `vmedia:${slug}`, label: slug, price: null }));

// generateImage's ratio uses underscores (9_16 | 16_9 | 1_1); the project's aspect maps to one.

// Poll /ai/image. The status body wraps the fields in `imageInfo`; match status on a substring
// (SUCCESS / ERROR appear in both the short and long forms). Seedream 2K can take several minutes.
const pollImage = async (id, log) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    await wait(3000);
    const state = await gommoPost('/ai/image', { id_base: id }, { label: `gommo image status ${id}` });
    const info = state?.imageInfo ?? state;
    const status = String(info?.status ?? '');
    log?.(`poll ${attempt + 1}/120: ${status || 'pending'}`);
    if (/SUCCESS/i.test(status) && info.url) return info.url;
    if (/ERROR|FAIL/i.test(status)) throw new Error(`gommo image ${id} failed: ${info.status_message || info.message || JSON.stringify(info).slice(0, 200)}`);
  }
  throw new Error('gommo image generation timed out.');
};

// Run one Gommo image model → { url, via }. `refDataUri` (optional, WITH the data: prefix) switches
// to edit mode locking to that single reference image.
export const vmediaImageUrl = async (slug, { prompt, refDataUri, aspect, onLog } = {}) => {
  const caps = await getModelCaps('image', slug); // validates the slug; throws a slug list otherwise
  // Some models require `resolution` and `mode`; snap each to a value the model declares (caps use
  // `modes` for images, `mode`/`modes` for video). Cheapest/most balanced option preferred first.
  const resolution = pickCap(caps.resolutions, [process.env.VMEDIA_IMAGE_RESOLUTION ?? '4k', '4k', '1k']);
  // Gommo image models expose VIP-tier modes (standard/relaxed are often disabled), so prefer vip.
  const mode = pickCap(caps.modes ?? caps.mode, [process.env.VMEDIA_IMAGE_MODE ?? 'vip', 'vip']);
  const params = {
    action_type: 'create', model: slug, prompt, project_id: projectId(), ratio: aspectInfo(aspect).vmediaImage,
    ...(resolution ? { resolution } : {}),
    ...(mode ? { mode } : {}),
    ...(refDataUri ? { editImage: 'true', base64Image: refDataUri } : {}),
  };
  onLog?.(`POST /ai/generateImage model=${slug} res=${resolution ?? '-'} mode=${mode ?? '-'}${refDataUri ? ' (edit)' : ''}`);
  const created = await gommoPost('/ai/generateImage', params, { label: 'gommo generateImage' });
  const id = created?.imageInfo?.id_base;
  if (!id) throw new Error(`gommo generateImage returned no id_base: ${JSON.stringify(created).slice(0, 300)}`);
  onLog?.('prediction accepted; polling for image');
  const url = await pollImage(id, onLog);
  onLog?.('image URL received');
  return { url, via: `vmedia:${slug}` };
};
