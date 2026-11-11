import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedPauses, internalPauses, parseSilenceLog, strayPauseCount } from './pause-check.mjs';

const log = (duration, silences) => [
  `  Duration: ${duration}, start: 0.000000, bitrate: 768 kb/s`,
  ...silences.flatMap(([start, end]) => [
    `[silencedetect @ 0x1] silence_start: ${start}`,
    ...(end === null ? [] : [`[silencedetect @ 0x1] silence_end: ${end} | silence_duration: ${(end - start).toFixed(3)}`]),
  ]),
].join('\n');

test('parses silence starts, ends and the clip duration', () => {
  const analysis = parseSilenceLog(log('00:00:05.20', [[2.42, 2.87], [4.97, 5.2]]));
  assert.equal(analysis.duration, 5.2);
  assert.deepEqual(analysis.pauses, [{ start: 2.42, end: 2.87 }, { start: 4.97, end: 5.2 }]);
});

test('a trailing silence without an end closes at the clip duration', () => {
  const analysis = parseSilenceLog(log('00:00:03.00', [[2.6, null]]));
  assert.deepEqual(analysis.pauses, [{ start: 2.6, end: 3 }]);
});

test('lead-in and tail silence are not internal pauses', () => {
  const analysis = parseSilenceLog(log('00:00:05.00', [[0, 0.1], [2.3, 2.7], [4.8, null]]));
  assert.deepEqual(internalPauses(analysis), [{ start: 2.3, end: 2.7 }]);
});

test('each comma or semicolon explains one pause', () => {
  assert.equal(expectedPauses('Cuối năm một nghìn sáu trăm ba mươi tư, Đào Duy Từ mất.'), 1);
  assert.equal(expectedPauses('Đào Duy Từ mất.'), 0);
  assert.equal(expectedPauses('a, b; c'), 2);
});

test('a pause the text does not explain is stray; punctuation-explained ones are not', () => {
  const stray = parseSilenceLog(log('00:00:05.20', [[2.35, 2.67]]));
  assert.equal(strayPauseCount(stray, 'Người đặt tên cho hệ thống lũy này là Đào Duy Từ sinh năm'), 1);
  assert.equal(strayPauseCount(stray, 'Người đặt tên cho hệ thống lũy này là Đào Duy Từ, sinh năm'), 0);
});

test('a clean take has no stray pauses', () => {
  assert.equal(strayPauseCount(parseSilenceLog(log('00:00:04.00', [])), 'Đào Duy Từ mất.'), 0);
});
