// Writes a whole video from a free-text request, in three LLM phases (scripts/lib/llm-client.mjs):
//   1. writeStory   — one call: title, slug, through-line, setting, the cast, and per scene the
//                     Vietnamese narration, delivery cue, cast ids and an English visual beat. One
//                     call for the whole narration is what keeps it a single connected voice-over.
//   2. writeVisuals — the image prompt (with its Vietnamese translation) for a batch of scenes,
//                     under the same house rules as prompt-writer.mjs.
//   3. motion       — camera / action / env per scene, written independently of the image prompt
//                     (scripts/lib/motion-writer.mjs).
// Phases 2 and 3 are fed the English beats, not the narration: the beat already names the
// drawable event, and an English-only request also passes LLM routers that refuse Vietnamese input.
// The narration rules follow the trangca skill's story arc and the tony skill's narrator voice.
// Two styles: 'standard' (a character-led story) and 'map' (a "Vì sao …?" documentary told on a
// map, scripts/lib/map-mode.mjs), which swaps the story, image-prompt and motion rules.

import { chatJson } from './llm-client.mjs';
import { PROMPT_EXAMPLES, SCENE_PROMPT_RULES, sceneCharacterBrief } from './prompt-writer.mjs';
import { writeMotionsBatched } from './motion-writer.mjs';
import { MAP_MOTION_SYSTEM, MAP_PROMPT_EXAMPLE, MAP_PROMPT_RULES, mapStorySystem } from './map-mode.mjs';

export const SCENE_COUNT_MIN = 3;
export const SCRIPT_STYLES = ['standard', 'map'];
export const DEFAULT_SCRIPT_STYLE = 'standard';
export const isScriptStyle = (style) => SCRIPT_STYLES.includes(style);
export const CUES = ['neutral', 'dramatic', 'tense', 'somber', 'hopeful', 'curious'];
// Scenes per phase-2 call: small enough that one reply (4 long fields per scene) stays well under
// the model's output limit, large enough to keep the call count low. Two calls run at once, which
// roughly halves the wait (a 5-scene batch takes ~45 s) without hammering the provider.
const VISUAL_BATCH_SIZE = 5;
const VISUAL_CONCURRENCY = 2;
const MAX_CAST = 5;
const CAST_ID_RE = /^char-[a-z]$/;

// Parts of the story prompt both styles share (the map style assembles them in map-mode.mjs).
const LANGUAGE_RULES = `LANGUAGE
- "title" and every "narration": natural spoken Vietnamese (vi-VN), the way a native narrator says it aloud.
- "display_name" and "aliases": the names as Vietnamese viewers know them, with diacritics.
- Everything else (visual beats, setting, through-line, the other cast fields): English.`;

const CAST_FIELDS_RULE = `- Fields: id; name (ASCII, no diacritics); display_name; aliases (array); country; period; dynasty ("" when not applicable); role (one sentence); known_facts (three to eight short English facts the video relies on); appearance (English, 40 to 80 words, for drawing the reference image: apparent age, build, face, hair and facial hair, period-correct clothing or armour with colours and materials, one signature accessory; no art-style words, no background).`;

const STORY_OUTPUT_RULES = `OUTPUT — one JSON object and nothing else. Inside string values quote with typographic quotes (“ ”), never a bare double quote:
{"title": "...", "slug": "...", "through_line": "...", "setting": "...", "characters": [{"id": "char-a", "name": "...", "display_name": "...", "aliases": [], "country": "...", "period": "...", "dynasty": "...", "role": "...", "known_facts": [], "appearance": "..."}], "scenes": [{"scene": 1, "cue": "...", "chars": ["char-a"], "narration": "...", "visual": "..."}]}
- title: the Vietnamese video title, under 70 characters.
- slug: lowercase ASCII words joined by hyphens, under 40 characters.
- setting: English — the country or region, era and culture every image must stay inside, e.g. "Dai Viet (northern Vietnam), 1390s-1407: the late Tran court, the Ho dynasty and the Ming invasion army".`;

