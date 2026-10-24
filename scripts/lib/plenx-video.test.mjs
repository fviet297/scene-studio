// node --test scripts/lib/plenx-video.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { generateSceneVideo } = await import('./plenx-video.mjs');

const VIDEO_BYTES = Buffer.from('fake-mp4');
const calls = { uploads: 0, generate: [], statusByTask: {} };
let server;
let origin;

// Task scripts: each GET /status answers the next entry; the last one repeats.
const TASKS = {
  't-ok': [{ status: 'queued' }, { status: 'processing' }, { status: 'completed', result_url: () => `${origin}/out.mp4` }],
  't-error': [{ status: 'processing' }, { status: 'error', error_message: 'content blocked' }],
};

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

const handle = (req, res, body) => {
  const { url, method } = req;
  if (url === '/out.mp4') { res.writeHead(200); res.end(VIDEO_BYTES); return; }
  if (url === '/api/v1/developer/media-upload/direct') {
    if (calls.alwaysBadGateway) { res.writeHead(502, { 'Content-Type': 'text/html' }); res.end('<!DOCTYPE html><html><body>Bad gateway</body></html>'); return; }
    calls.uploads += 1;
    if (calls.uploads === 1) { res.writeHead(502, { 'Content-Type': 'text/html' }); res.end('<!DOCTYPE html><html><body>Bad gateway</body></html>'); return; }
    if (calls.uploads === 2) return send(res, 429, { detail: 'slow down' }, { 'Retry-After': '0' });
    return send(res, 200, { success: true, url: `${origin}/uploaded.jpg` });
  }
  if (url === '/api/v1/developer/generate/video-omni') {
    calls.generate.push({ headers: req.headers, body: JSON.parse(body) });
    const rejected = JSON.parse(body).prompt === 'no credits';
    if (rejected) return send(res, 200, { success: false, error: 'insufficient_credits', message: 'Không đủ credits.' });
    return send(res, 200, { success: true, task_id: JSON.parse(body).prompt === 'fail' ? 't-error' : 't-ok', status: 'queued' });
  }
  const task = method === 'GET' && url.match(/^\/api\/v1\/developer\/status\/(.+)$/)?.[1];
  if (task && TASKS[task]) {
    const index = Math.min(calls.statusByTask[task] ?? 0, TASKS[task].length - 1);
    calls.statusByTask[task] = (calls.statusByTask[task] ?? 0) + 1;
    const step = TASKS[task][index];
    return send(res, 200, { success: true, task_id: task, ...step, ...(step.result_url ? { result_url: step.result_url() } : {}) });
  }
  return send(res, 404, { detail: 'not found' });
};

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => handle(req, res, body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  process.env.PLENX_BASE_URL = origin;
  process.env.PLENX_API_KEY = 'pk_test_key';
  delete process.env.PLENX_VIDEO_RESOLUTION;
});
after(() => server.close());

const workDir = mkdtempSync(join(tmpdir(), 'plenx-'));
const imagePath = join(workDir, 'scene.png');
writeFileSync(imagePath, Buffer.from('fake-image'));

const run = (overrides = {}) => generateSceneVideo({
  scene: 3, imagePath, outputDir: join(workDir, 'videos'), prompt: 'slow push-in', model: 'plenx:omni-flash-video',
  duration: 6, aspect: '9:16', pollIntervalMs: 5, uploadBackoffMs: 1, ...overrides,
});

test('uploads the image, creates the task, polls to completion and saves the mp4', async () => {
  const logs = [];
  const result = await run({ onLog: (line) => logs.push(line) });
  assert.equal(result.output, join(workDir, 'videos', 'scene-03.mp4'));
  assert.deepEqual(readFileSync(result.output), VIDEO_BYTES);
  assert.equal(calls.uploads, 3, 'a 502 and then a 429 were retried');
  assert.ok(logs.some((line) => /upload failed \(HTTP 502\), retry 1\/3/.test(line)));
  assert.ok(logs.some((line) => /upload failed \(HTTP 429\), retry 2\/3/.test(line)));
});

