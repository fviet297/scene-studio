// Text normalisation applied to narration before it reaches OmniVoice.
//
// The model sizes its output from a character-weight estimate (omnivoice/utils/duration.py):
// every digit counts as 3.5 "latin characters", but "208" is actually spoken as
// "hai trăm lẻ tám" — worth ~15.6. So a digit run buys the model roughly a third less
// audio than it needs, and it crams or drops words right there. Observed: "Năm 208, Tào
// Tháo" came back as "5 Sai Tám tảo Thảo".
//
// Spelling numbers out fixes both the duration estimate and the pronunciation. Captions keep
// the original digits — only the TTS input is rewritten.

const ONES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', ' nghìn', ' triệu', ' tỷ'];

// 0..99. `linked` means a higher group precedes it, which is what turns 8 into "lẻ tám".
const readTens = (n, linked) => {
  if (n === 0) return '';
  if (n < 10) return linked ? `lẻ ${ONES[n]}` : ONES[n];
  const [tens, unit] = [Math.floor(n / 10), n % 10];
  if (tens === 1) return unit ? `mười ${unit === 5 ? 'lăm' : ONES[unit]}` : 'mười';
  const spoken = unit === 1 ? 'mốt' : unit === 4 ? 'tư' : unit === 5 ? 'lăm' : ONES[unit];
  return unit ? `${ONES[tens]} mươi ${spoken}` : `${ONES[tens]} mươi`;
};

// 0..999. `linked` forces the "không trăm" filler that Vietnamese uses mid-number (1.008 →
// "một nghìn không trăm lẻ tám").
const readHundreds = (n, linked) => {
  const [hundreds, rest] = [Math.floor(n / 100), n % 100];
  if (!hundreds) return linked ? `không trăm ${readTens(rest, true)}`.trim() : readTens(rest, false);
  return rest ? `${ONES[hundreds]} trăm ${readTens(rest, true)}` : `${ONES[hundreds]} trăm`;
};

// Whole numbers up to 999.999.999.999 — well past anything a history narration says.
export const readNumber = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return String(value);
  if (n === 0) return 'không';
  const groups = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  return groups
    .map((group, index) => (group === 0 ? '' : readHundreds(group, index < groups.length - 1) + SCALES[index]))
    .filter(Boolean)
    .reverse()
    .join(' ');
};

// Digit runs, including thousands separators ("30.000 quân", "30,000 quân").
const NUMBER = /\d{1,3}(?:[.,]\d{3})+|\d+/g;

// Rewrite a narration line for the synthesiser. Only numbers change; punctuation and wording
// are left alone so the delivery still matches what the writer intended.
export const normaliseForTts = (text) =>
  text.replace(NUMBER, (match) => readNumber(match.replace(/[.,]/g, '')));
