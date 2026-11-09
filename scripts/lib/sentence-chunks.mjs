// Chunking for TTS engines whose pauses we control ourselves (VieNeu). Pure functions, no I/O.
//
// Text becomes a list of speech chunks, one TTS request each. The boundary after a chunk is
// either the end of a sentence (. ! ? …) or a colon, which introduces something and wants a
// longer beat than a comma. Commas stay inside a chunk: the model paces those itself.

const CLOSERS_TAIL = '[”’"\')\\]»]*';
const SENTENCE_TAIL = new RegExp(`[.!?…]+${CLOSERS_TAIL}$`);
const COLON_TAIL = /:$/;
const OPENERS = new Set(['“', '«', '(', '[']);
const CLOSERS = new Set(['”', '»', ')', ']']);

// Chunks shorter than this get merged into a neighbour: VieNeu hallucinates on 1-2 word inputs
// (same threshold as `_merge_short_chunks` in VieNeu-TTS).
export const MIN_CHUNK_CHARS = 20;

export const GAP_SENTENCE = 'sentence';
export const GAP_COLON = 'colon';

// Split `text` after every position where the buffer ends in `tail` and a space (or the end)
// follows, but never inside a quotation or brackets, and never mid-token ("3.5", "3:30").
const splitOutsideQuotes = (text, tail) => {
  const chars = [...String(text ?? '')];
  const parts = [];
  let buffer = '';
  let depth = 0;
  let straightQuoteOpen = false;
  chars.forEach((char, index) => {
    buffer += char;
    if (OPENERS.has(char)) depth += 1;
    else if (CLOSERS.has(char)) depth = Math.max(0, depth - 1);
    else if (char === '"') straightQuoteOpen = !straightQuoteOpen;
    const next = chars[index + 1];
    const atBoundary = depth === 0 && !straightQuoteOpen && tail.test(buffer) && (next === undefined || /\s/.test(next));
    if (atBoundary) {
      parts.push(buffer.trim());
      buffer = '';
    }
  });
  if (buffer.trim()) parts.push(buffer.trim());
  return parts.filter(Boolean);
};

export const splitSentences = (text) => splitOutsideQuotes(text, SENTENCE_TAIL);

// [{ text, gapAfter }]: gapAfter is the boundary that follows the chunk (GAP_SENTENCE or
// GAP_COLON). The last chunk's gapAfter is never played.
export const speechChunks = (text, minChars = MIN_CHUNK_CHARS) => {
  const pieces = splitSentences(text).flatMap((sentence) => {
    const clauses = splitOutsideQuotes(sentence, COLON_TAIL);
    return clauses.map((clause, index) => ({ text: clause, gapAfter: index < clauses.length - 1 ? GAP_COLON : GAP_SENTENCE }));
  });

  // Fold a too-short piece into the following one, which keeps its own gap. A short tail folds
  // backwards into the piece before it.
  const chunks = [];
  let carry = '';
  for (const piece of pieces) {
    const joined = carry ? `${carry} ${piece.text}` : piece.text;
    if (joined.length < minChars) {
      carry = joined;
    } else {
      chunks.push({ text: joined, gapAfter: piece.gapAfter });
      carry = '';
    }
  }
  if (carry) {
    if (chunks.length) chunks[chunks.length - 1] = { text: `${chunks.at(-1).text} ${carry}`, gapAfter: GAP_SENTENCE };
    else chunks.push({ text: carry, gapAfter: GAP_SENTENCE });
  }
  return chunks;
};
