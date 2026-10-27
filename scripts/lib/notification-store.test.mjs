// node --test scripts/lib/notification-store.test.mjs
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendNotification, clearNotifications, NOTIFICATION_LIMIT, readNotifications, sanitizeNotification,
} from './notification-store.mjs';

let file;
beforeEach(() => { file = join(mkdtempSync(join(tmpdir(), 'notifications-')), 'nested', 'p.json'); });

const entry = (id, extra = {}) => ({ id, at: '2026-10-27T10:00:00.000Z', ok: true, message: `msg ${id}`, ...extra });

test('reads an empty list when the file is missing or corrupt', () => {
  assert.deepEqual(readNotifications(file), []);
  appendNotification(file, entry('a'));
  writeFileSync(file, '{not json');
  assert.deepEqual(readNotifications(file), []);
});

test('appends newest first and survives a re-read', () => {
  appendNotification(file, entry('a'));
  appendNotification(file, entry('b'));
  assert.deepEqual(readNotifications(file).map((n) => n.id), ['b', 'a']);
});

test('ignores a notification whose id is already stored', () => {
  appendNotification(file, entry('a'));
  const list = appendNotification(file, entry('a', { message: 'again' }));
  assert.equal(list.length, 1);
  assert.equal(list[0].message, 'msg a');
});

test('keeps only the newest NOTIFICATION_LIMIT notifications', () => {
  for (let i = 0; i < NOTIFICATION_LIMIT + 5; i++) appendNotification(file, entry(`n${i}`));
  const list = readNotifications(file);
  assert.equal(list.length, NOTIFICATION_LIMIT);
  assert.equal(list[0].id, `n${NOTIFICATION_LIMIT + 4}`);
});

test('clear empties the list', () => {
  appendNotification(file, entry('a'));
  clearNotifications(file);
  assert.deepEqual(readNotifications(file), []);
});

test('sanitize keeps a valid notification with its action', () => {
  const input = entry('a', { title: 'Sinh ảnh hoàn thành', action: { label: 'Chọn lại 2 scene lỗi', scenes: [3, 4] }, extra: 'dropped' });
  assert.deepEqual(sanitizeNotification(input), {
    id: 'a', at: '2026-10-27T10:00:00.000Z', ok: true, title: 'Sinh ảnh hoàn thành', message: 'msg a',
    action: { label: 'Chọn lại 2 scene lỗi', scenes: [3, 4] },
  });
});

test('sanitize rejects a notification without an id or message', () => {
  assert.equal(sanitizeNotification(entry('')), null);
  assert.equal(sanitizeNotification({ ...entry('a'), message: '' }), null);
  assert.equal(sanitizeNotification(null), null);
});

test('sanitize drops a malformed action and non-integer scenes', () => {
  assert.equal(sanitizeNotification(entry('a', { action: { label: 'x', scenes: 'all' } })).action, undefined);
  assert.deepEqual(sanitizeNotification(entry('a', { action: { label: 'x', scenes: [1, 'b', 2.5, 3] } })).action.scenes, [1, 3]);
});

test('sanitize falls back to now when the timestamp is invalid', () => {
  const clean = sanitizeNotification(entry('a', { at: 'yesterday' }));
  assert.ok(!Number.isNaN(Date.parse(clean.at)));
});
