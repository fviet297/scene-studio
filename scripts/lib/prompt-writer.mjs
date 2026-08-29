// Writes one scene's image-generation prompt from its narration via the OpenAI API, following
// the house rules from the history-video skill: action/setting only (never appearance, which
// the reference image already locks), physical continuity, concrete named culture/century
// detail, and explicit left/right placement when multiple characters share a scene. Used by
// both the review UI server (scripts/review-server.mjs) and the CLI
// (scripts/generate-prompts.mjs), so the instructions live in one place.
//
// Requires OPENAI_API_KEY (loaded from ./.env via replicate-image.mjs's loadEnv()).
// Optional OPENAI_PROMPT_MODEL overrides the default model.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Stronger default writer model closes most of the gap with the skill-authored prompts. Override
// via OPENAI_PROMPT_MODEL if the account lacks it (e.g. set it back to gpt-4.1).
const DEFAULT_MODEL = 'gpt-5';

// A single skill-authored example per shape, so the model copies the discipline (named culture,
// pinned extras, scene-specific negatives) — not the content. Lifted from a real scene-plan.md.
const EXAMPLE_SINGLE = 'Standing before assembled officials at his accession, receiving the imperial seal with both hands and turning toward the court with composed resolve. Setting: early-11th-century Đại Việt, a compact timber audience hall with stout plain columns, low heavy dark-tiled roofs and a brick courtyard. Vietnamese court officials with East-Asian faces wear early-11th-century robes and simple caps; guards carry spears beneath plain crimson cloth banners. Solemn ceremonial light, medium-wide environmental framing. No Nguyễn-dynasty dress, no Qing costume, no European architecture.';
const EXAMPLE_SPLIT = 'The first character sits on the left half on a plain dark timber throne in an early-11th-century Đại Việt court of low heavy dark-tiled roofs, stout round timber posts and a compact brick citadel courtyard. The second character sits on the right half on a broader lacquered throne in a 7th-century Tang Chinese palace court of long rammed-earth walls and wide timber halls. One rising dawn sun sits on the horizon between the two halves. Vietnamese courtiers stay left, Tang officials right, all small background figures with East-Asian faces in plain period-correct dress. Balanced vertical split, solemn beginning.';

const SYSTEM_PROMPT = `You write ONE scene-specific image-generation prompt for a 2D chibi-style historical illustration, from a short narration line. This prompt is spliced into a larger template that already covers art style, chibi proportions, camera framing, negative space, "ordinary soldiers wear plainer gear than the commander", and the generic negatives — never restate any of that.

CORE
1. NEVER describe a main character's appearance: no face, hair, costume, build, age, or colours. Identity comes from a pasted reference image via image-to-image generation; restating looks fights the reference and drifts identity.
2. Write ONLY what changes per scene, roughly in this order: action · period & country · setting · who else is present (their ethnicity, dress, weapons) · architecture · scene-specific negatives. Plain prose, never field labels.
3. Narration → meaning → visual concept → prompt. Do not visualise the words literally, and never put text, letters or numerals in the scene.
4. Prefer a lively wide environmental scene over a portrait: keep each named main character small, about 20–30% of image height, unless the narration demands a close-up. Build depth — name at least two of foreground/middle ground/background plus one active secondary detail (marching units, banners, drums, horses, dust, workers, messengers). Use asymmetrical or diagonal composition; avoid static symmetrical rows and empty backgrounds.

NAME THE CULTURE CONCRETELY — this is the biggest quality lever
5. Pin every material element to the correct culture AND century with concrete named nouns — architecture style, roofs, banners, weapons, dress — for THAT character's own country/dynasty/period. A vague noun ("citadel", "soldiers") makes the model fall back to generic Hollywood-Chinese armour or European castles.
6. EXTRAS carry the same identity risk as the hero; whenever other people appear, pin BOTH:
   - Culture/era of gear — name it: e.g. "background soldiers in early-11th-century Đại Việt dress, quilted tunics, spears and rattan shields", not "soldiers with flags". Unnamed extras default to Qing/Chinese troops.
   - Face ethnicity — state it: "all background figures have East-Asian faces, never European or Western". Image-to-image models drift crowds to Western faces when left unpinned.
7. Scene-specific negatives: name the SPECIFIC wrong culture/era to forbid for THIS scene (e.g. "no Nguyễn-dynasty dress, no Qing costume, no European architecture"). The template only says "one culture per image"; you must say which one is wrong here.

CONTINUITY
8. Every person, animal, vehicle and prop shares one physically plausible environment and mode of travel — within its own half when the frame is split (rule 10), or across the whole frame for a single-character scene. If a convoy is on a river, everyone travels by boat; keep land transport on the bank only. Resolve contradictions yourself.
9. The supplied character list is authoritative. Use ONLY those references. Never invent, add or name a second character, emperor or counterpart not in the list, even if the narration contrasts two people. If exactly one reference is supplied, write exactly one main character.
10. If two or more characters are supplied, ALWAYS compose a vertical split-screen with a clean centre divider. The first-listed character occupies the LEFT half with their own action, culture and setting; the second the RIGHT half with theirs — "The first character ... on the left ...", "The second character ... on the right ...". Each half is self-contained (its own continuity, rule 8) and must not blend, touch or share background/props with the other. Every supplied reference appears exactly once, one per half.

SCENE-TYPE RECIPE (pick by the narration)
- Two figures compared → split-screen (rule 10); each side its own country/period/environment.
- Battle → event, period, location, main character, army, action; visible period weapons/armour/banners, real battlefield geography, correct formation; wide shot with depth, dust, atmosphere.
- Court / ceremony → the hall's period architecture, ranked officials in period dress with correct ethnicity, ceremonial light.
- Map / territory → clarity over art: simplified geography, clear boundaries, movement; no invented lettering.
- Architecture / artifact → period, culture, correct proportions and materials, simple background.

11. Be concise — the English prompt is inserted into a template with a hard character budget. Plain prose only: no markdown, no quotation marks, no field labels, no preamble.

OUTPUT FORMAT — output exactly two parts and nothing else:
- First, the English scene prompt as plain prose (this is what counts against the character budget).
- Then, on its own line, the delimiter ===VI===
- Then a close, natural Vietnamese translation of that same English prompt (faithful meaning; keep proper names, dynasty/place names and untranslatable technical phrases as-is). The Vietnamese does NOT count against the character budget.

EXAMPLES OF GOOD OUTPUT (the English half only — match the discipline: named culture, pinned extras, scene-specific negatives; never copy the content):
[one character] ${EXAMPLE_SINGLE}
[two characters, split-screen] ${EXAMPLE_SPLIT}`;

