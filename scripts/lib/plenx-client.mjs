// Plenx AI developer API (https://plenxai.com/docs). Generation is async: POST creates a task,
// GET /developer/status/{task_id} is polled until `completed` / `error`. Input images must be
// public URLs, so scene images are uploaded first (media-upload/direct, base64).
//
// Env: PLENX_API_KEY (the pk_ key), PLENX_BASE_URL (default https://plenxai.com).
// A rejected request can still be HTTP 200 with `success: false` and an `error` code (e.g.
// insufficient_credits), so both are checked.

import { builtinDefault } from './model-config.mjs';

const REQUEST_TIMEOUT_MS = 120_000;
const UPLOAD_ATTEMPTS = 4; // media-upload/direct allows 10 requests/minute
const UPLOAD_BACKOFF_MS = 3000; // grows with each attempt when Plenx answers 5xx or not at all
const RETRYABLE_UPLOAD_STATUS = [429, 502, 503, 504];
const MAX_POLL_ERRORS = 5; // a failed status query is retried as a query, never by re-POSTing
const DEFAULT_RETRY_AFTER_S = 7;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const baseUrl = () => (process.env.PLENX_BASE_URL ?? builtinDefault('plenx', 'baseUrl')).replace(/\/+$/, '');

const apiKey = () => {
  const key = process.env.PLENX_API_KEY;
  if (!key) throw new Error('Missing PLENX_API_KEY (add it in the panel: Model → Plenx AI, or in .env).');
  return key;
};

const describeFailure = (json, text) => json?.message ?? json?.error ?? json?.detail ?? text.slice(0, 300);

// A gateway (Cloudflare) answers an HTML error page when the Plenx backend is down or overloaded;
// say that in a line instead of dumping the page.
const describeNonJson = (status, text) => (/^\s*<(!doctype|html)/i.test(text)
  ? `Plenx's gateway answered HTTP ${status} (the service is not responding)`
  : `non-JSON response (HTTP ${status}): ${text.slice(0, 300)}`);

// One JSON request. Returns { json, response } so a caller can read headers (Retry-After); throws
// on a network error, a non-JSON body, an HTTP error or `success: false`.
const request = async (path, init, label) => {
  const response = await fetch(`${baseUrl()}/api/v1${path}`, {
    ...init,
    headers: { 'X-API-Key': apiKey(), 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { throw Object.assign(new Error(`${label}: ${describeNonJson(response.status, text)}`), { status: response.status, response }); }
  if (!response.ok || json?.success === false) {
    throw Object.assign(new Error(`${label} failed (HTTP ${response.status}): ${describeFailure(json, text)}`), { status: response.status, response });
  }
  return { json, response };
};

const postJson = (path, body, label) => request(path, { method: 'POST', body: JSON.stringify(body) }, label);

const retryAfterSeconds = (response) => {
  const header = response.headers.get('retry-after');
  return header !== null && Number.isFinite(Number(header)) ? Number(header) : DEFAULT_RETRY_AFTER_S;
};

// An upload is retried when Plenx rate-limits it (429, waiting the advertised time), answers 5xx
// or does not answer: re-uploading an image costs nothing, unlike re-creating a task.
const uploadRetryDelayMs = (error, attempt, backoffMs) =>
  (error.status === 429 ? retryAfterSeconds(error.response) * 1000 : backoffMs * attempt);

const isRetryableUpload = (error) => error.status === undefined || RETRYABLE_UPLOAD_STATUS.includes(error.status);

const postImage = async (dataUri, filename) => {
  const { json } = await postJson('/developer/media-upload/direct', { image_data: dataUri, filename, media_type: 'image' }, 'plenx upload');
  if (!json.url) throw new Error(`plenx upload returned no url: ${JSON.stringify(json).slice(0, 200)}`);
  return json.url;
};

// Public URL of the image on Plenx's CDN.
export const uploadImage = async (dataUri, filename, onLog, { backoffMs = UPLOAD_BACKOFF_MS } = {}) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await postImage(dataUri, filename);
    } catch (error) {
      if (attempt === UPLOAD_ATTEMPTS || !isRetryableUpload(error)) throw error;
      const delayMs = uploadRetryDelayMs(error, attempt, backoffMs);
      onLog?.(`plenx upload failed (${error.status ? `HTTP ${error.status}` : error.message}), retry ${attempt}/${UPLOAD_ATTEMPTS - 1} in ${Math.round(delayMs / 1000)}s`);
      await wait(delayMs);
    }
  }
};

export const createTask = async (path, body, label) => {
  const { json } = await postJson(path, body, label);
  if (!json.task_id) throw new Error(`${label}: no task_id in response: ${JSON.stringify(json).slice(0, 300)}`);
  return json.task_id;
};

// Polls a task to completion → its result_url. `signal` stops polling (the task itself cannot be
// cancelled on Plenx and finishes, and bills, upstream).
export const pollTask = async (taskId, { intervalMs, maxAttempts, label, onLog, signal }) => {
  let errors = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    signal?.throwIfAborted();
    await wait(intervalMs);
    let task;
    try {
      ({ json: task } = await request(`/developer/status/${taskId}`, {}, `${label} status`));
      errors = 0;
    } catch (error) {
      if (error.response?.headers.get('x-poll-stop') || ++errors >= MAX_POLL_ERRORS) throw error;
      continue;
    }
    if (task.status === 'completed' && task.result_url) return task.result_url;
    if (task.status === 'error') throw new Error(`${label} failed: ${task.error_message ?? 'unknown error'}`);
    if (attempt % 6 === 0) onLog?.(`${label} ${task.status}… (${Math.round((attempt * intervalMs) / 1000)}s)`);
  }
  throw new Error(`${label}: timed out waiting for task ${taskId}`);
};
