// Image generation against any OpenAI Images-compatible API (Meta Model API, or a provider added
// in the review panel's model manager). Synchronous:
//   POST {baseUrl}/images/generations — text-to-image
//   POST {baseUrl}/images/edits       — JSON body with an `images` array; takes several references,
//                                       so a multi-character scene keeps every face
// Returns a signed URL, or a data: URI when the API only answers base64 — both work with download().
const REQUEST_TIMEOUT_MS = 300_000; // some models reason + search before rendering
const MAX_ATTEMPTS = 4;
const RETRYABLE_STATUS = [429, 503];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const postJson = async ({ label, baseUrl, apiKey, path, body, onLog }) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return response.json();
    const detail = await response.text();
    if (!RETRYABLE_STATUS.includes(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`${label} ${path} ${response.status}: ${detail.slice(0, 300)}`);
    }
    onLog?.(`${label} ${path} ${response.status}, retry ${attempt}/${MAX_ATTEMPTS - 1}`);
    await wait(2000 * 2 ** attempt);
  }
};

// `refUris` are base64 data URIs; any reference switches to the edit endpoint.
export const openaiImageUrl = async ({ label, baseUrl, apiKey, model, prompt, refUris = [], size, onLog }) => {
  const hasRefs = refUris.length > 0;
  const path = hasRefs ? '/images/edits' : '/images/generations';
  const body = {
    model, prompt, n: 1, size, response_format: 'url',
    ...(hasRefs ? { images: refUris.map((uri) => ({ image_url: uri })) } : {}),
  };
  onLog?.(`POST ${baseUrl}${path} model=${model} size=${size} refs=${refUris.length}`);
  const result = await postJson({ label, baseUrl, apiKey, path, body, onLog });
  const image = result?.data?.[0];
  const url = image?.url ?? (image?.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
  if (!url) throw new Error(`${label} ${path} returned no image: ${JSON.stringify(result).slice(0, 300)}`);
  onLog?.('image received');
  return { url, via: `${label}:${model}` };
};