// Enrich each character id with the historical context (country/period/dynasty/role) from its
// profile.json, so the model can pin the scene's culture/century instead of guessing.
export const buildCharacterContext = (ids, profilesDir) =>
  (ids ?? []).map((id) => {
    const profilePath = join(profilesDir, id, 'profile.json');
    if (!existsSync(profilePath)) return { id, name: id };
    let profile = {};
    try { profile = JSON.parse(readFileSync(profilePath, 'utf8')); } catch { profile = {}; }
    return {
      id,
      name: profile.display_name ?? profile.name ?? id,
      country: profile.country,
      period: profile.period,
      dynasty: profile.dynasty,
      role: profile.role,
      knownFacts: Array.isArray(profile.known_facts) ? profile.known_facts.slice(0, 3) : [],
    };
  });

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

const describeCharacter = (c) => {
  const detail = [c.country, c.period, c.dynasty].filter(Boolean).join(', ');
  const facts = (c.knownFacts ?? []).length ? ` — known for: ${c.knownFacts.join('; ')}` : '';
  return `${c.name}${detail ? ` (${detail})` : ''}${c.role ? ` — ${c.role}` : ''}${facts}`;
};

// Generate one scene's prompt text. `characters` is the ordered array from buildCharacterContext
// (order matters: it must match the scene's `char:` order, since the downstream image template
// maps reference N to the Nth character named here). `identity` ('face'|'full') hints whether
// the scene may re-dress the character (face-lock) or must keep the reference's costume (full).
// `context` is optional { prev, next } narration of the neighbouring scenes, used only to keep the
// setting/action continuous — the model must not depict them.
export const generateScenePrompt = async ({ narration, characters = [], identity = 'full', apiKey, model, context }) => {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set (put it in .env).');
  const useModel = model ?? process.env.OPENAI_PROMPT_MODEL ?? DEFAULT_MODEL;

  const charLines = characters.length
    ? characters.map((c, i) => `${ORDINALS[i] ?? `Character ${i + 1}`} character: ${describeCharacter(c)}`).join('\n')
    : 'No character reference for this scene (plain text-to-image, no identity to preserve).';

  const budget = characters.length >= 2 ? 480 : 550;
  const identityNote = characters.length === 1 && identity === 'face'
    ? '\n\nThis scene is face-locked: keep the face/hair/age from the reference, but you may dress the character differently than the reference if the narration calls for it (e.g. shown poor before their rise).'
    : '';

  const characterCountRule = characters.length === 1
    ? '\n\nIMPORTANT: exactly one referenced character is available. Do not include any second character, counterpart, emperor, split-screen half or named person.'
    : '';
  const contextNote = context && (context.prev || context.next)
    ? `\n\nAdjacent scenes (for visual continuity only — do NOT depict them):${context.prev ? `\nPrevious: "${context.prev}"` : ''}${context.next ? `\nNext: "${context.next}"` : ''}`
    : '';
  const userPrompt = `Narration for this scene:\n"${narration}"\n\nCharacters available in this scene, in this exact order (use only these references):\n${charLines}${identityNote}${characterCountRule}${contextNote}\n\nWrite the scene prompt now. Keep the English prompt under ${budget} characters, then a line with ===VI=== and its Vietnamese translation.`;

  // Newer reasoning-class models reject a custom temperature; only send it for the gpt-4 family.
  const supportsTemperature = /^gpt-4/.test(useModel);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: useModel,
      ...(supportsTemperature ? { temperature: 0.7 } : {}),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('OpenAI returned no prompt text.');
  // The model returns the English prompt, a ===VI=== delimiter line, then the Vietnamese
  // translation — both in one request (no second OpenAI call). If the delimiter is missing,
  // treat the whole reply as the English prompt and leave the translation empty.
  const [enPart, ...viParts] = raw.split(/\n?\s*={2,}\s*VI\s*={2,}\s*\n?/i);
  const text = (enPart ?? '').trim();
  const vi = viParts.join('').trim();
  if (!text) throw new Error('OpenAI returned no prompt text.');
  return { text, vi };
};
