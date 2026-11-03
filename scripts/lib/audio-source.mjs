// Which TTS engine narrates a project: `audio:` header in scene-plan.md (absent = omnivoice).
// The `voice:` header names a voice of that engine, so changing the source also resets the voice.
import { readPlanHeader } from './plan-writer.mjs';
import { DEFAULT_VOICE as OMNIVOICE_DEFAULT_VOICE, isValidVoiceName, listVoices } from './omnivoice-client.mjs';
import { isValidVieneuVoice, listVieneuVoices } from './vieneu-client.mjs';
import { hasElevenlabsKey, isValidElevenlabsVoice, listElevenlabsVoices } from './elevenlabs-client.mjs';
import { listServices } from './local-services.mjs';

export const AUDIO_SOURCES = ['omnivoice', 'vieneu', 'elevenlabs'];
export const DEFAULT_AUDIO_SOURCE = 'omnivoice';

const SOURCE_LABEL = { omnivoice: 'OmniVoice', vieneu: 'VieNeu', elevenlabs: 'ElevenLabs' };

// The sources the panel offers: a local engine only when it is installed or answering, ElevenLabs
// only when it has an API key, plus the project's current one so its select never loses it. When
// nothing qualifies, ElevenLabs is offered so there is still a path to narration (Model → key).
export const audioSourceChoices = async (current) => {
  const services = new Map((await listServices()).map((s) => [s.id, s]));
  const usable = (id) => {
    if (id === 'elevenlabs') return hasElevenlabsKey();
    const s = services.get(id);
    return Boolean(s && (s.installed || s.state !== 'stopped'));
  };
  const ids = AUDIO_SOURCES.filter((id) => id === current || usable(id));
  return (ids.length ? ids : ['elevenlabs']).map((id) => ({ id, label: SOURCE_LABEL[id] }));
};

export const isAudioSource =(value) => AUDIO_SOURCES.includes(value);

export const audioSourceOf = (planRaw) => {
  const value = readPlanHeader(planRaw, 'audio');
  return isAudioSource(value) ? value : DEFAULT_AUDIO_SOURCE;
};

export const isValidVoiceFor = (source, name) => {
  if (source === 'vieneu') return isValidVieneuVoice(name);
  if (source === 'elevenlabs') return isValidElevenlabsVoice(name);
  return isValidVoiceName(name);
};

// { source, voices, defaultVoice, audioSource } for the panel's voice select. VieNeu and ElevenLabs
// have no fixed default profile, so the default is the first voice they list (empty while VieNeu is
// down or ElevenLabs has no key: the panel then asks the user to start / configure it).
export const voicesFor = async (source) => {
  if (source === 'vieneu' || source === 'elevenlabs') {
    const list = await (source === 'vieneu' ? listVieneuVoices() : listElevenlabsVoices());
    return { ...list, defaultVoice: list.voices[0]?.name ?? '', audioSource: source };
  }
  return { ...(await listVoices()), defaultVoice: OMNIVOICE_DEFAULT_VOICE, audioSource: source };
};

