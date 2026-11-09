import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_LOGO,
  detectLogoExt,
  detectVideoExt,
  hasCustomLogo,
  isSafeSvg,
  logoStaticPath,
  resetCustomAsset,
  saveCustomAsset,
} from './brand-assets.mjs';

const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(16)]);
const withDir = (run) => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-assets-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('detects logo formats from magic bytes', () => {
  assert.equal(detectLogoExt(png), '.png');
  assert.equal(detectLogoExt(Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.alloc(16)])), '.jpg');
  assert.equal(detectLogoExt(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')), '.svg');
  assert.equal(detectLogoExt(Buffer.from('this is just a text file, not an image')), '');
});

test('refuses svg that can run script', () => {
  assert.equal(isSafeSvg(Buffer.from('<svg><path d="M0 0"/></svg>')), true);
  assert.equal(isSafeSvg(Buffer.from('<svg><script>alert(1)</script></svg>')), false);
  assert.equal(isSafeSvg(Buffer.from('<svg onload="alert(1)"></svg>')), false);
  assert.equal(isSafeSvg(Buffer.from('<svg><a href="javascript:alert(1)"/></svg>')), false);
});

test('detects intro containers', () => {
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(16)]);
  const webm = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(16)]);
  assert.equal(detectVideoExt(mp4), '.mp4');
  assert.equal(detectVideoExt(webm), '.webm');
  assert.equal(detectVideoExt(Buffer.from('not a video at all, plain text')), '');
});

test('falls back to the bundled logo until one is uploaded', () => {
  withDir((dir) => {
    assert.equal(logoStaticPath(dir), DEFAULT_LOGO);
    assert.equal(hasCustomLogo(dir), false);
  });
});

test('a new upload replaces the previous one under a new name', () => {
  withDir((dir) => {
    const first = saveCustomAsset('logo', png, '.png', () => {}, dir);
    assert.equal(logoStaticPath(dir), `brand/custom/${first.name}`);
    const second = saveCustomAsset('logo', png, '.png', () => {}, dir);
    assert.equal(logoStaticPath(dir), `brand/custom/${second.name}`);
    assert.equal(readdirSync(dir).filter((n) => n.startsWith('logo-')).length, 1);
  });
});

test('a rejected upload keeps the current asset and leaves no staging file', () => {
  withDir((dir) => {
    const kept = saveCustomAsset('logo', png, '.png', () => {}, dir);
    assert.throws(() => saveCustomAsset('logo', png, '.png', () => { throw new Error('nope'); }, dir), /nope/);
    assert.equal(logoStaticPath(dir), `brand/custom/${kept.name}`);
    assert.deepEqual(readdirSync(dir), [kept.name]);
  });
});

test('reset removes the custom logo and restores the default', () => {
  withDir((dir) => {
    saveCustomAsset('logo', png, '.png', () => {}, dir);
    resetCustomAsset('logo', dir);
    assert.equal(logoStaticPath(dir), DEFAULT_LOGO);
    assert.equal(existsSync(dir), true);
  });
});
