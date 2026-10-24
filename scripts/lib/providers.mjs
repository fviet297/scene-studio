// Which provider serves a model id, and the key it needs. The model-id prefix is what the
// dispatchers route on (replicate-image.mjs runImageModel, motion-video.mjs generateSceneVideo);
// an id with no known prefix goes to Replicate. Providers added in the model manager are matched
// first, by `<provider id>:`. The built-in table and the user's config live in model-config.mjs.
import { BUILTIN_PROVIDERS, customProviderOf, getConfig } from './model-config.mjs';

const REPLICATE = BUILTIN_PROVIDERS.find((p) => p.id === 'replicate');
const PREFIXED = BUILTIN_PROVIDERS.filter((p) => p.prefix);

export const providerOf = (modelId) => {
  const custom = customProviderOf(getConfig(), modelId);
  if (custom) {
    const { id, label, apiKey } = custom.provider;
    return { id, label, available: Boolean(apiKey), keyEnv: `API key của ${label}` };
  }
  const provider = PREFIXED.find((p) => modelId.startsWith(p.prefix)) ?? REPLICATE;
  const env = provider.fields.apiKey;
  return { id: provider.id, label: provider.label, available: Boolean(process.env[env]), keyEnv: env };
};

// Tag each picker entry with its provider and whether that provider's key is set, so the panel
// can group the list and disable models that would only fail after the click.
export const withAvailability = (models) => models.map((model) => {
  const { id, label, available, keyEnv } = providerOf(model.id);
  return { ...model, provider: id, providerLabel: label, available, keyEnv };
});

// Picker entries of one kind: the built-in list minus what the user hid, plus the models added
// in the manager.
export const pickerModels = (kind, builtinModels) => {
  const { hidden, models } = getConfig();
  const added = models.filter((m) => m.kind === kind).map(({ id, label, price }) => ({ id, label, price }));
  return withAvailability([...builtinModels.filter((m) => !hidden.includes(m.id)), ...added]);
};
