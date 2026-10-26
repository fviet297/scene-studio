// node --test scripts/lib/model-config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addCustomProvider, addModel, ConfigError, customProviderOf, emptyConfig, initModelConfig, loadConfig,
  maskKey, modelIdFor, removeCustomProvider, removeModel, saveConfig, setBuiltinSettings, setModelHidden,
  updateConfig, updateCustomProvider, updateModel,
} from './model-config.mjs';

const withProvider = () => addCustomProvider(emptyConfig(), { id: 'myhost', label: 'My host', baseUrl: 'https://img.example.com/v1/', apiKey: 'sk-secret-1234' });
const rejects = (fn, pattern) => assert.throws(fn, (error) => error instanceof ConfigError && pattern.test(error.message));

test('custom provider is added with a trimmed endpoint and returned as a new config', () => {
  const before = emptyConfig();
  const after = addCustomProvider(before, { id: 'MyHost', label: ' My host ', baseUrl: 'https://img.example.com/v1/', apiKey: 'k' });
  assert.deepEqual(before.providers, []);
  assert.deepEqual(after.providers, [{ id: 'myhost', label: 'My host', baseUrl: 'https://img.example.com/v1', apiKey: 'k' }]);
});

test('custom provider rejects built-in ids, duplicates, bad slugs, bad urls and missing key', () => {
  const config = withProvider();
  const input = { id: 'other', label: 'x', baseUrl: 'https://a.b', apiKey: 'k' };
  rejects(() => addCustomProvider(config, { ...input, id: 'replicate' }), /đã tồn tại/);
  rejects(() => addCustomProvider(config, { ...input, id: 'myhost' }), /đã tồn tại/);
  rejects(() => addCustomProvider(config, { ...input, id: 'Bad Id!' }), /ID provider/);
  rejects(() => addCustomProvider(config, { ...input, baseUrl: 'ftp://a.b' }), /http/);
  rejects(() => addCustomProvider(config, { ...input, baseUrl: 'not a url' }), /URL/);
  rejects(() => addCustomProvider(config, { ...input, apiKey: ' ' }), /API key/);
});

test('updating a custom provider keeps its key unless a new one is sent', () => {
  const config = withProvider();
  const renamed = updateCustomProvider(config, 'myhost', { label: 'Renamed', apiKey: '' });
  assert.equal(renamed.providers[0].apiKey, 'sk-secret-1234');
  assert.equal(renamed.providers[0].label, 'Renamed');
  assert.equal(updateCustomProvider(config, 'myhost', { apiKey: 'new' }).providers[0].apiKey, 'new');
  rejects(() => updateCustomProvider(config, 'nope', {}), /không tồn tại/);
});

test('removing a custom provider removes its models too', () => {
  let config = addModel(withProvider(), { provider: 'myhost', kind: 'image', id: 'gpt-image-1', label: 'GPT' });
  config = addModel(config, { provider: 'muse', kind: 'image', id: 'muse:flux', label: 'Flux' });
  const after = removeCustomProvider(config, 'myhost');
  assert.deepEqual(after.models.map((m) => m.id), ['muse:flux']);
});

test('model id gets the provider prefix once', () => {
  assert.equal(modelIdFor('myhost', 'gpt-image-1'), 'myhost:gpt-image-1');
  assert.equal(modelIdFor('myhost', 'myhost:gpt-image-1'), 'myhost:gpt-image-1');
  assert.equal(modelIdFor('muse', 'muse-image'), 'muse:muse-image');
  assert.equal(modelIdFor('replicate', 'owner/name'), 'owner/name');
});

test('addModel enforces provider kinds, duplicates and price', () => {
  const config = withProvider();
  rejects(() => addModel(config, { provider: 'myhost', kind: 'motion', id: 'v', label: 'v' }), /không hỗ trợ/);
  rejects(() => addModel(config, { provider: 'meta', kind: 'motion', id: 'v', label: 'v' }), /không hỗ trợ/);
  rejects(() => addModel(config, { provider: 'ghost', kind: 'image', id: 'v', label: 'v' }), /không tồn tại/);
  rejects(() => addModel(config, { provider: 'muse', kind: 'video', id: 'v', label: 'v' }), /Loại model/);
  rejects(() => addModel(config, { provider: 'muse', kind: 'image', id: 'muse:x', label: 'x', price: -1 }), /Giá/);
  rejects(() => addModel(config, { provider: 'muse', kind: 'image', id: 'muse:', label: 'x' }), /ID model/);
  rejects(() => addModel(config, { provider: 'muse', kind: 'image', id: 'muse:x', label: 'x' }, ['muse:x']), /đã tồn tại/);
  const added = addModel(config, { provider: 'muse', kind: 'motion', id: 'muse:kling', label: 'Kling', price: '0.4' });
  assert.deepEqual(added.models, [{ id: 'muse:kling', provider: 'muse', kind: 'motion', label: 'Kling', price: 0.4 }]);
  rejects(() => addModel(added, { provider: 'muse', kind: 'motion', id: 'muse:kling', label: 'again' }), /đã tồn tại/);
});

