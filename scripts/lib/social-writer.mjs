// Writes the upload copy (title, description, hashtags) for YouTube, TikTok and Facebook from a
// project's narration, in one LLM call (scripts/lib/llm-client.mjs). Read by the panel's
// "Đăng bài" dialog (POST /api/social-generate); nothing is written to the project.
//
// The YouTube post carries the full packaging pass: the model first analyses the story, drafts ten
// titles from ten different angles, scores them on a fixed rubric, then picks the one that fits the
// video (not simply the highest score). The runner-up titles and the SEO keyword groups ride along
// as optional fields, so a stored post without them still renders.

import { chatJson } from './llm-client.mjs';

export const PLATFORMS = ['youtube', 'tiktok', 'facebook'];
export const MAX_SOCIAL_NOTE = 1000;
export const CHANNEL_NAME = 'Chuyện Cũ Kể Lại';
// Every YouTube title and description must carry this phrase (prompt rule + code fallback below).
export const BRAND_KEYWORD = 'Kể Chuyện';
export const BRAND_HASHTAG = '#KeChuyen';
// Each platform's own cap; the prompt asks for less, so the cut below only guards a model that
// ignores it (YouTube rejects a longer title outright).
const TITLE_LIMIT = { youtube: 100, tiktok: 150, facebook: 255 };
const MAX_HASHTAGS = 8;
const MAX_TITLE_OPTIONS = 10;
const MAX_KEYWORDS = 8;
// Title rubric, out of 100. The model reports each part; the total is summed here so a slip in
// the model's arithmetic never shows.
const SCORE_PARTS = { attention: 25, curiosity: 25, clarity: 20, accuracy: 20, distinct: 10 };

