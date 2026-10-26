// Writes the upload copy (title, description, hashtags) for YouTube, TikTok and Facebook from a
// project's narration, in one LLM call (scripts/lib/llm-client.mjs). Read by the panel's
// "Đăng bài" dialog (POST /api/social-generate); nothing is written to the project.

import { chatJson } from './llm-client.mjs';

export const PLATFORMS = ['youtube', 'tiktok', 'facebook'];
export const MAX_SOCIAL_NOTE = 1000;
// Each platform's own cap; the prompt asks for less, so the cut below only guards a model that
// ignores it (YouTube rejects a longer title outright).
const TITLE_LIMIT = { youtube: 100, tiktok: 150, facebook: 255 };
const MAX_HASHTAGS = 8;

const SOCIAL_SYSTEM = `You are the growth editor of a Vietnamese-language history storytelling channel. From the full voice-over of ONE finished video you write the upload copy for YouTube, TikTok and Facebook. Every word you write is Vietnamese (vi-VN) with full diacritics, except hashtags, which are written without diacritics or spaces (#LichSuVietNam).

THE JOB: MAKE PEOPLE STOP AND WATCH
- Every title and the first line of every description must give a scrolling viewer a reason to stop: a curiosity gap (raise the question the video answers, never give the answer away), a paradox or reversal, high stakes, a concrete striking detail (a number, a place, a decisive moment), or a sharp contrast between two people or two choices.
- Pull the hook from the video's own most dramatic moment or its central question. Name the person, place or event: concrete beats vague.
- Strong, specific verbs and emotional weight; no bland summary titles like “Tiểu sử của X” or “Câu chuyện về Y”.
- Honest hooks only: every claim and every implied promise must be delivered by the narration. Never invent facts, numbers or quotes, never promise something the video does not show. No ALL-CAPS words, at most one emoji per title, no “SỐC”, “KHÔNG THỂ TIN NỔI” and other cheap clickbait.

PER PLATFORM
- youtube.title: 55 to 70 characters, the person or event name in the first half (search), then the hook.
  youtube.description: first two lines are the hook (they show above “Xem thêm”); then a 3 to 5 sentence summary that teases the turning points without spoiling the ending; then one question inviting viewers to comment. 600 to 1200 characters, plain paragraphs separated by blank lines.
  youtube.hashtags: 3 to 5.
- tiktok.title: a punchy on-cover hook under 60 characters.
  tiktok.description: the caption, 150 to 300 characters: one hook line, one line of tension, one question for the comments. Up to 2 fitting emoji.
  tiktok.hashtags: 4 to 6, mixing broad (#lichsu, #xuhuong) and specific ones.
- facebook.title: under 80 characters, the hook as a statement or a question.
  facebook.description: a story-style post, 300 to 600 characters: open on the most dramatic moment, build the tension in two or three short paragraphs, end with an open question. Up to 3 emoji.
  facebook.hashtags: 2 to 4.

Do not put the hashtags inside the descriptions; they go only in the hashtags arrays.

OUTPUT — one JSON object and nothing else. Inside string values quote with typographic quotes (“ ”), never a bare double quote:
{"youtube": {"title": "...", "description": "...", "hashtags": ["#..."]}, "tiktok": {...}, "facebook": {...}}`;

const asText = (value) => (typeof value === 'string' ? value.trim() : '');

// "lich su" / "#Lịch Sử" → "#LichSu": no diacritics or spaces, so the tag links on every platform.
const toHashtag = (value) => {
  const words = asText(value)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/^#+/, '')
    .split(/[^A-Za-z0-9_]+/)
    .filter(Boolean);
  if (!words.length) return '';
  return `#${words.length === 1 ? words[0] : words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')}`;
};

const normalizePost = (raw, platform) => {
  const title = asText(raw?.title).replace(/\s+/g, ' ').slice(0, TITLE_LIMIT[platform]);
  const description = asText(raw?.description).replace(/\n{3,}/g, '\n\n');
  const hashtags = [...new Set((Array.isArray(raw?.hashtags) ? raw.hashtags : []).map(toHashtag).filter(Boolean))].slice(0, MAX_HASHTAGS);
  return { title, description, hashtags, titleLimit: TITLE_LIMIT[platform] };
};

const socialRequest = ({ title, narration, note }) => `Video title in the project: ${title || '(none)'}

Full voice-over, scene by scene:
<<<
${narration}
>>>${note ? `\n\nExtra instructions from the channel owner:\n<<<\n${note}\n>>>` : ''}

Write the JSON object now.`;

// { title, scenes: [{ scene, narration }], note? } → { youtube, tiktok, facebook }, each
// { title, description, hashtags, titleLimit }. Throws when the plan has no narration yet or the
// reply leaves a platform without a title.
export const writeSocialPosts = async ({ title, scenes, note, signal, onLog }) => {
  const narration = scenes.filter((s) => s.narration).map((s) => `${s.scene}. ${s.narration}`).join('\n');
  if (!narration) throw new Error('Dự án chưa có narration để viết bài đăng.');
  const reply = await chatJson({ system: SOCIAL_SYSTEM, user: socialRequest({ title, narration, note }), signal, onLog, label: 'Viết bài đăng' });
  const posts = Object.fromEntries(PLATFORMS.map((p) => [p, normalizePost(reply[p], p)]));
  const missing = PLATFORMS.filter((p) => !posts[p].title);
  if (missing.length) throw new Error(`LLM không trả về tiêu đề cho ${missing.join(', ')}.`);
  return posts;
};
