// Image / motion model and LLM configuration edited from the review panel and kept in data/models.json
// (gitignored; API keys live there in plain text, like .env). It layers on top of .env:
//   overrides — endpoint / key / model of the built-in providers, applied to process.env so
//               the existing clients keep reading the env vars they always read
//   providers — extra OpenAI Images-compatible providers (image only), called by openai-image.mjs
//   models    — models the user added (built-in picker entries live in code, not here)
//   hidden    — built-in model ids the user removed from the pickers
// Every mutator returns a new config; callers persist it with updateConfig.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const CONFIG_PATH = join('data', 'models.json');
export const KINDS = ['image', 'motion'];
const BOTH = KINDS;

// `fields` maps a config field to the env var its client reads; `prefix` is what the dispatchers
// route on (an id with none goes to Replicate); `kinds` is what the provider can generate;
// `defaults` are the values a client falls back to when nothing is set (one source for the client
// and for what the manager shows); `placeholders` hint at a field that has no single default.
// The LLM provider generates no images or motion (kinds []): it is the chat model llm-client.mjs
// calls for the script, motion and upload-copy writers.
export const BUILTIN_PROVIDERS = [
  { id: 'replicate', label: 'Replicate', prefix: '', kinds: BOTH, fields: { apiKey: 'REPLICATE_API_TOKEN' } },
  { id: 'plenx', label: 'Plenx AI', prefix: 'plenx:', kinds: ['motion'], fields: { apiKey: 'PLENX_API_KEY', baseUrl: 'PLENX_BASE_URL', resolution: 'PLENX_VIDEO_RESOLUTION' },
    defaults: { baseUrl: 'https://plenxai.com' }, placeholders: { resolution: 'Tự động theo model (omni-flash 1080p, flux-3 720p)' } },
  { id: 'meta', label: 'Meta', prefix: 'meta:', kinds: ['image'], fields: { apiKey: 'MODEL_API_KEY', baseUrl: 'META_BASE_URL' }, defaults: { baseUrl: 'https://api.meta.ai/v1' } },
  { id: 'muse', label: 'muse2api', prefix: 'muse:', kinds: BOTH, fields: { apiKey: 'MUSE2API_KEY', baseUrl: 'MUSE2API_BASE_URL' }, defaults: { baseUrl: 'http://localhost:18610' } },
  { id: 'llm', label: 'LLM', kinds: [], fields: { apiKey: 'LLM_API_KEY', baseUrl: 'LLM_BASE_URL', model: 'LLM_MODEL', userAgent: 'LLM_USER_AGENT' },
    placeholders: { baseUrl: 'API chuẩn OpenAI Chat, vd. https://api.openai.com/v1', model: 'vd. gpt-5', userAgent: 'tuỳ chọn — chỉ khi router đòi' } },
];
export const CUSTOM_KINDS = ['image'];

const SLUG = /^[a-z0-9][a-z0-9-]{1,31}$/;
const builtinOf = (id) => BUILTIN_PROVIDERS.find((p) => p.id === id);
export const builtinDefault = (id, field) => builtinOf(id)?.defaults?.[field];

export class ConfigError extends Error {}
const fail = (message) => { throw new ConfigError(message); };

export const emptyConfig = () => ({ overrides: {}, providers: [], models: [], hidden: [] });

export const loadConfig = (path = CONFIG_PATH) => {
  if (!existsSync(path)) return emptyConfig();
  try {
    return { ...emptyConfig(), ...JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    throw new Error(`${path} is not valid JSON (${error.message}); fix or delete it.`);
  }
};

export const saveConfig = (config, path = CONFIG_PATH) => {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
};

// ------------------------------------------------------------------ validation helpers

const requireText = (value, what) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fail(`${what} không được để trống.`);
  return text;
};

const requireHttpUrl = (value, what) => {
  const text = requireText(value, what).replace(/\/+$/, '');
  let url;
  try { url = new URL(text); } catch { fail(`${what} không phải URL hợp lệ.`); }
  if (!['http:', 'https:'].includes(url.protocol)) fail(`${what} phải bắt đầu bằng http:// hoặc https://.`);
  return text;
};

const parsePrice = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) fail('Giá phải là số không âm.');
  return price;
};

// Patch semantics for a settings field: undefined keeps it, '' clears it, anything else sets it.
const mergeField = (current, patch, key, normalise = (v) => v.trim()) => {
  if (patch[key] === undefined) return current;
  const next = { ...current };
  const text = String(patch[key]).trim();
  if (text === '') delete next[key]; else next[key] = normalise(text);
  return next;
};

// ------------------------------------------------------------------ built-in providers

export const setBuiltinSettings = (config, id, patch) => {
  const provider = builtinOf(id) ?? fail(`Provider "${id}" không có sẵn.`);
  let settings = config.overrides[id] ?? {};
  for (const field of Object.keys(provider.fields)) {
    settings = mergeField(settings, patch, field, field === 'baseUrl' ? (v) => requireHttpUrl(v, 'Endpoint') : (v) => v);
  }
  const overrides = { ...config.overrides, [id]: settings };
  if (!Object.keys(settings).length) delete overrides[id];
  return { ...config, overrides };
};

// ------------------------------------------------------------------ custom providers

const findCustom = (config, id) => config.providers.find((p) => p.id === id);