const STORY_SYSTEM = `You are the head writer of a Vietnamese-language narrated short-video channel (history storytelling for TikTok and YouTube). From the user's video request you write the complete voice-over script of ONE video, split into exactly the requested number of scenes, plus its cast and an English visual beat for every scene. Text only.

${LANGUAGE_RULES}

STORY SHAPE — one gripping story, not a checklist
- First choose ONE explicit through-line: a question, tension or contrast the whole video answers. Every scene is a step along it. Report it in "through_line".
- Arc, scaled to the scene count: HOOK (the first scene or two) → SETUP (who or what, and why it matters) → CONTEXT and RISE → TURNING POINTS (two to four decisive moments that escalate) → CLIMAX → AFTERMATH and MEANING → CLOSE (the last scene).
- HOOK: open on a concrete moment, a paradox, a striking image or a curiosity question, so the viewer wants the answer within the first eight seconds. Open a loop that the video closes later. Never open with a definition, a greeting, or an announcement of what the video will cover.
- Stay on the through-line. Cut facts, dates and side stories that do not move it forward. Keep a date only when it anchors the story; never stack several dates in one scene.
- Every two or three scenes add a retention device: contrast, a question, escalation, a reveal, or a small payoff.
- CLOSE: a crisp judgement plus a question that invites the viewer's opinion. Never ask viewers to like or follow, never end on a hollow slogan, never recap the video.

CONNECTIVE FLOW — the narration is ONE continuous voice-over, not a list of captions
- Every scene after the first opens with a link to the scene before it: a time jump, a consequence, a contrast, a question the previous line raised, or a word picked up from it.
- Carry key words and images across scenes so the listener follows one thread.
- Read the whole narration in order before answering: it must flow as one spoken story, with no restarts and no repeated information.

NARRATOR VOICE — a warm mentor telling a story to a younger listener
- Direct, warm and encouraging; plain everyday words, driven by verbs. When a term is unavoidable, explain it in a few words.
- Mix short punchy sentences with medium ones. Each scene: one idea and one moment you could film, in one or two sentences, about 15 to 35 words. Write lines that already suggest an image of people doing something somewhere, not abstractions.
- Make contrasts concrete: knowing versus doing, short term versus long term, resources versus ability, the individual versus the collective.
- Humour only when it makes a point memorable: an unexpected comparison, light exaggeration, or a then-and-now analogy (an ancient office compared with a familiar modern role). At most one light touch every few scenes; never on a somber beat (death, betrayal, sacrifice, defeat), never built on an invented detail, never mocking anyone. Colloquial is fine, vulgar is not.
- Criticise choices and actions, never a person's worth, a people, an ethnicity or a circumstance.
- Written for the ear: commas and full stops set the breathing. No brackets, lists, emoji or abbreviations a narrator would stumble on.

ACCURACY
- For history, science, law, finance or news, state only facts you are confident are true. Never invent events, numbers, sources or quotes, and never put invented words in a real person's mouth. Present legend or tradition as legend or tradition. When sources disagree, say so briefly.
- Explain outcomes by context, resources, terrain and strategy, never by ethnicity. No shallow nationalism.

CAST
- "characters": the named people who appear on screen in several scenes and so need a fixed look (a reference image locks their face). Usually one to three. id "char-a" is the main figure, then "char-b", "char-c" in order of first appearance. Someone seen in only one scene, or only from a distance, is not cast: draw them as an anonymous extra.
${CAST_FIELDS_RULE}

SCENES — exactly the requested number, numbered 1..N in order
- narration: the Vietnamese voice-over line.
- cue: the delivery emotion, one of neutral | dramatic | tense | somber | hopeful | curious. Hook → dramatic or tense; setup and context → neutral; betrayal or death → somber; battle or chase → tense; victory → dramatic; legacy → hopeful; the closing question → curious. Vary it across the video.
- chars: the cast ids visible in this scene, in left-to-right placement order; [] when no cast member is on screen. Put the main figure on screen whenever the line is about what they do, decide, lose or suffer — even as a small figure in a wide scene — so the viewer watches them live the story; leave them out only for beats about other actors (the enemy fleet, a rival's decision) or pure setting.
- visual: English, one or two sentences naming the ONE drawable moment of this line: who does what to whom, where, and at what time of day, with the place and era named. A concrete event with people acting, never a symbol, a map on a table, a book or an empty room. A battle, landing, storm, siege or chase is shown in progress, never replaced by lookouts watching the horizon or people tidying up afterwards; only a killing or massacre is shown as the moment just before or after. Give each scene a different setting or activity from its neighbours. Refer to cast members by name and say only what they do: their face, hair and clothing come from the reference image, so never describe them here.

${STORY_OUTPUT_RULES}`;

