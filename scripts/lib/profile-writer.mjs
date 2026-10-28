// Suggests a character's profile (aliases, country, period, dynasty, role, known facts, appearance,
// open questions) from the character's name and the narration of the scenes they appear in, in one
// LLM call (scripts/lib/llm-client.mjs). Read by the panel's profile dialog
// (POST /api/character-suggest), which fills only its empty fields; nothing is written here.
// Field languages follow the AI script writer (script-writer.mjs), which fills the same profile
// when a project is created.

import { chatJson } from './llm-client.mjs';

const MAX_FACTS = 8;

const PROFILE_SYSTEM = `You are the research editor of a Vietnamese-language history video channel. Given one character of a video and the voice-over lines they appear in, you write the character's profile card. It is used to keep image prompts in the right culture and century, and to draw the character's reference image.

RULES
- Rely on well-established history. When the narration and history disagree, follow history and put the conflict in "unknowns". Never invent dates, titles, battles or quotes. If you do not know a field, return "" (or [] for lists) instead of guessing.
- "aliases": other names Vietnamese viewers know this person by (temple name, era name, birth name), with full Vietnamese diacritics. Do not repeat the display name.
- "country", "period", "dynasty", "role": short English, e.g. "Dai Viet", "late 18th century", "Nguyen lords", "Lord of the south who later founded the Nguyen dynasty". dynasty is "" when not applicable.
- "known_facts": three to eight short English facts this video relies on, one per item.
- "appearance": English, 40 to 80 words, for drawing the reference image at the age the video shows: apparent age, build, face, hair and facial hair, period-correct clothing or armour with colours and materials, one signature accessory. No art-style words, no background.
- "unknowns": short English notes on what is disputed or undocumented (e.g. no surviving portrait).
- The "current profile" shows what the user already wrote: stay consistent with it.

OUTPUT — one JSON object and nothing else:
{"aliases": [], "country": "", "period": "", "dynasty": "", "role": "", "known_facts": [], "appearance": "", "unknowns": []}`;

const asText = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const asList = (value) => {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split('\n') : [];
  return [...new Set(items.map(asText).filter(Boolean))];
};

// The user turn: the character, what the profile already says, and the narration of the scenes the
// character is cast in (the whole narration when they are in none yet).
export const profileRequest = ({ id, name, projectTitle, current, scenes }) => {
  const own = scenes.filter((s) => (s.characters ?? []).includes(id) && s.narration);
  const lines = (own.length ? own : scenes.filter((s) => s.narration)).map((s) => `${s.scene}. ${s.narration}`);
  return `Video: ${projectTitle || '(untitled)'}
Character: ${name} (id ${id})

Current profile (the user's own entries; empty fields are what you are asked to fill):
${JSON.stringify(current ?? {}, null, 2)}

Voice-over lines${own.length ? ' this character appears in' : ' of the whole video (the character is not cast in any scene yet)'}:
<<<
${lines.join('\n') || '(no narration yet)'}
>>>

Write the JSON object now.`;
};

// The model's reply → the profile's own field names (appearance is stored as `interpretation`,
// which the character-image dialog starts from). Throws when the reply carries nothing usable.
export const normalizeProfileSuggestion = (reply) => {
  const out = {
    aliases: asList(reply?.aliases),
    country: asText(reply?.country),
    period: asText(reply?.period),
    dynasty: asText(reply?.dynasty),
    role: asText(reply?.role),
    known_facts: asList(reply?.known_facts).slice(0, MAX_FACTS),
    interpretation: asText(reply?.appearance),
    unknowns: asList(reply?.unknowns),
  };
  const filled = Object.values(out).some((v) => (Array.isArray(v) ? v.length : v));
  if (!filled) throw new Error('LLM không trả về thông tin nào cho hồ sơ.');
  return out;
};

// { id, name, projectTitle, current, scenes: [{ scene, narration, characters }] } → profile fields.
export const suggestCharacterProfile = async ({ signal, onLog, ...input }) => {
  const reply = await chatJson({ system: PROFILE_SYSTEM, user: profileRequest(input), signal, onLog, label: 'Gợi ý hồ sơ' });
  return normalizeProfileSuggestion(reply);
};
