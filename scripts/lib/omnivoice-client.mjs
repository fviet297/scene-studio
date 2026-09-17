// WebSocket client for the local OmniVoice server (tool/WEBSOCKET_API.md).
//
// The protocol is one JSON `audio_meta` frame followed by one binary WAV frame, served FIFO
// behind a GPU lock. That is simple enough that the old inline client ignored most of it: it
// dropped `request_id`, never compared the payload against `audio_meta.size`, and had no
// timeout — so a truncated frame or a stalled inference produced a silently bad MP3 or an
// indefinite hang. Everything here exists to make a failed synthesis *throw* instead.

import WebSocket from 'ws';

const DEFAULT_TIMEOUT_MS = 180_000;

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