const MAP_STORY_SYSTEM = mapStorySystem({ languageRules: LANGUAGE_RULES, castFieldsRule: CAST_FIELDS_RULE, outputRules: STORY_OUTPUT_RULES });

const visualsSystem = (rules, examples) => `You write the image-generation prompt for several scenes of one narrated historical video. Each scene arrives as an English visual beat — the drawable moment of its narration line — plus the characters available in it; read "narration line" in the rules below as that beat. ${rules}

OUTPUT — one JSON object and nothing else. Inside string values quote with typographic quotes (“ ”), never a bare double quote:
{"scenes": [{"scene": 1, "prompt": "...", "prompt_vi": "..."}]}
- One entry per requested scene, in the order given.
- prompt: the English scene prompt as plain prose, under that scene's character budget.
- prompt_vi: a close, natural Vietnamese translation of prompt (keep proper, dynasty and place names as they are).

${examples}`;

// Everything that differs per style: the three system prompts the phases send to the LLM.
const STYLE_PROMPTS = {
  standard: {
    story: STORY_SYSTEM,
    visuals: visualsSystem(SCENE_PROMPT_RULES, PROMPT_EXAMPLES),
    motion: undefined, // the project's own motion template (motion-writer.mjs)
  },
  map: {
    story: MAP_STORY_SYSTEM,
    visuals: visualsSystem(MAP_PROMPT_RULES, `EXAMPLE OF GOOD OUTPUT (English part only — match the discipline; never copy the content):\n[map scene prompt] ${MAP_PROMPT_EXAMPLE}`),
    motion: MAP_MOTION_SYSTEM,
  },
};

export const stylePrompts = (style = DEFAULT_SCRIPT_STYLE) => {
  if (!isScriptStyle(style)) throw new Error(`Kiểu video không hợp lệ: "${style}" (${SCRIPT_STYLES.join(' | ')})`);
  return STYLE_PROMPTS[style];
};

const asText = (value) => (typeof value === 'string' ? value.trim() : '');
const asList = (value) => (Array.isArray(value) ? value.map(asText).filter(Boolean) : []);
const oneLine = (value) => asText(value).replace(/\s+/g, ' ');

// Lowercase ASCII slug from any title ("Hồ Quý Ly: cải cách" → "ho-quy-ly-cai-cach").
export const slugify = (text) => asText(text)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40)
  .replace(/-+$/, '');

const normalizeCast = (raw) => {
  const cast = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const id = asText(c?.id).toLowerCase();
    if (!CAST_ID_RE.test(id) || cast.some((x) => x.id === id)) continue;
    const name = asText(c.name) || id;
    cast.push({
      id,
      name,
      display_name: asText(c.display_name) || name,
      aliases: asList(c.aliases),
      country: asText(c.country),
      period: asText(c.period),
      dynasty: asText(c.dynasty),
      role: asText(c.role),
      known_facts: asList(c.known_facts),
      appearance: oneLine(c.appearance),
    });
    if (cast.length === MAX_CAST) break;
  }
  return cast;
};

