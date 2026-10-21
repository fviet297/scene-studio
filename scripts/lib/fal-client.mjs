// fal.ai queue REST client. Mirrors predict() in replicate-image.mjs but for fal's
// submit → poll status → GET result protocol, using raw fetch (no @fal-ai/client SDK):
//
//   POST https://queue.fal.run/{model}   Authorization: Key $FAL_KEY   body: input JSON
//     → { request_id, status_url, response_url, ... }
//   poll GET {status_url} until status === 'COMPLETED'
//   GET {response_url} → the model's output ({ images: [{ url }] } or { video: { url } })
//
// Requires FAL_KEY (read from .env by loadEnv in replicate-image.mjs).

const QUEUE = 'https://queue.fal.run';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUEST_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
// 150 polls × 4s ≈ 10 min, matching the longest a paid image/video job should reasonably take.
const MAX_POLLS = 150;
const POLL_INTERVAL_MS = 4000;

const falKey = () => {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error('FAL_KEY not set (put it in .env).');
  return key;
};

// Fetch JSON with a request timeout and bounded retry on throttle/5xx/network errors, matching
// the resilience of replicate-image.mjs's requestJson so a transient fal hiccup doesn't fail a batch.
const requestJson = async (url, init, label) => {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return response.json();
      const body = await response.text();
      if (!RETRYABLE_STATUS.has(response.status) || attempt === 5) {
        throw new Error(`${label} ${response.status}: ${body}`);
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await wait(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** attempt);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === 5) break;
      await wait(1000 * 2 ** attempt);
    }
  }
  throw new Error(`${label} failed after retries: ${lastError?.message ?? 'unknown error'}`);
};

// Submit one job to the fal queue and block until it completes, returning the model's raw output
// JSON. onLog receives the same style of progress lines the Replicate predict() path emits.
// `signal` (optional) cancels: polling stops, the queued/running request is cancelled on fal, and
// the call rejects with the signal's AbortError.
export const falPredict = async (model, input, { onLog, signal } = {}) => {
  signal?.throwIfAborted();
  const headers = { Authorization: `Key ${falKey()}` };
  const submit = await requestJson(`${QUEUE}/${model}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, `fal submit ${model}`);
  const { request_id: requestId, status_url: statusUrl, response_url: responseUrl, cancel_url: cancelUrl } = submit;
  if (!statusUrl || !responseUrl) {
    throw new Error(`fal ${model}: submit response missing status_url/response_url — ${JSON.stringify(submit).slice(0, 300)}`);
  }
  onLog?.(`fal request ${requestId ?? 'unknown'} queued`);

  let status = submit.status;
  for (let poll = 0; poll < MAX_POLLS && status !== 'COMPLETED'; poll++) {
    if (signal?.aborted) {
      // Best effort: a failed cancel must not mask the abort itself.
      if (cancelUrl) await fetch(cancelUrl, { method: 'PUT', headers }).catch(() => {});
      signal.throwIfAborted();
    }
    await wait(POLL_INTERVAL_MS);
    const state = await requestJson(statusUrl, { headers }, `fal status ${requestId}`);
    status = state.status;
    if (status === 'COMPLETED') break;
    if (status && !['IN_QUEUE', 'IN_PROGRESS'].includes(status)) {
      throw new Error(`fal ${model} status ${status}: ${JSON.stringify(state).slice(0, 300)}`);
    }
  }
  if (status !== 'COMPLETED') throw new Error(`fal ${model} timed out after ${(MAX_POLLS * POLL_INTERVAL_MS) / 60000} min`);
  onLog?.('fal request completed; fetching result');
  return requestJson(responseUrl, { headers }, `fal result ${requestId}`);
};

// Pull the first output URL from a fal result: images[].url for image models, video.url for video.
export const falOutputUrl = (result) => {
  if (Array.isArray(result?.images) && result.images[0]?.url) return result.images[0].url;
  if (result?.video?.url) return result.video.url;
  if (typeof result?.video === 'string' && /^https?:\/\//.test(result.video)) return result.video;
  throw new Error(`fal result has no image/video URL: ${JSON.stringify(result).slice(0, 300)}`);
};
