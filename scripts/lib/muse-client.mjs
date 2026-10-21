// muse2api client (the self-hosted museapivn server that wraps muse.ai as an OpenAI-compatible
// API). Both image and video run as async tasks: POST creates the task, GET polls it until
// `completed` / `failed`. Shared by muse-image.mjs and muse-video.mjs.
//
// Env: MUSE2API_BASE_URL (default http://localhost:18610), MUSE2API_KEY (the server's m2a_ key).

const REQUEST_TIMEOUT_MS = 60_000;
// Per the server README, a failed status query is retried as a query — never by re-POSTing,
// which would start (and bill) a second generation.
const MAX_POLL_ERRORS = 5;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const baseUrl = () => (process.env.MUSE2API_BASE_URL ?? 'http://localhost:18610').replace(/\/+$/, '');

const authHeader = () => {
  const key = process.env.MUSE2API_KEY;
  if (!key) throw new Error('Missing MUSE2API_KEY in .env (the m2a_ key of your muse2api server).');
  return { Authorization: `Bearer ${key}` };
};

const requestJson = async (path, init, label) => {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...authHeader(), 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${label}: non-JSON response (HTTP ${response.status}): ${text.slice(0, 300)}`); }
  if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status}): ${json?.detail ?? text.slice(0, 300)}`);
  return json;
};

// Create one task → its id.
export const createTask = async (path, body, label) => {
  const created = await requestJson(path, { method: 'POST', body: JSON.stringify(body) }, label);
  const id = created?.id ?? created?.task_id;
  if (!id) throw new Error(`${label} returned no task id: ${JSON.stringify(created).slice(0, 300)}`);
  return id;
};

// Poll `${path}/${id}` until the task completes → the result media URL, made absolute (the server
// returns a relative /v1/media/... path when MUSE2API_PUBLIC_BASE is unset on its side).
// `signal` (optional) stops polling; muse2api has no cancel endpoint, so the task itself finishes
// on its side and its result is simply never fetched.
export const pollTask = async (path, id, { intervalMs, maxAttempts, label, onLog, signal }) => {
  let errors = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    signal?.throwIfAborted();
    await wait(intervalMs);
    signal?.throwIfAborted();
    let task;
    try {
      task = await requestJson(`${path}/${id}`, { method: 'GET' }, `${label} status ${id}`);
      errors = 0;
    } catch (error) {
      if (++errors >= MAX_POLL_ERRORS) throw error;
      onLog?.(`poll error ${errors}/${MAX_POLL_ERRORS}, retrying: ${error.message}`);
      continue;
    }
    if (task.status === 'failed') throw new Error(`${label} ${id} failed: ${task.error ?? 'unknown error'}`);
    const url = task.url ?? task.result?.url ?? task.data?.[0]?.url;
    if (task.status === 'completed' && url) return new URL(url, `${baseUrl()}/`).href;
  }
  throw new Error(`${label} ${id} timed out after ${Math.round((intervalMs * maxAttempts) / 60_000)} minutes.`);
};