// The model's scenes, renumbered 1..n in reply order. A scene without narration is dropped (there
// is nothing to voice or to draw it from); unknown cast ids and cues fall back to none / neutral.
const normalizeScenes = (raw, castIds) => (Array.isArray(raw) ? raw : [])
  .map((s) => ({
    cue: CUES.includes(asText(s?.cue).toLowerCase()) ? asText(s.cue).toLowerCase() : 'neutral',
    chars: [...new Set(asList(s?.chars).map((id) => id.toLowerCase()))].filter((id) => castIds.includes(id)),
    narration: oneLine(s?.narration),
    visual: oneLine(s?.visual),
  }))
  .filter((s) => s.narration)
  .map((s, i) => ({ scene: i + 1, ...s }));

const storyRequest = (request, sceneCount, retryNote) => `Video request (from the user; it may be written in any language):
<<<
${request}
>>>

Number of scenes: exactly ${sceneCount}.${retryNote ? `\n\nIMPORTANT: ${retryNote}` : ''}

Write the JSON object now.`;

// Phase 1. Retries once when the reply's scene count misses the request, then accepts what came
// back (and says so through onLog) rather than failing the whole run.
export const writeStory = async ({ request, sceneCount, style, signal, onLog = () => {} }) => {
  const { story: system } = stylePrompts(style);
  let retryNote = '';
  for (let attempt = 1; ; attempt++) {
    const reply = await chatJson({ system, user: storyRequest(request, sceneCount, retryNote), signal, onLog, label: 'Viết kịch bản' });
    const characters = normalizeCast(reply.characters);
    const scenes = normalizeScenes(reply.scenes, characters.map((c) => c.id));
    if (scenes.length === sceneCount || attempt === 2) {
      if (scenes.length !== sceneCount) onLog(`⚠ LLM trả ${scenes.length}/${sceneCount} scene — giữ nguyên`);
      if (!scenes.length) throw new Error('LLM không trả về scene nào có narration.');
      // One line: the title becomes the plan's `# heading`, where a newline would start a new block.
      const title = oneLine(reply.title) || oneLine(request).slice(0, 60);
      return {
        title,
        slug: slugify(reply.slug) || slugify(title) || 'video-ai',
        throughLine: oneLine(reply.through_line),
        setting: oneLine(reply.setting),
        characters,
        scenes,
      };
    }
    onLog(`⚠ LLM trả ${scenes.length}/${sceneCount} scene — viết lại một lần`);
    retryNote = `the previous attempt returned ${scenes.length} scenes; return exactly ${sceneCount} scene objects.`;
  }
};

// The character context prompt-writer's brief expects ({ name, country, period, dynasty, role,
// knownFacts }), from the story's cast.
const castContext = (cast) => ({
  name: cast.name,
  country: cast.country,
  period: cast.period,
  dynasty: cast.dynasty,
  role: cast.role,
  knownFacts: cast.known_facts.slice(0, 3),
});

const visualsRequest = (story, batch) => {
  const byId = new Map(story.characters.map((c) => [c.id, c]));
  const outline = story.scenes.map((s) => `${s.scene}. ${s.visual}`).join('\n');
  const blocks = batch.map((s) => {
    const { charLines, notes, budget } = sceneCharacterBrief(s.chars.map((id) => castContext(byId.get(id))));
    return `SCENE ${s.scene} — mood: ${s.cue}
Beat: ${s.visual}
Characters available in this scene, in this exact order (use only these references):
${charLines}${notes}
Keep this scene's English prompt under ${budget} characters.`;
  });
  return `Video setting: ${story.setting || 'as named in the beats'}
Story through-line: ${story.throughLine}

Every scene beat of the video, for continuity only (depict only the requested scenes, and never reuse a neighbour's setting plus activity):
${outline}

Write the prompts for these scenes:

${blocks.join('\n\n')}

Write the JSON object now.`;
};

