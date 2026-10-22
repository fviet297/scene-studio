// Writes one scene's image-generation prompt from its narration via the OpenAI API, following
// the house rules from the history-video skill: action/setting only (never appearance, which
// the reference image already locks), physical continuity, concrete named culture/century
// detail, and explicit left/right placement when multiple characters share a scene. The same
// call also writes that scene's image-to-video `motion:` prompt (and both Vietnamese
// translations), matching the lsvn/trangca skills' motion rules. Used by both the review UI
// server (scripts/review-server.mjs) and the CLI (scripts/generate-prompts.mjs), so the
// instructions live in one place.
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
const EXAMPLE_MOTION = 'Animate this historical illustration into a dynamic cinematic shot with clearly visible motion from the first second. Slow push-in between the two hosts. Both commanders raise their weapons and turn toward each other as their horses rear and stamp. Storm clouds roll fast overhead, then a lightning bolt flashes above the gap between the hosts, and the ranks behind each figure surge forward with banners whipping. Keep both characters\' faces and costumes and the art style consistent; no new characters, no text or watermark. Motion intensity medium to high, character motion clear and natural, environmental motion strong across the whole frame. No face deformation, warped limbs, extra fingers, duplicated or merged characters, morphing objects.';
const EXAMPLE_SPLIT = 'The first character sits on the left half on a plain dark timber throne in an early-11th-century Đại Việt court of low heavy dark-tiled roofs, stout round timber posts and a compact brick citadel courtyard. The second character sits on the right half on a broader lacquered throne in a 7th-century Tang Chinese palace court of long rammed-earth walls and wide timber halls. One rising dawn sun sits on the horizon between the two halves. Vietnamese courtiers stay left, Tang officials right, all small background figures with East-Asian faces in plain period-correct dress. Balanced vertical split, solemn beginning.';

