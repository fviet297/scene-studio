// ElevenLabs as a narration source for machines that run neither OmniVoice nor VieNeu. Configured
// in the panel's Model manager (provider "ElevenLabs", stored in data/models.json and applied to
// process.env by model-config.mjs), or in .env.
//
// Env: ELEVENLABS_API_KEY, ELEVENLABS_BASE_URL (default https://api.elevenlabs.io),
// ELEVENLABS_MODEL (default eleven_multilingual_v2, which speaks Vietnamese).
const VOICE_LIST_TIMEOUT_MS = 8000;
const SYNTH_TIMEOUT_MS = 180000;
const OUTPUT_FORMAT = 'mp3_44100_128';

export const ELEVENLABS_DEFAULT_BASE_URL = 'https://api.elevenlabs.io';
export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2';

export const elevenlabsUrl = () => (process.env.ELEVENLABS_BASE_URL || ELEVENLABS_DEFAULT_BASE_URL).replace(/\/+$/, '');
export const elevenlabsModel = () => process.env.ELEVENLABS_MODEL || ELEVENLABS_DEFAULT_MODEL;
export const hasElevenlabsKey = () => Boolean(process.env.ELEVENLABS_API_KEY);

// The plan's `voice:` header holds the ElevenLabs voice id (opaque, ~20 alphanumerics).
export const isValidElevenlabsVoice = (name) => typeof name === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(name);

const requireKey = () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ElevenLabs chưa có API key — thêm ở nút Model → ElevenLabs (hoặc ELEVENLABS_API_KEY trong .env).');
  return key;
};

// { source:'server', voices:[{ name: voice_id, label, language, note }] }; empty without a key or
// while the API is unreachable, so the panel can tell the user what to configure.
export const listElevenlabsVoices = async () => {
  if (!hasElevenlabsKey()) return { source: 'folder', voices: [] };
  try {
    const res = await fetch(`${elevenlabsUrl()}/v1/voices`, {
      headers: { 'xi-api-key': requireKey() },
      signal: AbortSignal.timeout(VOICE_LIST_TIMEOUT_MS),
    });
    if (res.ok) {
      const { voices = [] } = await res.json();
      return {
        source: 'server',
        voices: voices
          .filter((v) => v.voice_id)
          .map((v) => ({
            name: v.voice_id,
            label: v.name ?? v.voice_id,
            language: v.labels?.language ?? 'Khác',
            note: [v.category, v.labels?.accent, v.labels?.descriptive].filter(Boolean).join(' · '),
          })),
      };
    }
  } catch {
    // offline or bad endpoint
  }
  return { source: 'folder', voices: [] };
};

// What the user typed → a voice id: a listed voice's id or (case-insensitive) name, else the text
// itself when it looks like an id (the list is unavailable offline or for a voice not in the account's list).
export const resolveElevenlabsVoice = async (input) => {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return '';
  const { voices } = await listElevenlabsVoices();
  const found = voices.find((v) => v.name === text) ?? voices.find((v) => v.label.toLowerCase() === text.toLowerCase());
  if (found) return found.name;
  if (isValidElevenlabsVoice(text)) return text;
  throw new Error(`Không tìm thấy giọng ElevenLabs "${text}" — nhập voice id hoặc đúng tên giọng trong tài khoản.`);
};

// One synthesis → MP3 buffer (ffmpeg probes the format, so the caller does not need the extension).
export const elevenlabsSynthesize = async (text, voiceId) => {
  if (!isValidElevenlabsVoice(voiceId)) throw new Error('ElevenLabs cần chọn giọng (voice id) trong panel trước khi sinh audio.');
  const res = await fetch(`${elevenlabsUrl()}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': requireKey(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: elevenlabsModel() }),
    signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
};
