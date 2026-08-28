// Gommo AI API client (api.gommo.net) — the service behind "VMedia". Every call POSTs an
// application/x-www-form-urlencoded body carrying access_token + domain; array/object params are
// JSON-stringified per the API contract. Shared by vmedia-video.mjs and vmedia-image.mjs.
//
// Env: VMEDIA_API_KEY (access_token), VMEDIA_DOMAIN (default vmedia.ai), VMEDIA_PROJECT_ID (default).

const BASE = 'https://api.gommo.net';
const REQUEST_TIMEOUT_MS = 60_000;

const creds = () => {
  const accessToken = process.env.VMEDIA_API_KEY;
  if (!accessToken) throw new Error('Missing VMEDIA_API_KEY in .env');
  return { accessToken, domain: process.env.VMEDIA_DOMAIN ?? 'vmedia.ai' };
};
export const projectId = () => process.env.VMEDIA_PROJECT_ID ?? 'default';

// POST one Gommo endpoint. Array/object values are JSON-stringified (e.g. images, subjects).
// Returns the parsed JSON; throws on transport failure or a body carrying a truthy `error`.
export const gommoPost = async (path, params = {}, { label = path } = {}) => {
  const { accessToken, domain } = creds();
  const body = new URLSearchParams();
  body.set('access_token', accessToken);
  body.set('domain', domain);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${label}: non-JSON response (HTTP ${response.status}): ${text.slice(0, 300)}`); }
  if (!response.ok || json?.error) throw new Error(`${label} failed: ${json?.message ?? json?.error ?? `HTTP ${response.status}`}`);
  return json;
};

// List Models, cached per type for the process lifetime. type = 'video' | 'image' | 'tts'.
const modelCache = new Map();
export const listModels = async (type) => {
  if (modelCache.has(type)) return modelCache.get(type);
  const json = await gommoPost('/ai/models', { type }, { label: `gommo list-models ${type}` });
  const models = Array.isArray(json.data) ? json.data : [];
  modelCache.set(type, models);
  return models;
};

// The capabilities entry for one model slug, or a helpful error naming the available slugs. The
// entry carries ratios/resolutions/durations/mode arrays used to build a valid create request.
export const getModelCaps = async (type, slug) => {
  const models = await listModels(type);
  const found = models.find((m) => m.model === slug);
  if (!found) throw new Error(`Unknown Gommo ${type} model "${slug}". Available: ${models.map((m) => m.model).join(', ')}`);
  return found;
};

// Pick a value from a caps list of { type } entries: the first `preferred` that the model offers,
// else the model's first option, else undefined (the param is then omitted from the request).
export const pickCap = (caps, preferred = []) => {
  const types = (caps ?? []).map((c) => c.type);
  for (const option of preferred) if (types.includes(option)) return option;
  return types[0];
};
