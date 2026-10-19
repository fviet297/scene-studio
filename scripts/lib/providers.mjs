// Which provider serves a model id, and the env key it needs. The model-id prefix is what the
// dispatchers route on (replicate-image.mjs runImageModel, motion-video.mjs generateSceneVideo);
// an id with no known prefix goes to Replicate.
const PROVIDERS = [
  { id: 'fal', label: 'fal.ai', prefix: 'fal-ai/', env: 'FAL_KEY' },
  { id: 'vmedia', label: 'VMedia', prefix: 'vmedia:', env: 'VMEDIA_API_KEY' },
  { id: 'meta', label: 'Meta', prefix: 'meta:', env: 'MODEL_API_KEY' },
  { id: 'muse', label: 'muse2api', prefix: 'muse:', env: 'MUSE2API_KEY' },
];
const REPLICATE = { id: 'replicate', label: 'Replicate', prefix: '', env: 'REPLICATE_API_TOKEN' };

export const providerOf = (modelId) => PROVIDERS.find((p) => modelId.startsWith(p.prefix)) ?? REPLICATE;

// Tag each picker entry with its provider and whether that provider's key is set, so the panel
// can group the list and disable models that would only fail after the click.
export const withAvailability = (models) => models.map((model) => {
  const provider = providerOf(model.id);
  return { ...model, provider: provider.id, providerLabel: provider.label, available: Boolean(process.env[provider.env]), keyEnv: provider.env };
});
