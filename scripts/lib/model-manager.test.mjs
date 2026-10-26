// node --test scripts/lib/model-manager.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { applyModelConfigAction, describeModelConfig } = await import('./model-manager.mjs');
const { pickerModels, providerOf } = await import('./providers.mjs');
const { IMAGE_MODELS, runImageModel } = await import('./replicate-image.mjs');
const { MOTION_VIDEO_MODELS } = await import('./motion-video.mjs');
const { initModelConfig } = await import('./model-config.mjs');

// Imports resolve the active project from the repo; the config file is then written to a temp dir.
process.chdir(mkdtempSync(join(tmpdir(), 'model-manager-')));

const requests = [];
let server;
let baseUrl;

before(async () => {
  initModelConfig();
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ url: 'https://cdn.example/out.png' }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});
after(() => server.close());

const provider = (state, id) => state.providers.find((p) => p.id === id);
const field = (state, id, name) => provider(state, id).fields.find((f) => f.name === name);

test('describe lists the built-in providers and every built-in model', () => {
  const state = describeModelConfig();
  assert.deepEqual(state.providers.map((p) => p.id), ['replicate', 'plenx', 'meta', 'muse', 'llm']);
  assert.equal(state.models.filter((m) => m.kind === 'image').length, IMAGE_MODELS.length);
  assert.equal(state.models.filter((m) => m.kind === 'motion').length, MOTION_VIDEO_MODELS.length);
  assert.ok(state.models.every((m) => m.builtin && !m.hidden));
});

test('a saved built-in key reaches process.env but is only ever described masked', () => {
  const state = applyModelConfigAction('provider-update', { id: 'muse', apiKey: 'muse-secret-9999' });
  assert.equal(process.env.MUSE2API_KEY, 'muse-secret-9999');
  assert.deepEqual(field(state, 'muse', 'apiKey'), { name: 'apiKey', secret: true, set: true, source: 'panel', masked: '••••9999' });
  assert.ok(!JSON.stringify(state).includes('muse-secret-9999'));
});

test('a custom provider shows up in the image picker only, with availability from its key', () => {
  const state = applyModelConfigAction('provider-add', { id: 'myhost', label: 'My host', baseUrl, apiKey: 'sk-custom-1111' });
  assert.equal(provider(state, 'myhost').builtin, false);
  assert.ok(!JSON.stringify(state).includes('sk-custom-1111'));
  applyModelConfigAction('model-add', { provider: 'myhost', kind: 'image', id: 'gpt-image-1', label: 'GPT Image', price: 0.04 });
  const image = pickerModels('image', IMAGE_MODELS).find((m) => m.id === 'myhost:gpt-image-1');
  assert.deepEqual(
    { provider: image.provider, providerLabel: image.providerLabel, available: image.available, price: image.price },
    { provider: 'myhost', providerLabel: 'My host', available: true, price: 0.04 },
  );
  assert.ok(!pickerModels('motion', MOTION_VIDEO_MODELS).some((m) => m.id === 'myhost:gpt-image-1'));
});

test('a model of a built-in provider gets its prefix and is offered as motion', () => {
  const state = applyModelConfigAction('model-add', { provider: 'muse', kind: 'motion', id: 'my_slug', label: 'My slug' });
  assert.ok(state.models.some((m) => m.id === 'muse:my_slug' && m.kind === 'motion' && !m.builtin));
  assert.equal(providerOf('muse:my_slug').id, 'muse');
});

test('built-in endpoints show their default as the value in effect, with the source named', () => {
  const state = describeModelConfig();
  assert.deepEqual(
    { value: field(state, 'plenx', 'baseUrl').value, source: field(state, 'plenx', 'baseUrl').source },
    { value: 'https://plenxai.com', source: 'default' },
  );
  assert.equal(field(state, 'muse', 'baseUrl').value, 'http://localhost:18610');
  assert.match(field(state, 'plenx', 'resolution').placeholder, /theo model/);
  assert.equal(field(state, 'plenx', 'resolution').set, false);
});