const SOCIAL_SYSTEM = `You are the YouTube growth and packaging strategist of "${CHANNEL_NAME}", a Vietnamese-language channel about Vietnamese history, military history and historical figures. From the full voice-over of ONE finished video you write the upload copy for YouTube, TikTok and Facebook. Every word you write is Vietnamese (vi-VN) with full diacritics, except hashtags (no diacritics, no spaces: #LichSuVietNam) and the English field names.

CHANNEL
- Format: narrated history stories over illustrations. Audience: Vietnamese viewers who love history, many of them young, who want history that is engaging, clear and emotional.
- Positioning: history as stories about people, decisions, ambition, conflict, turning points and little-known events. It must feel like discovering a story, never like reading a textbook, and stay historically accurate.

STEP 1 — ANALYSE (the "analysis" object, one short Vietnamese sentence per field, written before any copy)
- topic: the main historical subject, people and events.
- surprise: the most surprising or least-known detail the narration actually states.
- tension: the central conflict, paradox or turning point.
- curiosityGap: what makes a viewer want to know what happens next.
- emotion: the dominant feeling the story creates.
- angle: the way of telling it that differs from an ordinary history video.
- payoff: what the viewer learns or feels by the end.

STEP 2 — TEN TITLE CANDIDATES (youtube "titleOptions")
Write 10 YouTube titles, one per angle, in this order: mystery (historical mystery), twist (unexpected turn), conflict (human conflict), strategy (strategic genius), riseFall (rise and fall), hidden (hidden history), paradox (historical paradox), whatIf (counterfactual: use ONLY when the narration itself explores the hypothetical, and make the “nếu” framing explicit; otherwise write a second best angle and still label it "whatIf"), drama (dramatic storytelling), search (search intent: what a viewer would type to find this story).
- Each title: 55 to 70 characters, natural modern Vietnamese, the main person or subject named when it fits (best in the first half), and a concrete reason to click.
- BRAND KEYWORD: every one of the ten titles must start with, or naturally contain, the exact phrase “${BRAND_KEYWORD}” (capital K and C), for example “${BRAND_KEYWORD}: …” or “… ${BRAND_KEYWORD} …”. Keep it inside the 70 character budget.
- The ten must differ in idea, not just in a few words. No generic titles such as “Cuộc đời của…”, “Lịch sử về…”, “Tìm hiểu về…”, “Tiểu sử của…”.
- Honest: every claim and implied promise is delivered by the narration. No invented facts, numbers or quotes. No ALL-CAPS words, no stacked question marks, at most one emoji, no “kinh hoàng”, “chấn động”, “SỐC”, “không thể tin nổi”.
- For each give: "title"; "angle" (the key above); "trigger" (the curiosity trigger, a few words); "strength" (one short phrase); "risk" (one short phrase: what could mislead or underperform); "scores" with integers attention (0-25), curiosity (0-25), clarity (0-20), accuracy (0-20, fit with the video), distinct (0-10).
- Score honestly and spread the scores; do not give every title 85+.

STEP 3 — PICK
youtube.title is the ONE title you recommend. Choose by fit with the story and with the thumbnail, not by the highest score alone; it must be one of the ten, copied exactly. Also set "pickReason": one Vietnamese sentence on why it is the best package.

PER PLATFORM
- youtube.description (600 to 1300 characters, plain paragraphs separated by blank lines):
  1) Opening, two lines that show above “Xem thêm”: the topic and the main keyword placed naturally, a curiosity about the story, and what the viewer will discover. The opening must start with, or naturally contain, the exact phrase “${BRAND_KEYWORD}”.
  2) Summary of 3 to 5 sentences: the people, events and context that matter, teasing the turning points without spoiling the ending or the surprises.
  3) CTA: invite viewers to subscribe to ${CHANNEL_NAME}, then ask one question that invites viewers to share their view on the person or event.
  Natural prose, no keyword stuffing.
  youtube.hashtags: 3 to 5 that really relate to the story. The first one must be ${BRAND_HASHTAG}.
  youtube.keywords: { "primary": "one phrase", "secondary": [2 to 4], "longTail": [2 to 4 phrases a viewer might search], "related": [2 to 4 search terms] }. Only terms that fit what the video really covers. Never claim a search volume or ranking. "primary" must contain “${BRAND_KEYWORD.toLowerCase()}” (for example “${BRAND_KEYWORD.toLowerCase()} + the main subject”) and at least one "longTail" phrase must contain it too.
- tiktok.title: a punchy on-cover hook under 60 characters.
  tiktok.description: the caption, 150 to 300 characters: one hook line, one line of tension, one question for the comments. Up to 2 fitting emoji.
  tiktok.hashtags: 4 to 6, mixing broad (#lichsu, #xuhuong) and specific ones.
- facebook.title: under 80 characters, the hook as a statement or a question.
  facebook.description: a story-style post, 300 to 600 characters: open on the most dramatic moment, build the tension in two or three short paragraphs, end with an open question. Up to 3 emoji.
  facebook.hashtags: 2 to 4.

ACCURACY RULES (all platforms)
- Never trade historical accuracy for clicks. Never invent plot details, quotes, numbers or SEO data.
- Keep verified record, hypothesis and scholarly dispute apart: if the narration presents something as disputed or legendary, the copy must not state it as settled fact.
- Everything must suit the ${CHANNEL_NAME} brand: curious, warm, respectful toward the people of the past.
- Do not put the hashtags inside the descriptions; they go only in the hashtags arrays.

OUTPUT — one JSON object and nothing else. Inside string values quote with typographic quotes (“ ”), never a bare double quote:
{"analysis": {"topic": "...", "surprise": "...", "tension": "...", "curiosityGap": "...", "emotion": "...", "angle": "...", "payoff": "..."},
 "youtube": {"titleOptions": [{"title": "...", "angle": "mystery", "trigger": "...", "strength": "...", "risk": "...", "scores": {"attention": 0, "curiosity": 0, "clarity": 0, "accuracy": 0, "distinct": 0}}],
  "title": "...", "pickReason": "...", "description": "...", "hashtags": ["#..."], "keywords": {"primary": "...", "secondary": [], "longTail": [], "related": []}},
 "tiktok": {"title": "...", "description": "...", "hashtags": ["#..."]},
 "facebook": {"title": "...", "description": "...", "hashtags": ["#..."]}}`;

const asText = (value) => (typeof value === 'string' ? value.trim() : '');
const oneLine = (value) => asText(value).replace(/\s+/g, ' ');
const textList = (value) => [...new Set((Array.isArray(value) ? value : []).map(oneLine).filter(Boolean))].slice(0, MAX_KEYWORDS);

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

// A part score as an integer inside 0..max; anything else counts as 0.
const clampScore = (value, max) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

// One candidate title with its rubric total, or null when the model left the title empty.
const normalizeTitleOption = (raw) => {
  const title = oneLine(raw?.title).slice(0, TITLE_LIMIT.youtube);
  if (!title) return null;
  const scores = Object.fromEntries(Object.entries(SCORE_PARTS).map(([part, max]) => [part, clampScore(raw?.scores?.[part], max)]));
  return {
    title,
    angle: oneLine(raw?.angle),
    trigger: oneLine(raw?.trigger),
    strength: oneLine(raw?.strength),
    risk: oneLine(raw?.risk),
    score: Object.values(scores).reduce((sum, n) => sum + n, 0),
  };
};

const normalizeKeywords = (raw) => ({
  primary: oneLine(raw?.primary),
  secondary: textList(raw?.secondary),
  longTail: textList(raw?.longTail),
  related: textList(raw?.related),
});

