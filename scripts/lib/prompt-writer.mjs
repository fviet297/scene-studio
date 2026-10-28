// Writes one scene's image-generation prompt from its narration via the configured LLM, following
// the house rules from the history-video skill: action/setting only (never appearance, which
// the reference image already locks), physical continuity, concrete named culture/century
// detail, and explicit left/right placement when multiple characters share a scene, plus its
// Vietnamese translation. Motion is written separately (scripts/lib/motion-writer.mjs). Used by both the review UI
// server (scripts/review-server.mjs) and the CLI (scripts/generate-prompts.mjs), so the
// instructions live in one place.
//
// Uses the same LLM as the script and motion writers (llm-client.mjs): LLM_BASE_URL / LLM_API_KEY /
// LLM_MODEL from .env, or whatever provider the panel's Model manager has set.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chatText } from './llm-client.mjs';

// A single skill-authored example per shape, so the model copies the discipline (named culture,
// pinned extras, scene-specific negatives) — not the content. Lifted from a real scene-plan.md.
const EXAMPLE_SINGLE = 'Wide river mouth near Gia Định at dusk, 1783; burning bamboo fire rafts swing back on a sudden wind and drift into the Nguyễn river fleet\'s own junk-rigged war boats. The character stands small and off-center at one-fifth frame height on a command boat\'s stern as flames climb the sails beside him; crews with East-Asian faces in plain cotton tunics and khăn vấn headcloths beat at the fire with poles and leap into sampans. Upstream, Tây Sơn long war boats with plain solid-crimson cloth banners, no emblem or lettering, ride the tide forward. No Qing, Nguyen-dynasty or European elements.';
const EXAMPLE_SPLIT = 'The first character sits on the left half on a plain dark timber throne in an early-11th-century Đại Việt court of low heavy dark-tiled roofs, stout round timber posts and a compact brick citadel courtyard. The second character sits on the right half on a broader lacquered throne in a 7th-century Tang Chinese palace court of long rammed-earth walls and wide timber halls. One rising dawn sun sits on the horizon between the two halves. Vietnamese courtiers stay left, Tang officials right, all small background figures with East-Asian faces in plain period-correct dress. Balanced vertical split, solemn beginning.';

// The house rules for one scene's image prompt. Shared with the whole-video
// script writer (script-writer.mjs), which writes several scenes per call in its own JSON format.
export const SCENE_PROMPT_RULES = `This prompt is spliced into a larger template that already covers art style, proportions, frame shape and caption safe zones, anatomy, the no-text rule, "ordinary soldiers wear plainer gear than the commander", and the generic negatives — never restate any of that, and never name an art style, medium or rendering look: the same prompt must work under any style template.

CORE
1. NEVER describe a main character's appearance: no face, hair, costume, build, age, or colours — not even indirectly ("a young noble", "a lone officer in robes"); call them "the character". Identity comes from a pasted reference image via image-to-image generation; restating looks fights the reference and drifts identity.
2. Write ONLY what changes per scene, roughly in this order: action · period & country · setting · who else is present (their ethnicity, dress, weapons) · architecture · scene-specific negatives. Plain prose, never field labels.
3. Narration → event → visual concept → prompt. FIRST name the line's concrete event — who does what to whom, where — and stage THAT as the frame's main action; the prompt exists to show it. "Kiều Công Tiễn giết Dương Đình Nghệ" is a killing inside a citadel courtyard, not a quiet gate; "the Song army closes on the border" is that army massing on a frontier road, not a beacon fire seen from the capital. An abstract line — a verdict, a metaphor, a claim — still points at a concrete moment: draw the moment (stakes driven into the riverbed at night, the ambush party settling into the reeds), never a symbol standing in for it, and never a map on a table, an empty throne or an object still life in place of the event. Do not visualise the words literally, and never put text, letters or numerals in the scene.
3b. Never sanitise the beat. No blanket disclaimers such as "no combat", "no battle in frame", "no active fighting", "aftermath only", "no shipwreck", and never swap the event for lookouts watching a distant horizon or people tidying up afterwards: a battle, landing, storm, siege, ambush or chase is drawn IN PROGRESS. Only a killing, execution or massacre is drawn as the moment just before or after (the escort through a gate, the burning town, the families fleeing) — never the act, no blood on people, and without the words "execution", "prisoners" or "kneeling row".
4. Pick the shot from the beat. Default: open the prompt with "Wide <setting> at <time of day>, <year>;" and place an identity-locked character small and off-center at about one-fifth frame height inside a large busy space — never a portrait. A medium-wide shot (character at about one-third frame height) only when the narration is about a gesture, a face or a held object. Build depth — name at least two of foreground/middle ground/background — and fill the frame with supporting cast doing the line's own action plus moving elements (oars, sails, banners, smoke, fire, rain, surf, mist, dust): every moving thing you name is something the image-to-video step can animate. Use asymmetrical or diagonal composition; avoid static symmetrical rows and empty backgrounds.
4b. When neighbouring beats are the same kind of thing (two landings, two coves, two councils, two flights by boat), give this one its own terrain, time of day, weather and action so the edit never reads as one long shot.

NAME THE CULTURE CONCRETELY — this is the biggest quality lever
5. Pin every material element to the correct culture AND century with concrete named nouns — architecture style, roofs, banners, weapons, dress — for THAT character's own country/dynasty/period. A vague noun ("citadel", "soldiers") makes the model fall back to generic Hollywood-Chinese armour or European castles.
6. EXTRAS carry the same identity risk as the hero; whenever other people appear, pin BOTH:
   - Culture/era of gear — name it: e.g. "background soldiers in early-11th-century Đại Việt dress, quilted tunics, spears and rattan shields", not "soldiers with flags". Unnamed extras default to Qing/Chinese troops.
   - Face ethnicity — state it: "all background figures have East-Asian faces, never European or Western". Image-to-image models drift crowds to Western faces when left unpinned.
7. Scene-specific negatives: close the prompt with ONE exclusion sentence naming the SPECIFIC wrong cultures/eras for THIS scene (e.g. "No Qing, Nguyen-dynasty or European elements."). The template only says "one culture per image"; you must say which one is wrong here. Keep negatives to such style classes only: never negate a drawable object ("no fort", "no pagoda", "no bodies", "no shipwreck") — the model draws the nouns it reads. State object constraints positively instead.
7b. Banners: always state the cloth — "plain solid-crimson cloth banners, no emblem or lettering" (pick the colour). A bare "war banner" or "command banner" gets filled with a dragon or lettering.

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

11. Be concise — the English prompt is inserted into a template with a hard character budget. Plain prose only: no markdown, no quotation marks, no field labels, no preamble.`;

