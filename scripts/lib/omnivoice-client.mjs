// WebSocket client for the local OmniVoice server (tool/WEBSOCKET_API.md).
//
// The protocol is one JSON `audio_meta` frame followed by one binary WAV frame, served FIFO
// behind a GPU lock. That is simple enough that the old inline client ignored most of it: it
// dropped `request_id`, never compared the payload against `audio_meta.size`, and had no
// timeout — so a truncated frame or a stalled inference produced a silently bad MP3 or an
// indefinite hang. Everything here exists to make a failed synthesis *throw* instead.
//
// Also lists the server's saved voice profiles (GET /api/voices) for the review panel's voice picker.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';

const DEFAULT_TIMEOUT_MS = 180_000;
const VOICE_LIST_TIMEOUT_MS = 1500;

export const OMNIVOICE_PORT = 8765;
export const omnivoiceDir = () => resolve(process.env.OMNIVOICE_DIR ?? '../omnivoice-tool');
// Voice profile a project narrates with when its scene-plan.md header has no `voice:` line.
export const DEFAULT_VOICE = 'history-v2';
// Profile names as OmniVoice's _safe_name stores them (tool/ws_omnivoice_server.py).
export const isValidVoiceName = (name) => typeof name === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(name);

const readVoiceFolder = () => {
  const dir = join(omnivoiceDir(), 'tool', 'voice_prompts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((file) => file.endsWith('.wav')).sort().map((file) => {
    const name = file.slice(0, -'.wav'.length);
    const metaPath = join(dir, `${name}.json`);
    let meta = {};
    try { meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {}; } catch { meta = {}; }
    return { name, language: meta.language ?? null, note: meta.note ?? '' };
  });
};

// Saved voice profiles as { source, voices:[{ name, language, note }] }. Asks the running server
// first; while it is down, reads the voice_prompts/ folder it serves (<name>.wav + <name>.json),
// so a voice can be picked before OmniVoice is started.
export const listVoices = async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${OMNIVOICE_PORT}/api/voices`, { signal: AbortSignal.timeout(VOICE_LIST_TIMEOUT_MS) });
    if (res.ok) {
      const { voices = [] } = await res.json();
      return { source: 'server', voices: voices.map(({ name, language, note }) => ({ name, language: language ?? null, note: note ?? '' })) };
    }
  } catch {
    // not running — fall through to the folder
  }
  return { source: 'folder', voices: readVoiceFolder() };
};

const openSocket = (url) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });

// One synthesis at a time, matching the server's own serialisation. `synthesize` resolves with
// the WAV buffer, or throws: server error, timeout, closed socket, request_id mismatch, or a
// payload whose length disagrees with the announced size.
export const connectOmniVoice = async ({ url, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
  let socket = await openSocket(url);
  let pending = null;

  const fail = (error) => {
    const current = pending;
    pending = null;
    current?.reject(error);
  };

  const attach = () => {
    socket.on('message', (data, isBinary) => {
      if (!pending) return;
      if (!isBinary) {
        const message = JSON.parse(data.toString());
        if (message.type === 'error') fail(new Error(message.message ?? 'OmniVoice error'));
        else if (message.type === 'audio_meta') {
          if (message.request_id !== undefined && message.request_id !== pending.id) {
            fail(new Error(`request_id mismatch: expected ${pending.id}, got ${message.request_id}`));
            return;
          }
          pending.meta = message;
        }
        return;
      }
      if (!pending.meta) { fail(new Error('binary frame arrived before audio_meta')); return; }
      const buffer = Buffer.from(data);
      const { size } = pending.meta;
      if (Number.isFinite(size) && buffer.length !== size) {
        fail(new Error(`truncated audio: got ${buffer.length} bytes, expected ${size}`));
        return;
      }
      const { resolve, meta } = pending;
      pending = null;
      resolve({ wav: buffer, meta });
    });
    socket.on('close', () => fail(new Error('OmniVoice socket closed mid-request')));
    socket.on('error', (error) => fail(error));
  };
  attach();

  return {
    async synthesize(id, payload) {
      if (socket.readyState !== WebSocket.OPEN) {
        socket = await openSocket(url);
        attach();
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs);
        const settle = (fn) => (value) => { clearTimeout(timer); fn(value); };
        pending = { id, meta: null, resolve: settle(resolve), reject: settle(reject) };
        socket.send(JSON.stringify({ ...payload, request_id: id }));
      });
    },
    close() {
      socket.close();
    },
  };
};
