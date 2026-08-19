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

const DEFAULT_MODEL = 'gpt-4.1';

const SYSTEM_PROMPT = `You write ONE scene-specific image-generation prompt for a 2D chibi-style historical illustration, from a short narration line. This prompt is spliced into a larger template that already covers art style, camera framing, negative space and generic negatives — do not restate any of that.

Rules:
1. NEVER describe a character's appearance: no face, hair, costume, build, age, or colours. Identity comes from a pasted reference image via image-to-image generation; restating looks fights the reference and drifts identity.
2. Describe ONLY the action, gesture, pose, setting, atmosphere and composition that fits the narration (marching, pointing at a map, kneeling, addressing troops, sitting in court, and so on). Prefer a lively wide environmental scene over a character portrait: keep each named main character small in the environment, roughly 20–30% of the image height, unless the narration explicitly requires a close-up.
3. Build clear depth and motion in short prose: mention at least two of foreground, middle ground and background when the scene allows, plus one active secondary detail such as waving banners, marching units, drums, horses, dust, workers or messengers. Use an asymmetrical or diagonal composition when suitable; avoid static symmetrical rows and empty backgrounds.
4. Physical continuity: every person, animal, vehicle and prop must share one physically plausible environment and mode of travel. If a convoy is on a river, everyone travels by boat — no horses, carts or oxen on the water; keep land transport on the bank only. Resolve any contradiction yourself; never leave it ambiguous for the image model to guess.
5. Pin the setting to the correct culture and century with concrete named nouns: name the extras' ethnicity and dress, the exact architecture style, banners, and weapons for THAT character's own country/dynasty/period. Never mix cultures (no Qing armor on Đại Việt troops, no Chinese palace roofline in a Vietnamese scene, and so on in either direction). This matters most when two different cultures share one frame — keep each side strictly its own.
6. The supplied character list is authoritative. Use ONLY those references. Never invent, add or describe a second character, emperor, counterpart or split-screen half that is not in the list, even if the narration says "one person" or contrasts two people in another scene. If exactly one reference is supplied, write exactly one main character in the scene.
7. If multiple characters are supplied, place them explicitly and in the SAME order they are listed: "The first character ...", "The second character ...". Every supplied reference must appear; no unsupplied character may appear as a named or featured subject.
8. Be concise — this text is inserted into a prompt with a hard total character budget. Plain prose only: no markdown, no quotation marks, no field labels, no preamble. Output ONLY the prompt text itself, nothing else.`;

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
    };
  });

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];

const describeCharacter = (c) => {
  const detail = [c.country, c.period, c.dynasty].filter(Boolean).join(', ');
  return `${c.name}${detail ? ` (${detail})` : ''}${c.role ? ` — ${c.role}` : ''}`;
};

// Generate one scene's prompt text. `characters` is the ordered array from buildCharacterContext
// (order matters: it must match the scene's `char:` order, since the downstream image template
// maps reference N to the Nth character named here). `identity` ('face'|'full') hints whether
// the scene may re-dress the character (face-lock) or must keep the reference's costume (full).
export const generateScenePrompt = async ({ narration, characters = [], identity = 'full', apiKey, model }) => {
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
  const userPrompt = `Narration for this scene:\n"${narration}"\n\nCharacters available in this scene, in this exact order (use only these references):\n${charLines}${identityNote}${characterCountRule}\n\nWrite the scene prompt now. Stay under ${budget} characters.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: useModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI returned no prompt text.');
  return text;
};