test('a blank label falls back to the id the user typed', () => {
  const config = addModel(withProvider(), { provider: 'myhost', kind: 'image', id: 'gpt-image-1', label: '  ' });
  assert.equal(config.models[0].label, 'gpt-image-1');
});

test('updateModel changes label and price only; removeModel deletes', () => {
  const config = addModel(withProvider(), { provider: 'myhost', kind: 'image', id: 'm', label: 'Old', price: 1 });
  const edited = updateModel(config, 'myhost:m', { label: 'New', price: '' });
  assert.equal(edited.models[0].label, 'New');
  assert.equal(edited.models[0].price, null);
  assert.deepEqual(removeModel(edited, 'myhost:m').models, []);
  rejects(() => removeModel(config, 'myhost:ghost'), /không tồn tại/);
});

test('hiding a built-in model is reversible and idempotent', () => {
  const hidden = setModelHidden(setModelHidden(emptyConfig(), 'a', true), 'a', true);
  assert.deepEqual(hidden.hidden, ['a']);
  assert.deepEqual(setModelHidden(hidden, 'a', false).hidden, []);
});

test('built-in settings: set, keep, clear, and reject unknown fields or bad endpoint', () => {
  let config = setBuiltinSettings(emptyConfig(), 'muse', { apiKey: 'm2a_x', baseUrl: 'http://localhost:18610/' });
  assert.deepEqual(config.overrides.muse, { apiKey: 'm2a_x', baseUrl: 'http://localhost:18610' });
  config = setBuiltinSettings(config, 'muse', { baseUrl: '' });
  assert.deepEqual(config.overrides.muse, { apiKey: 'm2a_x' });
  config = setBuiltinSettings(config, 'muse', { apiKey: '' });
  assert.deepEqual(config.overrides, {});
  assert.deepEqual(setBuiltinSettings(emptyConfig(), 'replicate', { apiKey: 'k', baseUrl: 'http://ignored' }).overrides.replicate, { apiKey: 'k' });
  rejects(() => setBuiltinSettings(emptyConfig(), 'meta', { baseUrl: 'nope' }), /URL/);
  rejects(() => setBuiltinSettings(emptyConfig(), 'ghost', {}), /không có sẵn/);
});

test('LLM provider takes endpoint, key, model and user agent but no image / motion models', () => {
  const config = setBuiltinSettings(emptyConfig(), 'llm', { baseUrl: 'https://api.openai.com/v1/', apiKey: 'sk-x', model: ' gpt-5 ', userAgent: '' });
  assert.deepEqual(config.overrides.llm, { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x', model: 'gpt-5' });
  rejects(() => setBuiltinSettings(emptyConfig(), 'llm', { baseUrl: 'nope' }), /URL/);
  rejects(() => addModel(emptyConfig(), { provider: 'llm', kind: 'image', id: 'gpt-5', label: 'x' }), /không hỗ trợ/);
});

test('customProviderOf matches the provider prefix and returns the model name', () => {
  const config = withProvider();
  assert.deepEqual(customProviderOf(config, 'myhost:gpt-image-1').name, 'gpt-image-1');
  assert.equal(customProviderOf(config, 'muse:flux'), null);
  assert.equal(customProviderOf(config, 'myhost-two:x'), null);
});

test('maskKey hides all but the last four characters of a long key', () => {
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('short'), '••••');
  assert.equal(maskKey('sk-secret-1234'), '••••1234');
});

test('config round-trips through a private file; broken JSON is reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-config-'));
  const path = join(dir, 'data', 'models.json');
  assert.deepEqual(loadConfig(path), emptyConfig());
  const config = withProvider();
  saveConfig(config, path);
  assert.deepEqual(loadConfig(path), config);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.match(readFileSync(path, 'utf8'), /sk-secret-1234/);
  saveConfig({}, path);
  assert.deepEqual(loadConfig(path), emptyConfig());
  writeFileSync(path, '{ broken');
  assert.throws(() => loadConfig(path), /not valid JSON/);
});

test('overrides reach process.env and clearing them restores the original value', () => {
  process.env.REPLICATE_API_TOKEN = 'from-dotenv';
  delete process.env.META_BASE_URL;
  initModelConfig();
  const dir = mkdtempSync(join(tmpdir(), 'model-config-'));
  process.chdir(dir);
  updateConfig((c) => setBuiltinSettings(c, 'replicate', { apiKey: 'from-panel' }));
  updateConfig((c) => setBuiltinSettings(c, 'meta', { baseUrl: 'https://meta.example/v1' }));
  assert.equal(process.env.REPLICATE_API_TOKEN, 'from-panel');
  assert.equal(process.env.META_BASE_URL, 'https://meta.example/v1');
  updateConfig((c) => setBuiltinSettings(setBuiltinSettings(c, 'replicate', { apiKey: '' }), 'meta', { baseUrl: '' }));
  assert.equal(process.env.REPLICATE_API_TOKEN, 'from-dotenv');
  assert.equal(process.env.META_BASE_URL, undefined);
});
