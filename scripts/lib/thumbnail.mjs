// YouTube thumbnail for the panel's "Thumbnail" dialog (review-thumbnail.js). The panel draws the
// headline itself on a canvas, so Vietnamese diacritics always come out right; this module only
//   writeThumbnailIdeas — one LLM call (llm-client.mjs): three concepts (emotional conflict,
//                         historical drama, curiosity), each with a short headline, the cast to
//                         show and an English prompt for an AI background;
//   generateThumbnailBackground — that prompt, in the project's style, through the image model the
//                         user picked, with the cast's reference images locking their faces. The
//                         picture leaves one side calm for the headline and carries no text;
//   letterThumbnail — the opposite, on request: the image model draws the headline into the picture
//                         in a chosen lettering style. Models garble Vietnamese diacritics, so the
//                         panel keeps the canvas headline as the always-correct path.

import { chatJson } from './llm-client.mjs';
import { download, getTemplates, NO_TEXT_POLICY, runImageModel } from './replicate-image.mjs';

export const THUMB_SIDES = ['left', 'right'];
export const MAX_THUMB_PROMPT = 1500;
export const MAX_LETTER_STYLE = 400;
export const MAX_LETTER_LINES = 4;
export const MAX_LETTER_LINE = 60;
const MAX_HEADLINES = 5;
const MAX_THUMB_CAST = 2;

const CONCEPT_IDS = ['A', 'B', 'C'];

const IDEAS_SYSTEM = `You are the thumbnail strategist of "Chuyện Cũ Kể Lại", a Vietnamese-language YouTube channel that tells Vietnamese history, military history and historical figures as engaging stories. From the full voice-over of ONE video and its title you design three different thumbnail concepts.

THE TITLE + THUMBNAIL PAIR
- The thumbnail must not merely illustrate the title. It adds a second layer, a feeling, a stake or a detail the title leaves out, so the pair pulls harder than either alone.
- Never repeat the title word for word on the thumbnail. Everything must come from the narration: no invented events, and nothing that makes a viewer misread what happened in history. Show people in their true role and period.

THREE CONCEPTS — "concepts", exactly these three, in this order
- A, "emotional-conflict": conflict between people, the faces and feeling of the figures.
- B, "historical-drama": the decisive moment, event or turning point of the story.
- C, "curiosity-mystery": one odd, hidden or paradoxical detail that makes a viewer need to know more.
Each concept has:
- "headline": Vietnamese (vi-VN) with full diacritics, 2 to 5 words, at most 28 characters, readable at phone size in one glance. A curiosity gap, a paradox, a stake, a contrast or a concrete detail; it does not give the answer away. No cheap clickbait such as “SỐC”, no emoji, no hashtags.
- "emotion": Vietnamese, a few words: the feeling the thumbnail should land.
- "titleFit": Vietnamese, one sentence: what this thumbnail adds to the title.
- "chars": ids of at most ${MAX_THUMB_CAST} cast members to show, the main figure first; [] when the strongest picture needs no cast member.
- "prompt": English, 40 to 90 words, ONE frozen moment, built to read when shrunk: the main subject (cast members by name only; their face and costume come from reference images, never describe them), the composition (prefer a big close-up or medium close-up of one or two faces over a wide crowd scene), the facial expression (fury, dread, defiance, grief…), what they do, a simple historical setting with era and place named, and the light and colour mood. At most two figures and one clear focal point; no crowds of detail. No text, letters, logos, frames or split screens.

"recommended": the letter (A, B or C) of the concept that pairs best with the title.
"alternatives": ${MAX_HEADLINES - CONCEPT_IDS.length} more Vietnamese headlines (same rules) for the recommended concept, each from a different angle (question, number, contrast, bold claim).

OUTPUT — one JSON object and nothing else. Inside string values quote with typographic quotes (“ ”), never a bare double quote:
{"concepts": [{"id": "A", "headline": "...", "emotion": "...", "titleFit": "...", "chars": ["char-a"], "prompt": "..."}, {"id": "B", ...}, {"id": "C", ...}], "recommended": "A", "alternatives": ["...", "..."]}`;

