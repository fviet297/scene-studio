// YouTube thumbnail for the panel's "Thumbnail" dialog (review-thumbnail.js). The panel draws the
// headline itself on a canvas, so Vietnamese diacritics always come out right; this module only
//   writeThumbnailIdeas — one LLM call (llm-client.mjs): short headline options, the cast to show,
//                         and an English prompt for an AI background;
//   generateThumbnailBackground — that prompt, in the project's style, through the image model the
//                         user picked, with the cast's reference images locking their faces. The
//                         picture leaves one side calm for the headline and carries no text.

import { chatJson } from './llm-client.mjs';
import { download, getTemplates, NO_TEXT_POLICY, runImageModel } from './replicate-image.mjs';

export const THUMB_SIDES = ['left', 'right'];
export const MAX_THUMB_PROMPT = 1500;
const MAX_HEADLINES = 5;
const MAX_THUMB_CAST = 2;

const IDEAS_SYSTEM = `You design YouTube thumbnails for a Vietnamese-language history storytelling channel. From the full voice-over of ONE video you propose the headline text and the picture.

HEADLINES — "headlines": ${MAX_HEADLINES} options, Vietnamese (vi-VN) with full diacritics
- 2 to 5 words each, at most 28 characters: readable at phone size in one glance.
- Each must make a scrolling viewer need to click: a curiosity gap, a paradox, a shocking stake, a sharp contrast, or a striking concrete detail (a number, a decisive moment). Do not give the answer away and do not repeat the video title word for word; the thumbnail and the title work together.
- Vary the angle across the options (question, bold claim, number, contrast, emotion).
- Honest: only what the narration delivers. No invented facts, no cheap clickbait words such as “SỐC”, no emoji, no hashtags.

PICTURE
- "chars": ids of at most ${MAX_THUMB_CAST} cast members to show, the main figure first; [] when the strongest picture needs no cast member.
- "prompt": English, 40 to 90 words, ONE dramatic frozen moment from the story that raises the same question as the headlines: who (cast members by name only — their face and costume come from reference images, never describe them), the emotion on their face (fury, dread, defiance, grief…), what they do, and a simple setting with era and place named. Prefer a big close-up or medium close-up of one or two faces with strong emotion over a wide crowd scene. No text, letters, logos, frames or split screens.

OUTPUT — one JSON object and nothing else. Inside string values quote with typographic quotes (“ ”), never a bare double quote:
{"headlines": ["...", "..."], "chars": ["char-a"], "prompt": "..."}`;

const asText = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

const ideasRequest = ({ title, scenes, cast }) => `Video title: ${title || '(none)'}

Cast (id — name):
${cast.length ? cast.map((c) => `${c.id} — ${c.name}`).join('\n') : '(none)'}

Full voice-over, scene by scene:
<<<
${scenes.filter((s) => s.narration).map((s) => `${s.scene}. ${s.narration}`).join('\n')}
>>>

Write the JSON object now.`;

// { title, scenes: [{ scene, narration }], cast: [{ id, name }] } → { headlines, chars, prompt }.
export const writeThumbnailIdeas = async ({ title, scenes, cast, signal }) => {
  if (!scenes.some((s) => s.narration)) throw new Error('Dự án chưa có narration để gợi ý thumbnail.');
  const reply = await chatJson({ system: IDEAS_SYSTEM, user: ideasRequest({ title, scenes, cast }), signal, label: 'Gợi ý thumbnail' });
  const castIds = cast.map((c) => c.id);
  const headlines = [...new Set((Array.isArray(reply.headlines) ? reply.headlines : []).map(asText).filter(Boolean))].slice(0, MAX_HEADLINES);
  const chars = [...new Set(Array.isArray(reply.chars) ? reply.chars.map(asText) : [])].filter((id) => castIds.includes(id)).slice(0, MAX_THUMB_CAST);
  const prompt = asText(reply.prompt).slice(0, MAX_THUMB_PROMPT);
  if (!headlines.length || !prompt) throw new Error('LLM không trả về chữ hoặc prompt cho thumbnail.');
  return { headlines, chars, prompt };
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