test('the request carries the key, the uploaded image URL, the unprefixed model, its server and aspect/duration/resolution', () => {
  const { headers, body } = calls.generate[0];
  assert.equal(headers['x-api-key'], 'pk_test_key');
  assert.deepEqual(body, {
    model: 'omni-flash-video', prompt: 'slow push-in', input_image_url: `${origin}/uploaded.jpg`,
    server: 'flow', aspect_ratio: '9:16', resolution: '1080p', duration: 6,
  });
});

test('generate_audio is switched off only for models that accept it', async () => {
  await run({ model: 'plenx:flux-3', duration: undefined, aspect: '16:9' });
  const { body } = calls.generate.at(-1);
  assert.deepEqual(
    { model: body.model, generate_audio: body.generate_audio, aspect_ratio: body.aspect_ratio, hasDuration: 'duration' in body },
    { model: 'flux-3', generate_audio: false, aspect_ratio: '16:9', hasDuration: false },
  );
  assert.equal('generate_audio' in calls.generate[0].body, false, 'omni-flash-video takes no such field');
});

test('omni-flash-video runs on the flow server; other models keep their default server', async () => {
  await run({ model: 'plenx:omni-flash-video' });
  assert.equal(calls.generate.at(-1).body.server, 'flow');
  await run({ model: 'plenx:flux-3' });
  assert.equal('server' in calls.generate.at(-1).body, false);
});

test('resolution defaults per model (flux-3 has no 1080p on its default server) and PLENX_VIDEO_RESOLUTION overrides all', async () => {
  const resolutionOf = async (model) => { await run({ model }); return calls.generate.at(-1).body.resolution; };
  assert.equal(await resolutionOf('plenx:omni-flash-video'), '1080p');
  assert.equal(await resolutionOf('plenx:flux-3'), '720p');
  assert.equal(await resolutionOf('plenx:kling-4.0'), '720p', 'unlisted models get the one resolution every server offers');
  process.env.PLENX_VIDEO_RESOLUTION = '480p';
  try {
    assert.equal(await resolutionOf('plenx:omni-flash-video'), '480p');
  } finally {
    delete process.env.PLENX_VIDEO_RESOLUTION;
  }
});

test('a failed task surfaces its error_message and writes no file', async () => {
  const outputDir = join(workDir, 'failed');
  await assert.rejects(run({ prompt: 'fail', outputDir }), /plenx video failed: content blocked/);
  assert.equal(existsSync(join(outputDir, 'scene-03.mp4')), false);
});

test('a rejection answered with HTTP 200 and success:false is an error naming the reason', async () => {
  await assert.rejects(run({ prompt: 'no credits' }), /Không đủ credits/);
});

test('a gateway that keeps failing gives up after the retries with a one-line error, not an HTML page', async () => {
  calls.alwaysBadGateway = true;
  try {
    await assert.rejects(run(), (error) => /gateway answered HTTP 502/.test(error.message) && !/<\w/.test(error.message));
  } finally {
    calls.alwaysBadGateway = false;
  }
});

test('a missing API key fails before any request', async () => {
  const before = calls.generate.length;
  const key = process.env.PLENX_API_KEY;
  delete process.env.PLENX_API_KEY;
  await assert.rejects(run(), /Missing PLENX_API_KEY/);
  process.env.PLENX_API_KEY = key;
  assert.equal(calls.generate.length, before);
});

test('a cancelled job stops polling', async () => {
  const controller = new AbortController();
  const pending = run({ signal: controller.signal, pollIntervalMs: 50 });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

test('a missing scene image is reported before anything is uploaded', async () => {
  await assert.rejects(run({ imagePath: join(workDir, 'nope.png') }), /Scene image not found/);
});