// The house rules for one scene's image prompt and motion prompt. Shared with the whole-video
// script writer (script-writer.mjs), which writes several scenes per call in its own JSON format.
export const SCENE_PROMPT_RULES = `This prompt is spliced into a larger template that already covers art style, proportions, frame shape and caption safe zones, anatomy, the no-text rule, "ordinary soldiers wear plainer gear than the commander", and the generic negatives — never restate any of that, and never name an art style, medium or rendering look: the same prompt must work under any style template.

CORE
1. NEVER describe a main character's appearance: no face, hair, costume, build, age, or colours. Identity comes from a pasted reference image via image-to-image generation; restating looks fights the reference and drifts identity.
2. Write ONLY what changes per scene, roughly in this order: action · period & country · setting · who else is present (their ethnicity, dress, weapons) · architecture · scene-specific negatives. Plain prose, never field labels.
3. Narration → event → visual concept → prompt. FIRST name the line's concrete event — who does what to whom, where — and stage THAT as the frame's main action; the prompt exists to show it. "Kiều Công Tiễn giết Dương Đình Nghệ" is a killing inside a citadel courtyard, not a quiet gate; "the Song army closes on the border" is that army massing on a frontier road, not a beacon fire seen from the capital. An abstract line — a verdict, a metaphor, a claim — still points at a concrete moment: draw the moment (stakes driven into the riverbed at night, the ambush party settling into the reeds), never a symbol standing in for it, and never a map on a table, an empty throne or an object still life in place of the event. Do not visualise the words literally, and never put text, letters or numerals in the scene.
4. Pick the shot from the beat: a lively wide environmental scene by default, with the main character placed inside a large space; a medium or close shot only when the narration is about a face, a gesture or a held object. Build depth — name at least two of foreground/middle ground/background plus one active secondary detail (marching units, banners, drums, horses, dust, workers, messengers). Use asymmetrical or diagonal composition; avoid static symmetrical rows and empty backgrounds.

NAME THE CULTURE CONCRETELY — this is the biggest quality lever
5. Pin every material element to the correct culture AND century with concrete named nouns — architecture style, roofs, banners, weapons, dress — for THAT character's own country/dynasty/period. A vague noun ("citadel", "soldiers") makes the model fall back to generic Hollywood-Chinese armour or European castles.
6. EXTRAS carry the same identity risk as the hero; whenever other people appear, pin BOTH:
   - Culture/era of gear — name it: e.g. "background soldiers in early-11th-century Đại Việt dress, quilted tunics, spears and rattan shields", not "soldiers with flags". Unnamed extras default to Qing/Chinese troops.
   - Face ethnicity — state it: "all background figures have East-Asian faces, never European or Western". Image-to-image models drift crowds to Western faces when left unpinned.
7. Scene-specific negatives: name the SPECIFIC wrong culture/era to forbid for THIS scene (e.g. "no Nguyễn-dynasty dress, no Qing costume, no European architecture"). The template only says "one culture per image"; you must say which one is wrong here.

CONTINUITY
8. Every person, animal, vehicle and prop shares one physically plausible environment and mode of travel — within its own half when the frame is split (rule 10), or across the whole frame for a single-character scene. If a convoy is on a river, everyone travels by boat; keep land transport on the bank only. Resolve contradictions yourself.
9. The supplied character list is authoritative for identity-locked figures: use ONLY those references, and never add a second MAIN character, emperor or counterpart not in the list, even if the narration contrasts two people. If exactly one reference is supplied, write exactly one main character. Other people the narration mentions are still drawn — as anonymous figures seen at distance, from behind or inside a crowd, faces not readable, with their own culture and era pinned like any other extra (rule 6). Never empty the frame ("no people", "no faces in focus") to avoid them: an empty room reads as a missing beat.
10. If two or more characters are supplied, decide from their countries/periods and the narration. Contemporaries who actually meet, fight or rule together in this beat share ONE scene: place each explicitly ("the first character ... on the left", "the second character ... on the right"), each doing their own action, one continuous environment. Figures from different countries or eras, or a narration that compares them, get a vertical split-screen with a clean centre divider: the first-listed character occupies the LEFT half with their own action, culture and setting; the second the RIGHT half with theirs — "The first character ... on the left ...", "The second character ... on the right ...". Each half is self-contained (its own continuity, rule 8) and must not blend, touch or share background/props with the other. Either way, every supplied reference appears exactly once.

SCENE-TYPE RECIPE (pick by the narration)
- Two figures compared, or from different eras → split-screen (rule 10); each side its own country/period/environment. Two contemporaries meeting → one shared scene (rule 10).
- Battle → event, period, location, main character, army, action; visible period weapons/armour/banners, real battlefield geography, correct formation; wide shot with depth, dust, atmosphere.
- Court / ceremony → the hall's period architecture, ranked officials in period dress with correct ethnicity, ceremonial light.
- Claim / verdict / metaphor → do NOT retreat to a still life: draw the concrete moment the claim is about (the trap being built, the army that threatens, the defeat being risked), with people acting in it.
- Map / territory → only when the beat is genuinely about geography: simplified geography, clear boundaries, movement; no invented lettering. Never use a map or a table of objects as a stand-in for an event.
- Architecture / artifact → period, culture, correct proportions and materials, simple background.

11. Be concise — the English prompt is inserted into a template with a hard character budget. Plain prose only: no markdown, no quotation marks, no field labels, no preamble.

MOTION PROMPT (image-to-video)
Also write the motion prompt that animates the still you just described into a short clip with CLEARLY VISIBLE motion. Image-to-video models read "preserve the composition / do not add or remove anything / no sudden movements" as permission to return a near-still frame, so lock only identity and style, never composition. English, one single line, no character budget, motion first and constraints last, in this order:
M1. Open: "Animate this historical illustration into a dynamic cinematic shot with clearly visible motion from the first second." A quiet or somber beat: "…into a calm but clearly moving cinematic shot."
M2. Camera: always name one motivated move — push-in, pull-back and rise, tracking alongside, sideways truck with a column. Lock the camera only for an intimate still beat (hiding, holding breath); then the figure and environment must carry the motion.
M3. Main action: one visible action per main character, taken from the beat, with strong verbs and real amplitude ("turns his head to look back at the shore", "raises the sword and points it across the river", "strides forward through the mud"). Never ask for the character to stay stable or keep the pose unchanged.
M4. Two or three strong environmental motions named from THIS scene's own image prompt — fewer things, bigger moves, chained with "then" when order matters ("the bow lifts over a wave and slams down, spray bursting across the boat"). A long list of micro-motions gets averaged into almost nothing. On a split-screen describe the left and right halves separately.
M5. Light lock, identity and style only: "Keep <the character's / both characters'> faces and costumes and the art style consistent; no new characters, no text or watermark." Never write "preserve the composition/lighting" or "do not add, remove or redesign anything". Only a split-screen adds "keep the centre divider, each figure stays on their own side."
M6. State intensity: "Motion intensity medium to high, character motion clear and natural, environmental motion strong across the whole frame." Quiet beats: "Motion intensity medium, character motion gentle but visible, environmental motion moderate."
M7. End with a short artifact ban: "No face deformation, warped limbs, extra fingers, duplicated people, morphing objects." Never ban "sudden movements" or "flicker" — they suppress motion and contradict flames and torches.`;

export const PROMPT_EXAMPLES = `EXAMPLES OF GOOD OUTPUT (English parts only — match the discipline: named culture, pinned extras, scene-specific negatives, motion named from the scene's own elements; never copy the content):
[scene prompt, one character] ${EXAMPLE_SINGLE}
[scene prompt, two characters, split-screen] ${EXAMPLE_SPLIT}
[motion prompt] ${EXAMPLE_MOTION}`;

