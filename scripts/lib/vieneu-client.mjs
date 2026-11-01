// VieNeu-TTS as a narration source: its OpenAI-compatible server (apps/openai_speech.py in the
// VieNeu-TTS repo) answers POST /v1/audio/speech with a WAV stream and lists voices at GET /v1/voices.
//
// Env: VIENEU_URL (default http://127.0.0.1:8000), VIENEU_DIR (default ../VieNeu-TTS),
// VIENEU_API_KEY (Bearer token, only when the server sets one).
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const VOICE_LIST_TIMEOUT_MS = 1500;
const SYNTH_TIMEOUT_MS = 180000;

export const vieneuUrl = () => (process.env.VIENEU_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const vieneuPort = () => new URL(vieneuUrl()).port || '8000';
export const vieneuDir = () => resolve(process.env.VIENEU_DIR ?? '../VieNeu-TTS');
// Interpreter of the self-contained runtime that run_gpu.bat uses (runtime/python + runtime/venv).
export const vieneuPython = () => {
  const dir = join(vieneuDir(), 'runtime', 'python');
  const home = join(dir, 'cpython-3.12-windows-x86_64-none', 'python.exe');
  return existsSync(home) ? home : null;
};

// Voice names are free text on the VieNeu side ("Hải Đăng"), unlike OmniVoice profile names.
export const isValidVieneuVoice = (name) => typeof name === 'string' && /^[\p{L}\p{N} ._-]{1,64}$/u.test(name);

const headers = (extra = {}) => ({
  ...extra,
  ...(process.env.VIENEU_API_KEY ? { Authorization: `Bearer ${process.env.VIENEU_API_KEY}` } : {}),
});

// { source:'server', voices:[{ name, language, note }] }; an empty list while the server is down
// (VieNeu has no voice folder to fall back to, its presets live inside the model).
export const listVieneuVoices = async () => {
  try {
    const res = await fetch(`${vieneuUrl()}/v1/voices`, { headers: headers(), signal: AbortSignal.timeout(VOICE_LIST_TIMEOUT_MS) });
    if (res.ok) {
      const { data = [] } = await res.json();
      return {
        source: 'server',
        voices: data.map((v) => ({ name: v.id ?? v.name, language: 'Vietnamese', note: v.description ?? '' })).filter((v) => v.name),
      };
    }
  } catch {
    // not running
  }
  return { source: 'folder', voices: [] };
};

// One synthesis → WAV buffer. The server streams a WAV header with an unknown length; ffmpeg
// reads that fine, so the bytes are passed through untouched.
export const vieneuSynthesize = async (text, voice) => {
  const res = await fetch(`${vieneuUrl()}/v1/audio/speech`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ input: text, voice: voice || undefined, response_format: 'wav' }),
    signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`VieNeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
};