const asText = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

const ideasRequest = ({ title, scenes, cast }) => `Video title: ${title || '(none)'}

Cast (id — name):
${cast.length ? cast.map((c) => `${c.id} — ${c.name}`).join('\n') : '(none)'}

Full voice-over, scene by scene:
<<<
${scenes.filter((s) => s.narration).map((s) => `${s.scene}. ${s.narration}`).join('\n')}
>>>

Write the JSON object now.`;

// One concept the model returned → { id, headline, emotion, titleFit, chars, prompt }, or null when
// it lacks a headline or a picture prompt. Cast ids the project does not have are dropped.
const normalizeConcept = (raw, id, castIds) => {
  const headline = asText(raw?.headline);
  const prompt = asText(raw?.prompt).slice(0, MAX_THUMB_PROMPT);
  if (!headline || !prompt) return null;
  const chars = [...new Set(Array.isArray(raw?.chars) ? raw.chars.map(asText) : [])].filter((c) => castIds.includes(c)).slice(0, MAX_THUMB_CAST);
  return { id, headline, emotion: asText(raw?.emotion), titleFit: asText(raw?.titleFit), chars, prompt };
};

// The model's reply → { headlines, chars, prompt, concepts, recommended }. headlines / chars /
// prompt are the recommended concept's, so a caller that ignores `concepts` still gets one idea;
// headlines lists the recommended one first, then the other concepts', then the alternatives.
export const normalizeThumbnailIdeas = (reply, cast) => {
  const castIds = cast.map((c) => c.id);
  const list = Array.isArray(reply?.concepts) ? reply.concepts : [];
  const concepts = CONCEPT_IDS
    .map((id, i) => normalizeConcept(list.find((c) => asText(c?.id).toUpperCase() === id) ?? list[i], id, castIds))
    .filter(Boolean);
  if (!concepts.length) throw new Error('LLM không trả về chữ hoặc prompt cho thumbnail.');
  const recommended = concepts.find((c) => c.id === asText(reply.recommended).toUpperCase()) ?? concepts[0];
  const alternatives = (Array.isArray(reply.alternatives) ? reply.alternatives : []).map(asText);
  const headlines = [...new Set([recommended.headline, ...concepts.map((c) => c.headline), ...alternatives].filter(Boolean))].slice(0, MAX_HEADLINES);
  return { headlines, chars: recommended.chars, prompt: recommended.prompt, concepts, recommended: recommended.id };
};

// { title, scenes: [{ scene, narration }], cast: [{ id, name }] } → see normalizeThumbnailIdeas.
export const writeThumbnailIdeas = async ({ title, scenes, cast, signal }) => {
  if (!scenes.some((s) => s.narration)) throw new Error('Dự án chưa có narration để gợi ý thumbnail.');
  const reply = await chatJson({ system: IDEAS_SYSTEM, user: ideasRequest({ title, scenes, cast }), signal, label: 'Gợi ý thumbnail' });
  return normalizeThumbnailIdeas(reply, cast);
};

const castLine = (cast) => (cast.length === 1
  ? `The reference image is ${cast[0].name}: keep their face, hair, skin tone and costume exactly as in the reference.`
  : `The reference images are, in order: ${cast.map((c) => c.name).join(', ')}. Keep each person's face, hair, skin tone and costume exactly as in their own reference.`);

const thumbnailPrompt = ({ styleDna, prompt, cast, side }) => `${NO_TEXT_POLICY}

YOUTUBE THUMBNAIL, 16:9. STYLE: ${styleDna}.
${cast.length ? `\n${castLine(cast)}\n` : ''}
SCENE: ${prompt}

COMPOSITION: built to be read at phone size. One clear focal subject placed in the ${side === 'left' ? 'right' : 'left'} half of the frame, faces large and sharp with a strong readable emotion; dramatic rim light, high contrast, rich saturated colour, uncluttered background. Keep the ${side} third of the frame calm and darker (sky, smoke, shadow, plain wall) with no faces or important detail, so a headline can be laid over it later.

NEGATIVE: text, letters, captions, watermark, logo, border, frame, split screen, collage, tiny distant figures.`;