const SYSTEM_PROMPT = `You write ONE scene-specific image-generation prompt for a historical illustration, from a short narration line. ${SCENE_PROMPT_RULES}

OUTPUT FORMAT — output exactly four parts and nothing else:
- First, the English scene prompt as plain prose (this is what counts against the character budget).
- Then, on its own line, the delimiter ===VI===
- Then a close, natural Vietnamese translation of that same English prompt (faithful meaning; keep proper names, dynasty/place names and untranslatable technical phrases as-is). The Vietnamese does NOT count against the character budget.
- Then, on its own line, the delimiter ===MOTION===
- Then the English motion prompt on one single line.
- Then, on its own line, the delimiter ===MOTION_VI===
- Then a close Vietnamese translation of the motion prompt, on one single line.

${PROMPT_EXAMPLES}`;

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

// What a writer is told about one scene's references: the ordered list (`characters` from
// buildCharacterContext; order must match the scene's `char:`, since the image template maps
// reference N to the Nth character named here), the face-lock and single-reference guards, and
// the English prompt's character budget. Shared with script-writer.mjs.
export const sceneCharacterBrief = (characters, identity = 'full') => {
  const charLines = characters.length
    ? characters.map((c, i) => `${ORDINALS[i] ?? `Character ${i + 1}`} character: ${describeCharacter(c)}`).join('\n')
    : 'No character reference for this scene (plain text-to-image, no identity to preserve).';

  // The trimmed templates leave ~1000 of Seedream's 4000 characters for the scene prompt even
  // under the longest style version; stay under that with room for a hand edit.
  const budget = characters.length >= 2 ? 700 : 800;
  const identityNote = characters.length === 1 && identity === 'face'
    ? '\n\nThis scene is face-locked: keep the face/hair/age from the reference, but you may dress the character differently than the reference if the narration calls for it (e.g. shown poor before their rise).'
    : '';

  const characterCountRule = characters.length === 1
    ? '\n\nIMPORTANT: exactly one referenced character is available. Do not include any second character, counterpart, emperor, split-screen half or named person.'
    : '';
  return { charLines, notes: `${identityNote}${characterCountRule}`, budget };
};

// One reply carries all four fields, separated by delimiter lines (no second OpenAI call):
// English prompt · ===VI=== · Vietnamese prompt · ===MOTION=== · motion · ===MOTION_VI=== · motion_vi.
// A missing delimiter leaves that section empty rather than failing, so an older or sloppier
// model that answers with the prompt alone still yields a usable prompt.
const SECTION_RE = /^\s*={2,}\s*(MOTION_VI|MOTION|VI)\s*={2,}\s*$/i;
const SECTION_KEY = { vi: 'vi', motion: 'motion', motion_vi: 'motionVi' };

const splitSections = (raw) => {
  const parts = { text: [], vi: [], motion: [], motionVi: [] };
  let key = 'text';
  for (const line of raw.split('\n')) {
    const marker = SECTION_RE.exec(line);
    if (marker) key = SECTION_KEY[marker[1].toLowerCase()];
    else parts[key].push(line);
  }
  // The motion fields are single scene-plan lines; collapse any wrapping the model added.
  const oneLine = (lines) => lines.join(' ').replace(/\s+/g, ' ').trim();
  return {
    text: parts.text.join('\n').trim(),
    vi: parts.vi.join('\n').trim(),
    motion: oneLine(parts.motion),
    motionVi: oneLine(parts.motionVi),
  };
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

  const { charLines, notes, budget } = sceneCharacterBrief(characters, identity);
  const contextNote = context && (context.prev || context.next)
    ? `\n\nAdjacent scenes (for visual continuity only — do NOT depict them, and do NOT reuse an adjacent beat's setting plus activity: change the terrain, time of day or action so this reads as a new shot):${context.prev ? `\nPrevious: "${context.prev}"` : ''}${context.next ? `\nNext: "${context.next}"` : ''}`
    : '';
  const userPrompt = `Narration for this scene:\n"${narration}"\n\nCharacters available in this scene, in this exact order (use only these references):\n${charLines}${notes}${contextNote}\n\nWrite the scene prompt now, then its motion prompt. Keep the English scene prompt under ${budget} characters. Output the four parts in order, separated by the ===VI===, ===MOTION=== and ===MOTION_VI=== delimiter lines.`;

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
  const { text, vi, motion, motionVi } = splitSections(raw);
  if (!text) throw new Error('OpenAI returned no prompt text.');
  return { text, vi, motion, motionVi };
};
