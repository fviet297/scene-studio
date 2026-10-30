import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './ensure-ffmpeg.mjs';
import { ensureThumbnail, thumbWidth } from './image-thumb.mjs';

const widthOf = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

test('maps a requested width to an allowed thumbnail width, or null for the original', () => {
  assert.equal(thumbWidth('100'), 160);
  assert.equal(thumbWidth(160), 160);
  assert.equal(thumbWidth(200), 320);
  assert.equal(thumbWidth(321), null);
  assert.equal(thumbWidth('abc'), null);
  assert.equal(thumbWidth(undefined), null);
  assert.equal(thumbWidth(-5), null);
});

test('creates a smaller JPEG once and reuses it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'thumb-'));
  const source = join(dir, 'scene-01.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=1280x720', '-frames:v', '1', source]);
  const cacheDir = join(dir, 'cache');
  const first = await ensureThumbnail({ source, cacheDir, width: 160 });
  assert.equal(widthOf(first), 160);
  assert.equal(await ensureThumbnail({ source, cacheDir, width: 160 }), first);
  assert.ok(existsSync(first));
});