// One AI background → `outPath`. cast: [{ name, refPath }] (at most MAX_THUMB_CAST are sent);
// side: where the headline will go. `signal` cancels the provider call.
export const generateThumbnailBackground = async ({ prompt, cast, side, model, outPath, signal, onLog = () => {} }) => {
  const shown = cast.slice(0, MAX_THUMB_CAST);
  const fullPrompt = thumbnailPrompt({ styleDna: getTemplates().styleDna, prompt, cast: shown, side });
  onLog(`model=${model}, ${shown.length} ảnh tham chiếu, prompt=${fullPrompt.length} ký tự`);
  const url = await runImageModel(process.env.REPLICATE_API_TOKEN, model, {
    prompt: fullPrompt, refPaths: shown.map((c) => c.refPath), aspect: '16:9', onLog, signal,
  });
  signal?.throwIfAborted(); // cancelled while the provider finished: keep nothing
  onLog('đang tải ảnh về');
  await download(url, outPath);
};

// Request body of POST /api/thumbnail-lettering → { kicker, lines, styleHint, side }, or throws a
// Vietnamese message the panel shows as is.
export const parseLetteringRequest = (body) => {
  const kicker = asText(body.kicker);
  const lines = (Array.isArray(body.lines) ? body.lines : []).map(asText).filter(Boolean);
  const styleHint = asText(body.styleHint);
  if (!kicker && !lines.length) throw new Error('Nhập chữ cho thumbnail trước.');
  if (lines.length > MAX_LETTER_LINES) throw new Error(`Tiêu đề tối đa ${MAX_LETTER_LINES} dòng.`);
  if ([kicker, ...lines].some((line) => line.length > MAX_LETTER_LINE)) throw new Error(`Mỗi dòng chữ tối đa ${MAX_LETTER_LINE} ký tự.`);
  if (!styleHint) throw new Error('Nhập kiểu chữ cho AI.');
  if (styleHint.length > MAX_LETTER_STYLE) throw new Error(`Kiểu chữ tối đa ${MAX_LETTER_STYLE} ký tự.`);
  if (!THUMB_SIDES.includes(body.side)) throw new Error(`side must be ${THUMB_SIDES.join(' | ')}`);
  return { kicker, lines, styleHint, side: body.side };
};

export const letteringPrompt = ({ kicker, lines, styleHint, side }) => `Edit this YouTube thumbnail: keep the picture exactly as it is (composition, characters, faces, colours and lighting stay untouched) and add lettering to it.

TEXT TO ADD. Copy it letter by letter with every Vietnamese diacritic exactly as written, and add no other words or text anywhere:
${kicker ? `Small line above the headline: “${kicker}”\n` : ''}Headline${lines.length > 1 ? ', one row per line' : ''}:
${lines.map((line) => `“${line}”`).join('\n')}

LETTERING STYLE: ${styleHint}.

PLACEMENT: on the ${side} side of the frame over the calmer, darker area, vertically centred. Large enough to read at phone size, high contrast against the picture, never covering a face; keep the bottom-right corner free.`;

// The panel's text-free composition (`imagePath`) → the same picture with AI lettering → `outPath`.
export const letterThumbnail = async ({ imagePath, request, model, outPath, signal, onLog = () => {} }) => {
  const prompt = letteringPrompt(request);
  onLog(`model=${model}, prompt=${prompt.length} ký tự`);
  const url = await runImageModel(process.env.REPLICATE_API_TOKEN, model, {
    prompt, refPaths: [imagePath], aspect: '16:9', onLog, signal,
  });
  signal?.throwIfAborted(); // cancelled while the provider finished: keep nothing
  onLog('đang tải ảnh về');
  await download(url, outPath);
};
