// node --test scripts/lib/llm-client.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chatJson, chatText } from './llm-client.mjs';

let server;
let mode = 'sse';
let lastBody = null;

const sseChunk = (delta, finish = null) => `data: ${JSON.stringify({ choices: [{ delta, finish_reason: finish }] })}\n\n`;

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      lastBody = JSON.parse(raw);
      if (mode === 'http-400') { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":{"message":"bad model"}}'); return; }
      if (mode === 'json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }] }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(': keep-alive\n\n');
      res.write(sseChunk({ reasoning_content: 'thinking…' }));
      res.write(sseChunk({ content: '{"scenes":' }));
      res.write(sseChunk({ content: ' [1, 2]}' }, mode === 'sse-length' ? 'length' : 'stop'));
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.LLM_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_MODEL = 'test-model';
});

after(() => server.close());

test('a streamed reply is assembled from the delta chunks, ignoring comments and reasoning', async () => {
  mode = 'sse';
  const reply = await chatJson({ system: 's', user: 'u' });
  assert.deepEqual(reply, { scenes: [1, 2] });
  assert.equal(lastBody.stream, true);
  assert.deepEqual(lastBody.response_format, { type: 'json_object' });
});

test('chatText returns the streamed text trimmed', async () => {
  mode = 'sse';
  assert.equal(await chatText({ system: 's', user: 'u' }), '{"scenes": [1, 2]}');
});

test('a server that ignores stream and answers plain JSON still works', async () => {
  mode = 'json';
  assert.deepEqual(await chatJson({ system: 's', user: 'u' }), { a: 1 });
});

test('a reply cut at the token limit fails without a retry', async () => {
  mode = 'sse-length';
  const logs = [];
  await assert.rejects(chatJson({ system: 's', user: 'u', onLog: (l) => logs.push(l) }), /vượt giới hạn token/);
  assert.deepEqual(logs, []);
});

test('an HTTP error status reports the provider message', async () => {
  mode = 'http-400';
  await assert.rejects(chatJson({ system: 's', user: 'u', label: 'Viết' }), /Viết 400: bad model/);
});