const normalizePost = (raw, platform) => {
  const title = oneLine(raw?.title).slice(0, TITLE_LIMIT[platform]);
  const description = asText(raw?.description).replace(/\n{3,}/g, '\n\n');
  const hashtags = [...new Set((Array.isArray(raw?.hashtags) ? raw.hashtags : []).map(toHashtag).filter(Boolean))].slice(0, MAX_HASHTAGS);
  return { title, description, hashtags, titleLimit: TITLE_LIMIT[platform] };
};

// The YouTube post adds the alternative titles (best score first) and the SEO keyword groups.
export const normalizeYoutube = (raw) => {
  const post = normalizePost(raw, 'youtube');
  const titleOptions = (Array.isArray(raw?.titleOptions) ? raw.titleOptions : [])
    .map(normalizeTitleOption)
    .filter(Boolean)
    .slice(0, MAX_TITLE_OPTIONS)
    .sort((a, b) => b.score - a.score);
  return { ...post, titleOptions, pickReason: oneLine(raw?.pickReason), keywords: normalizeKeywords(raw?.keywords) };
};

const foldKey = (value) => asText(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const hasBrandKeyword = (text) => foldKey(text).includes(foldKey(BRAND_KEYWORD));

// Safety net for a model that ignores the brand-keyword rule: prefix the phrase when it is missing.
// An empty text stays empty so the "no title" check still fires. A title is re-cut to its limit.
const withBrandKeyword = (text, limit) => {
  if (!text || hasBrandKeyword(text)) return text;
  const prefixed = `${BRAND_KEYWORD}: ${text}`;
  return limit ? prefixed.slice(0, limit) : prefixed;
};

// Brand hashtag first, without a duplicate, still inside the hashtag cap.
const withBrandHashtag = (hashtags) =>
  [BRAND_HASHTAG, ...hashtags.filter((tag) => tag.toLowerCase() !== BRAND_HASHTAG.toLowerCase())].slice(0, MAX_HASHTAGS);

// SEO keywords: the primary phrase and the long-tail list both carry the brand phrase. A missing
// long-tail hit is filled with "<brand> <primary>"; with no primary phrase there is nothing to build on.
const withBrandKeywords = (keywords) => {
  const brand = BRAND_KEYWORD.toLowerCase();
  const primary = keywords.primary && !hasBrandKeyword(keywords.primary) ? `${brand} ${keywords.primary}` : keywords.primary;
  const hasLongTail = keywords.longTail.some(hasBrandKeyword);
  const longTail = hasLongTail || !primary ? keywords.longTail : [...keywords.longTail, primary].slice(-MAX_KEYWORDS);
  return { ...keywords, primary, longTail };
};

// Returns a new YouTube post whose title, every title option, description, hashtags and SEO
// keywords carry the brand keyword.
export const ensureYoutubeKeyword = (post) => ({
  ...post,
  title: withBrandKeyword(post.title, post.titleLimit),
  description: withBrandKeyword(post.description),
  titleOptions: post.titleOptions.map((o) => ({ ...o, title: withBrandKeyword(o.title, post.titleLimit) })),
  hashtags: withBrandHashtag(post.hashtags),
  keywords: withBrandKeywords(post.keywords),
});

const socialRequest =({ title, narration, note }) => `Video title in the project: ${title || '(none)'}

Full voice-over, scene by scene:
<<<
${narration}
>>>${note ? `\n\nExtra instructions from the channel owner:\n<<<\n${note}\n>>>` : ''}

Write the JSON object now.`;

// { title, scenes: [{ scene, narration }], note? } → { youtube, tiktok, facebook }, each
// { title, description, hashtags, titleLimit }; youtube also { titleOptions, pickReason, keywords }.
// Throws when the plan has no narration yet or the reply leaves a platform without a title.
export const writeSocialPosts = async ({ title, scenes, note, signal, onLog }) => {
  const narration = scenes.filter((s) => s.narration).map((s) => `${s.scene}. ${s.narration}`).join('\n');
  if (!narration) throw new Error('Dự án chưa có narration để viết bài đăng.');
  const reply = await chatJson({ system: SOCIAL_SYSTEM, user: socialRequest({ title, narration, note }), signal, onLog, label: 'Viết bài đăng' });
  const posts = {
    youtube: ensureYoutubeKeyword(normalizeYoutube(reply.youtube)),
    tiktok: normalizePost(reply.tiktok, 'tiktok'),
    facebook: normalizePost(reply.facebook, 'facebook'),
  };
  const missing = PLATFORMS.filter((p) => !posts[p].title);
  if (missing.length) throw new Error(`LLM không trả về tiêu đề cho ${missing.join(', ')}.`);
  return posts;
};