test('Plenx motion models are listed locked until a key is saved, then usable; it takes no image models', () => {
  const plenxIds = () => pickerModels('motion', MOTION_VIDEO_MODELS).filter((m) => m.provider === 'plenx');
  assert.deepEqual(plenxIds().map((m) => [m.id, m.available, m.keyEnv]), [
    ['plenx:omni-flash-video', false, 'PLENX_API_KEY'],
    ['plenx:flux-3', false, 'PLENX_API_KEY'],
  ]);
  const state = applyModelConfigAction('provider-update', { id: 'plenx', apiKey: 'pk_plenx_9876', resolution: '1080p' });
  assert.equal(process.env.PLENX_API_KEY, 'pk_plenx_9876');
  assert.equal(process.env.PLENX_VIDEO_RESOLUTION, '1080p');
  assert.ok(plenxIds().every((m) => m.available));
  assert.equal(field(state, 'plenx', 'apiKey').masked, '••••9876');
  assert.throws(() => applyModelConfigAction('model-add', { provider: 'plenx', kind: 'image', id: 'x', label: 'x' }), /không hỗ trợ/);
  const added = applyModelConfigAction('model-add', { provider: 'plenx', kind: 'motion', id: 'kling-4.0', label: '' });
  assert.ok(added.models.some((m) => m.id === 'plenx:kling-4.0' && m.kind === 'motion'));
  applyModelConfigAction('model-delete', { id: 'plenx:kling-4.0' });
  applyModelConfigAction('provider-update', { id: 'plenx', apiKey: '', resolution: '' });
  assert.equal(process.env.PLENX_API_KEY, undefined);
});

test('hiding a built-in model drops it from the picker and restoring brings it back', () => {
  const id = IMAGE_MODELS[0].id;
  applyModelConfigAction('model-hidden', { id, hidden: true });
  assert.ok(!pickerModels('image', IMAGE_MODELS).some((m) => m.id === id));
  assert.equal(describeModelConfig().models.find((m) => m.id === id).hidden, true);
  applyModelConfigAction('model-hidden', { id, hidden: false });
  assert.ok(pickerModels('image', IMAGE_MODELS).some((m) => m.id === id));
  assert.throws(() => applyModelConfigAction('model-hidden', { id: 'myhost:gpt-image-1', hidden: true }), /không phải model có sẵn/);
});

test('generation through a custom provider posts to its endpoint with its key and the aspect size', async () => {
  const refPath = join(process.cwd(), 'ref.png');
  writeFileSync(refPath, Buffer.from('fake'));
  const logs = [];
  const url = await runImageModel('', 'myhost:gpt-image-1', { prompt: 'a boat', refPaths: [], aspect: '9:16', onLog: (line) => logs.push(line) });
  assert.equal(url, 'https://cdn.example/out.png');
  assert.equal(requests[0].url, '/v1/images/generations');
  assert.equal(requests[0].auth, 'Bearer sk-custom-1111');
  assert.deepEqual({ model: requests[0].body.model, size: requests[0].body.size }, { model: 'gpt-image-1', size: '1024x1536' });

  await runImageModel('', 'myhost:gpt-image-1', { prompt: 'a boat', refPaths: [refPath], aspect: '16:9', onLog: () => {} });
  assert.equal(requests[1].url, '/v1/images/edits');
  assert.equal(requests[1].body.size, '1536x1024');
  assert.match(requests[1].body.images[0].image_url, /^data:image\/png;base64,/);
});

test('removing a provider removes its models and later generation no longer routes to it', () => {
  const state = applyModelConfigAction('provider-delete', { id: 'myhost' });
  assert.ok(!state.models.some((m) => m.provider === 'myhost'));
  assert.equal(providerOf('myhost:gpt-image-1').id, 'replicate');
});

test('invalid input is rejected without changing the config', () => {
  const before = JSON.stringify(describeModelConfig());
  assert.throws(() => applyModelConfigAction('provider-add', { id: 'meta', label: 'x', baseUrl, apiKey: 'k' }), /đã tồn tại/);
  assert.throws(() => applyModelConfigAction('model-add', { provider: 'meta', kind: 'motion', id: 'v', label: 'v' }), /không hỗ trợ/);
  assert.equal(JSON.stringify(describeModelConfig()), before);
});