export const PROMPT_EXAMPLES = `EXAMPLES OF GOOD OUTPUT (English parts only — match the discipline: named culture, pinned extras, scene-specific negatives; never copy the content):
[scene prompt, one character] ${EXAMPLE_SINGLE}
[scene prompt, two characters, split-screen] ${EXAMPLE_SPLIT}`;

const SYSTEM_PROMPT = `You write ONE scene-specific image-generation prompt for a historical illustration, from a short narration line. ${SCENE_PROMPT_RULES}

OUTPUT FORMAT — output exactly two parts and nothing else:
- First, the English scene prompt as plain prose (this is what counts against the character budget).
- Then, on its own line, the delimiter ===VI===
- Then a close, natural Vietnamese translation of that same English prompt (faithful meaning; keep proper names, dynasty/place names and untranslatable technical phrases as-is). The Vietnamese does NOT count against the character budget.

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

// One reply carries both fields, separated by a delimiter line (no second LLM call):
// English prompt · ===VI=== · Vietnamese prompt. A missing delimiter leaves the translation empty
// rather than failing, so a model that answers with the prompt alone still yields a usable prompt.
const SECTION_RE = /^\s*={2,}\s*VI\s*={2,}\s*$/i;

const splitSections = (raw) => {
  const parts = { text: [], vi: [] };
  let key = 'text';
  for (const line of raw.split('\n')) {
    if (SECTION_RE.test(line)) key = 'vi';
    else parts[key].push(line);
  }
  return { text: parts.text.join('\n').trim(), vi: parts.vi.join('\n').trim() };
};

// Generate one scene's prompt text. `characters` is the ordered array from buildCharacterContext
// (order matters: it must match the scene's `char:` order, since the downstream image template
// maps reference N to the Nth character named here). `identity` ('face'|'full') hints whether
// the scene may re-dress the character (face-lock) or must keep the reference's costume (full).
// `context` is optional { prev, next } narration of the neighbouring scenes, used only to keep the
// setting/action continuous — the model must not depict them.
export const generateScenePrompt = async ({ narration, characters = [], identity = 'full', context, signal, onLog }) => {
  const { charLines, notes, budget } = sceneCharacterBrief(characters, identity);
  const contextNote = context && (context.prev || context.next)
    ? `\n\nAdjacent scenes (for visual continuity only — do NOT depict them, and do NOT reuse an adjacent beat's setting plus activity: change the terrain, time of day or action so this reads as a new shot):${context.prev ? `\nPrevious: "${context.prev}"` : ''}${context.next ? `\nNext: "${context.next}"` : ''}`
    : '';
  const userPrompt = `Narration for this scene:\n"${narration}"\n\nCharacters available in this scene, in this exact order (use only these references):\n${charLines}${notes}${contextNote}\n\nWrite the scene prompt now. Keep the English scene prompt under ${budget} characters. Output the two parts in order, separated by the ===VI=== delimiter line.`;

  const raw = await chatText({ system: SYSTEM_PROMPT, user: userPrompt, signal, onLog, label: 'Viết prompt ảnh' });
  const { text, vi } = splitSections(raw);
  if (!text) throw new Error('LLM không trả về prompt.');
  return { text, vi };
};
