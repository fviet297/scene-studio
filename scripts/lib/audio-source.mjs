// Which TTS engine narrates a project: `audio:` header in scene-plan.md (absent = omnivoice).
// The `voice:` header names a voice of that engine, so changing the source also resets the voice.
import { readPlanHeader } from './plan-writer.mjs';
import { DEFAULT_VOICE as OMNIVOICE_DEFAULT_VOICE, isValidVoiceName, listVoices } from './omnivoice-client.mjs';
import { isValidVieneuVoice, listVieneuVoices } from './vieneu-client.mjs';

export const AUDIO_SOURCES = ['omnivoice', 'vieneu'];
export const DEFAULT_AUDIO_SOURCE = 'omnivoice';

export const isAudioSource = (value) => AUDIO_SOURCES.includes(value);

export const audioSourceOf = (planRaw) => {
  const value = readPlanHeader(planRaw, 'audio');
  return isAudioSource(value) ? value : DEFAULT_AUDIO_SOURCE;
};

export const isValidVoiceFor = (source, name) =>
  source === 'vieneu' ? isValidVieneuVoice(name) : isValidVoiceName(name);

// { source, voices, defaultVoice, audioSource } for the panel's voice select. VieNeu has no fixed
// default profile, so its default is the first preset the server lists (empty while it is down:
// the server then picks its own default voice).
export const voicesFor = async (source) => {
  if (source === 'vieneu') {
    const list = await listVieneuVoices();
    return { ...list, defaultVoice: list.voices[0]?.name ?? '', audioSource: source };
  }
  return { ...(await listVoices()), defaultVoice: OMNIVOICE_DEFAULT_VOICE, audioSource: source };
};