// Phase 2 for one batch of scenes → [{ scene, prompt, prompt_vi }], only for
// the scenes the reply actually covered with a prompt.
export const writeVisuals = async ({ story, batch, style, signal, onLog }) => {
  const reply = await chatJson({ system: stylePrompts(style).visuals, user: visualsRequest(story, batch), signal, onLog, label: 'Viết prompt' });
  const wanted = new Set(batch.map((s) => s.scene));
  const rows = Array.isArray(reply.scenes) ? reply.scenes : [];
  return rows
    .map((r) => ({
      scene: Number(r?.scene),
      prompt: oneLine(r?.prompt),
      prompt_vi: oneLine(r?.prompt_vi),
    }))
    .filter((r) => wanted.has(r.scene) && r.prompt);
};

export const visualBatches = (scenes) => {
  const batches = [];
  for (let i = 0; i < scenes.length; i += VISUAL_BATCH_SIZE) batches.push(scenes.slice(i, i + VISUAL_BATCH_SIZE));
  return batches;
};

// All phases → { story, visuals: Map(scene → prompt row), motions: Map(scene → motion row) }. A
// failed batch is logged and its scenes go without that field — the panel's "Viết prompt / motion
// còn thiếu" fills them later — so one bad reply never throws away the whole story. A cancel
// (`signal`) aborts everything. onProgress gets { phase: 'story' }, then { phase: 'visuals' |
// 'motion', done, total } as batches finish. `style` is 'standard' (default) or 'map'.
export const writeVideo = async ({ request, sceneCount, style, signal, onLog = () => {}, onProgress = () => {} }) => {
  const prompts = stylePrompts(style);
  onProgress({ phase: 'story' });
  onLog(`▶ Viết câu chuyện và narration (${sceneCount} scene${style === 'map' ? ', kiểu bản đồ' : ''})…`);
  const story = await writeStory({ request, sceneCount, style, signal, onLog });
  onLog(`✓ "${story.title}" — ${story.scenes.length} scene, ${story.characters.length} nhân vật`);
  if (story.throughLine) onLog(`  Mạch chính: ${story.throughLine}`);

  const visuals = new Map();
  const queue = visualBatches(story.scenes);
  let done = 0;
  onProgress({ phase: 'visuals', done, total: story.scenes.length });
  const worker = async () => {
    while (queue.length) {
      const batch = queue.shift();
      const label = batch.length > 1 ? `scene ${batch[0].scene}–${batch.at(-1).scene}` : `scene ${batch[0].scene}`;
      onLog(`▶ Viết prompt ảnh ${label}…`);
      try {
        const rows = await writeVisuals({ story, batch, style, signal, onLog });
        for (const row of rows) visuals.set(row.scene, row);
        onLog(`✓ Prompt ${label} (${rows.length}/${batch.length})`);
      } catch (error) {
        if (signal?.aborted) throw error;
        onLog(`✗ Prompt ${label}: ${error.message}`);
      }
      done += batch.length;
      onProgress({ phase: 'visuals', done, total: story.scenes.length });
    }
  };
  await Promise.all(Array.from({ length: VISUAL_CONCURRENCY }, worker));

  const byId = new Map(story.characters.map((c) => [c.id, c]));
  onProgress({ phase: 'motion', done: 0, total: story.scenes.length });
  const motions = await writeMotionsBatched({
    context: { setting: story.setting, throughLine: story.throughLine, outline: story.scenes.map((s) => ({ scene: s.scene, beat: s.visual })) },
    scenes: story.scenes.map((s) => ({ scene: s.scene, beat: s.visual, cue: s.cue, names: s.chars.map((id) => byId.get(id)?.name ?? id) })),
    system: prompts.motion,
    signal,
    onLog,
    onBatch: (done, total) => onProgress({ phase: 'motion', done, total }),
  });
  return { story, visuals, motions };
};
