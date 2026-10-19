// Local helper servers the pipeline talks to — OmniVoice (narration TTS) and muse2api (image/video)
// — started from the review panel instead of a separate terminal. A started server is a child of
// the review server (Ctrl+C on the review server stops it too) and logs to tmp/services/<id>.log.
// "running" means its health URL answers, so a server started from a terminal counts as well.
//
// Env: OMNIVOICE_DIR (default ../omnivoice-tool), MUSE2API_DIR (default ../museapivn); muse2api's
// port comes from MUSE2API_BASE_URL.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { baseUrl as museBaseUrl } from './muse-client.mjs';

const LOG_DIR = 'tmp/services';
const HEALTH_TIMEOUT_MS = 1500;
const LOG_TAIL_CHARS = 1200;
// generate-narration.mjs connects to ws://127.0.0.1:8765/ws, so OmniVoice must listen there.
const OMNIVOICE_PORT = 8765;

const SERVICES = {
  omnivoice: {
    label: 'OmniVoice',
    dir: () => resolve(process.env.OMNIVOICE_DIR ?? '../omnivoice-tool'),
    python: (dir) => join(dir, '.venv/bin/python'),
    // Same as tool/start_omnivoice_server.sh menu option 1 (GPU + Whisper), offline model cache.
    args: () => ['tool/ws_omnivoice_server.py', '--port', String(OMNIVOICE_PORT)],
    env: { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
    healthUrl: () => `http://127.0.0.1:${OMNIVOICE_PORT}/api/voices`,
  },
  muse2api: {
    label: 'muse2api',
    dir: () => resolve(process.env.MUSE2API_DIR ?? '../museapivn'),
    // The venv start.sh creates; it needs Python 3.10+, which start.sh does not check.
    python: (dir) => join(dir, 'venv/bin/python'),
    args: () => ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', new URL(museBaseUrl()).port || '18610'],
    env: { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    healthUrl: () => `${museBaseUrl()}/healthz`,
  },
};

// id → { proc, spawnError } for the child this review server spawned (absent when never started here).
const children = new Map();

const logPath = (id) => join(LOG_DIR, `${id}.log`);

const isHealthy = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
};

const logTail = (id) => {
  if (!existsSync(logPath(id))) return '';
  return readFileSync(logPath(id), 'utf8').slice(-LOG_TAIL_CHARS);
};

const lookup = (id) => {
  const service = SERVICES[id];
  if (!service) throw new Error(`unknown service "${id}"`);
  return service;
};

// state: running (health answers) | starting (our child is alive, not answering yet)
//        | failed (our child exited without ever answering) | stopped
export const serviceStatus = async (id) => {
  const service = lookup(id);
  const base = { id, label: service.label, url: service.healthUrl() };
  if (await isHealthy(service.healthUrl())) return { ...base, state: 'running' };
  const record = children.get(id);
  if (!record) return { ...base, state: 'stopped' };
  const { proc, spawnError } = record;
  if (!spawnError && proc.exitCode === null && proc.signalCode === null) return { ...base, state: 'starting' };
  return { ...base, state: 'failed', log: spawnError ?? logTail(id) };
};

export const listServices = () => Promise.all(Object.keys(SERVICES).map(serviceStatus));

// Spawn the service unless it already runs or is starting. Throws when its venv is missing, so
// the panel shows how to set it up instead of a silent failure.
export const startService = async (id) => {
  const current = await serviceStatus(id);
  if (current.state === 'running' || current.state === 'starting') return current;
  const service = lookup(id);
  const dir = service.dir();
  const python = service.python(dir);
  if (!existsSync(python)) throw new Error(`${service.label}: Python venv not found at ${python} — set it up in ${dir} first.`);
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(logPath(id), 'w');
  const proc = spawn(python, service.args(), {
    cwd: dir,
    env: { ...process.env, ...service.env },
    stdio: ['ignore', log, log],
  });
  closeSync(log); // the child holds its own copy of the descriptor
  const record = { proc, spawnError: null };
  proc.on('error', (error) => { record.spawnError = error.message; });
  children.set(id, record);
  return serviceStatus(id);
};
