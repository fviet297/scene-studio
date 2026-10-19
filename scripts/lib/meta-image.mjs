// Scene-image generation via the Meta Model API (api.meta.ai, model `muse-image-1.0`).
// replicate-image.mjs routes any `meta:<model>` id here. OpenAI Images-compatible, synchronous:
//   POST /v1/images/generations — text-to-image
//   POST /v1/images/edits       — JSON body with an `images` array; takes several references, so a
//                                 multi-character scene keeps every face (unlike VMedia's single ref)
// `size` is read as an aspect ratio only (the model picks its own resolution). Meta has no video
// generation model, so there is no motion counterpart to this file.
const API_BASE = 'https://api.meta.ai/v1';
const REQUEST_TIMEOUT_MS = 300_000; // Muse Image reasons + searches before rendering
const MAX_ATTEMPTS = 4;
const RETRYABLE_STATUS = [429, 503];

export const META_IMAGE_MODELS = [
  { id: 'meta:muse-image-1.0', label: 'Muse Image 1.0 — nhiều tham chiếu (~$0.01/ảnh)', price: 0.01 },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const apiKey = () => {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error('MODEL_API_KEY not set (Meta Model API key, put it in .env).');
  return key;
};

const postJson = async (path, body, onLog) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return response.json();
    const detail = await response.text();
    if (!RETRYABLE_STATUS.includes(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`meta ${path} ${response.status}: ${detail.slice(0, 300)}`);
    }
    onLog?.(`meta ${path} ${response.status}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
    await wait(2000 * 2 ** attempt);
  }
};

// Run one Meta image model → { url, via }. `refUris` are base64 data URIs; any reference switches
// to the edit endpoint. `url` is a signed URL, or a data: URI when the API only returns base64 —
// both are fetchable by download().
export const metaImageUrl = async (model, { prompt, refUris = [], size, onLog } = {}) => {
  const hasRefs = refUris.length > 0;
  const path = hasRefs ? '/images/edits' : '/images/generations';
  const body = {
    model, prompt, n: 1, size, response_format: 'url',
    ...(hasRefs ? { images: refUris.map((uri) => ({ image_url: uri })) } : {}),
  };
  onLog?.(`POST ${API_BASE}${path} model=${model} size=${size} refs=${refUris.length}`);
  const result = await postJson(path, body, onLog);
  const image = result?.data?.[0];
  const url = image?.url ?? (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
  if (!url) throw new Error(`meta ${path} returned no image: ${JSON.stringify(result).slice(0, 300)}`);
  onLog?.('image received');
  return { url, via: `meta:${model}` };
};