export const addCustomProvider = (config, input) => {
  const id = requireText(input.id, 'ID provider').toLowerCase();
  if (!SLUG.test(id)) fail('ID provider chỉ gồm a-z, 0-9, dấu gạch ngang (2–32 ký tự, bắt đầu bằng chữ/số).');
  if (builtinOf(id) || findCustom(config, id)) fail(`ID provider "${id}" đã tồn tại.`);
  const provider = {
    id,
    label: requireText(input.label, 'Tên provider'),
    baseUrl: requireHttpUrl(input.baseUrl, 'Endpoint'),
    apiKey: requireText(input.apiKey, 'API key'),
  };
  return { ...config, providers: [...config.providers, provider] };
};

export const updateCustomProvider = (config, id, patch) => {
  const current = findCustom(config, id) ?? fail(`Provider "${id}" không tồn tại.`);
  const next = {
    ...current,
    ...(patch.label !== undefined ? { label: requireText(patch.label, 'Tên provider') } : {}),
    ...(patch.baseUrl !== undefined ? { baseUrl: requireHttpUrl(patch.baseUrl, 'Endpoint') } : {}),
    ...(patch.apiKey ? { apiKey: patch.apiKey.trim() } : {}),
  };
  return { ...config, providers: config.providers.map((p) => (p.id === id ? next : p)) };
};

// Its models go with it: they could only fail once the provider is gone.
export const removeCustomProvider = (config, id) => {
  if (!findCustom(config, id)) fail(`Provider "${id}" không tồn tại.`);
  return {
    ...config,
    providers: config.providers.filter((p) => p.id !== id),
    models: config.models.filter((m) => m.provider !== id),
  };
};

// ------------------------------------------------------------------ models

const prefixFor = (providerId) => (builtinOf(providerId) ? builtinOf(providerId).prefix : `${providerId}:`);
const kindsFor = (providerId) => (builtinOf(providerId)?.kinds ?? CUSTOM_KINDS);

// The id the dispatchers route on: the provider's prefix is added when the user typed only the name.
export const modelIdFor = (providerId, name) => {
  const text = requireText(name, 'ID model');
  const prefix = prefixFor(providerId);
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
};

export const addModel = (config, input, builtinModelIds = []) => {
  const provider = input.provider;
  if (!builtinOf(provider) && !findCustom(config, provider)) fail(`Provider "${provider}" không tồn tại.`);
  if (!KINDS.includes(input.kind)) fail('Loại model phải là ảnh hoặc motion.');
  if (!kindsFor(provider).includes(input.kind)) fail(`Provider "${provider}" không hỗ trợ model ${input.kind === 'image' ? 'ảnh' : 'motion'}.`);
  const id = modelIdFor(provider, input.id);
  if (id === prefixFor(provider)) fail('ID model không được để trống.');
  if (builtinModelIds.includes(id) || config.models.some((m) => m.id === id)) fail(`Model "${id}" đã tồn tại.`);
  const model = { id, provider, kind: input.kind, label: requireText(input.label?.trim() || input.id, 'Nhãn'), price: parsePrice(input.price) };
  return { ...config, models: [...config.models, model] };
};

export const updateModel = (config, id, patch) => {
  const current = config.models.find((m) => m.id === id) ?? fail(`Model "${id}" không tồn tại.`);
  const next = {
    ...current,
    ...(patch.label !== undefined ? { label: requireText(patch.label, 'Nhãn') } : {}),
    ...(patch.price !== undefined ? { price: parsePrice(patch.price) } : {}),
  };
  return { ...config, models: config.models.map((m) => (m.id === id ? next : m)) };
};

export const removeModel = (config, id) => {
  if (!config.models.some((m) => m.id === id)) fail(`Model "${id}" không tồn tại.`);
  return { ...config, models: config.models.filter((m) => m.id !== id) };
};

export const setModelHidden = (config, id, hidden) => ({
  ...config,
  hidden: hidden ? [...new Set([...config.hidden, id])] : config.hidden.filter((h) => h !== id),
});

// ------------------------------------------------------------------ lookups

// The custom provider a model id belongs to, with the model name its API expects.
export const customProviderOf = (config, modelId) => {
  const provider = config.providers.find((p) => modelId.startsWith(`${p.id}:`));
  return provider ? { provider, name: modelId.slice(provider.id.length + 1) } : null;
};

export const maskKey = (key) => (key ? `••••${key.length > 8 ? key.slice(-4) : ''}` : '');

// ------------------------------------------------------------------ runtime state

let current = null;
const originalEnv = new Map();

export const getConfig = () => (current ??= loadConfig());

// Env vars the clients read: an override wins, clearing it restores what .env / the shell had.
const applyEnv = (config) => {
  for (const provider of BUILTIN_PROVIDERS) {
    for (const [field, variable] of Object.entries(provider.fields)) {
      if (!originalEnv.has(variable)) originalEnv.set(variable, process.env[variable]);
      const value = config.overrides[provider.id]?.[field] ?? originalEnv.get(variable);
      if (value === undefined) delete process.env[variable]; else process.env[variable] = value;
    }
  }
};

// Call once after .env is loaded, so the overrides sit on top of it.
export const initModelConfig = () => applyEnv(getConfig());

export const updateConfig = (mutate) => {
  const next = mutate(getConfig());
  saveConfig(next);
  current = next;
  applyEnv(next);
  return next;
};
