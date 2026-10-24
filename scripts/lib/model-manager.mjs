// The model manager's API: what the panel shows (keys masked, never sent in full) and the
// mutations behind its buttons. Built-in picker entries come from code; the user's additions,
// hidden entries and provider settings come from model-config.mjs.
import { IMAGE_MODELS } from './replicate-image.mjs';
import { MOTION_VIDEO_MODELS } from './motion-video.mjs';
import {
  addCustomProvider, addModel, BUILTIN_PROVIDERS, builtinDefault, ConfigError, getConfig, maskKey, removeCustomProvider,
  removeModel, setBuiltinSettings, setModelHidden, updateConfig, updateCustomProvider, updateModel,
} from './model-config.mjs';
import { providerOf } from './providers.mjs';

const SECRET_FIELDS = ['apiKey'];
const builtinModels = () => [
  ...IMAGE_MODELS.map((m) => ({ ...m, kind: 'image' })),
  ...MOTION_VIDEO_MODELS.map((m) => ({ ...m, kind: 'motion' })),
];
const builtinIds = () => builtinModels().map((m) => m.id);

// One entry per editable field: a secret shows only its mask, and `source` says where the value
// in effect comes from (the panel, .env / the shell, or the provider's built-in default) so the
// user knows what an edit overrides.
const describeBuiltinField = (config, provider, field, variable) => {
  const panelValue = config.overrides[provider.id]?.[field];
  const envValue = process.env[variable] ?? '';
  const defaultValue = builtinDefault(provider.id, field) ?? '';
  const value = envValue || defaultValue;
  const secret = SECRET_FIELDS.includes(field);
  return {
    name: field,
    secret,
    set: Boolean(value),
    source: panelValue ? 'panel' : envValue ? 'env' : defaultValue ? 'default' : null,
    ...(provider.placeholders?.[field] ? { placeholder: provider.placeholders[field] } : {}),
    ...(secret ? { masked: maskKey(value) } : { value }),
  };
};

const describeBuiltin = (config, provider) => ({
  id: provider.id,
  label: provider.label,
  builtin: true,
  kinds: provider.kinds,
  fields: Object.entries(provider.fields).map(([field, variable]) => describeBuiltinField(config, provider, field, variable)),
});

const describeCustom = (provider) => ({
  id: provider.id,
  label: provider.label,
  builtin: false,
  kinds: ['image'],
  fields: [
    { name: 'baseUrl', secret: false, set: true, source: 'panel', value: provider.baseUrl },
    { name: 'apiKey', secret: true, set: Boolean(provider.apiKey), source: 'panel', masked: maskKey(provider.apiKey) },
  ],
});

export const describeModelConfig = () => {
  const config = getConfig();
  const builtin = builtinModels().map((m) => ({
    id: m.id, kind: m.kind, label: m.label, price: m.price ?? null,
    provider: providerOf(m.id).id, builtin: true, hidden: config.hidden.includes(m.id),
  }));
  const added = config.models.map((m) => ({ ...m, builtin: false, hidden: false }));
  return {
    providers: [...BUILTIN_PROVIDERS.map((p) => describeBuiltin(config, p)), ...config.providers.map(describeCustom)],
    models: [...builtin, ...added],
  };
};

// Each mutation takes the request body and returns the refreshed description.
const mutations = {
  'provider-add': (body) => updateConfig((c) => addCustomProvider(c, body)),
  'provider-update': ({ id, ...patch }) => updateConfig((c) => (
    BUILTIN_PROVIDERS.some((p) => p.id === id) ? setBuiltinSettings(c, id, patch) : updateCustomProvider(c, id, patch)
  )),
  'provider-delete': ({ id }) => updateConfig((c) => removeCustomProvider(c, id)),
  'model-add': (body) => updateConfig((c) => addModel(c, body, builtinIds())),
  'model-update': ({ id, ...patch }) => updateConfig((c) => updateModel(c, id, patch)),
  'model-delete': ({ id }) => updateConfig((c) => removeModel(c, id)),
  'model-hidden': ({ id, hidden }) => updateConfig((c) => {
    if (!builtinIds().includes(id)) throw new ConfigError(`Model "${id}" không phải model có sẵn.`);
    return setModelHidden(c, id, Boolean(hidden));
  }),
};

export const isModelConfigAction = (action) => Object.hasOwn(mutations, action);

export const applyModelConfigAction = (action, body) => {
  mutations[action](body);
  return describeModelConfig();
};
