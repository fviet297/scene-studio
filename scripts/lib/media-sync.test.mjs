// node --test scripts/lib/media-sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyProjectSync, listSourceProjects, planProjectSync } from './media-sync.mjs';

const OLD = new Date('2026-01-01T00:00:00Z');
const NEW = new Date('2026-06-01T00:00:00Z');

const put = (base, slug, rel, text, mtime) => {
  const file = join(base, 'public', 'projects', slug, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
  utimesSync(file, mtime, mtime);
  return file;
};

const setup = () => ({
  root: mkdtempSync(join(tmpdir(), 'sync-src-')),
  localBase: mkdtempSync(join(tmpdir(), 'sync-dst-')),
});

test('lists only the projects that have media at the source', () => {
  const { root } = setup();
  put(root, 'gia-long', 'audio/a.mp3', 'x', NEW);
  put(root, 'ngo-quyen', 'audio/a.mp3', 'x', NEW);
  assert.deepEqual(listSourceProjects(root), ['gia-long', 'ngo-quyen']);
});

test('copies missing and newer files, keeps source mtime, then reports up to date', () => {
  const { root, localBase } = setup();
  put(root, 'gia-long', 'audio/a.mp3', 'fresh', NEW);
  put(root, 'gia-long', 'images/b.jpg', 'new-b', NEW);
  const local = put(localBase, 'gia-long', 'images/b.jpg', 'old-b', OLD);

  const plan = planProjectSync('gia-long', { root, localBase });
  assert.deepEqual(plan.copy.map((f) => [f.rel.replaceAll('\\', '/'), f.reason]).sort(), [['audio/a.mp3', 'missing'], ['images/b.jpg', 'newer']]);
  applyProjectSync(plan);
  assert.equal(readFileSync(local, 'utf8'), 'new-b');

  const again = planProjectSync('gia-long', { root, localBase });
  assert.equal(again.copy.length, 0);
  assert.equal(again.upToDate, 2);
});

test('never overwrites a local file that is newer than the source', () => {
  const { root, localBase } = setup();
  put(root, 'gia-long', 'images/b.jpg', 'src', OLD);
  const local = put(localBase, 'gia-long', 'images/b.jpg', 'mine', NEW);
  const plan = planProjectSync('gia-long', { root, localBase });
  assert.equal(plan.copy.length, 0);
  assert.equal(plan.localNewer, 1);
  applyProjectSync(plan);
  assert.equal(readFileSync(local, 'utf8'), 'mine');
});

test('rejects an invalid slug and a project missing at the source', () => {
  const { root, localBase } = setup();
  assert.throws(() => planProjectSync('../etc', { root, localBase }), /slug không hợp lệ/);
  assert.throws(() => planProjectSync('khong-co', { root, localBase }), /nguồn không có media/);
});
