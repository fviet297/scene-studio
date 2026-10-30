// Image-to-video motion direction, written independently of the image prompt. Per scene the LLM
// (scripts/lib/llm-client.mjs) writes three short English fields — camera, action, env — plus
// close Vietnamese translations, from the scene's English visual beat, mood and on-screen cast.
// The system prompt is the project's `motionSystem` template (defaults in motion-template.mjs, edited
// in the panel's Template prompt dialog), so the rules a clip is written against are visible there.
// The fixed wrapper every video model needs (opening line, identity/style lock, intensity,
// artifact ban) is never stored per scene: composeMotionPrompt adds it when a clip is generated.
// Used by the AI script writer (phase 3 of a new project) and the review server's motion writer.

import { chatJson, describeLlm } from './llm-client.mjs';
import { getTemplates } from './replicate-image.mjs';
import { MOTION_SYSTEM } from './motion-template.mjs';

export const MOTION_FIELDS = ['camera', 'action', 'env'];
// Scenes per LLM call and calls in flight — same sizing as the script writer's prompt phase.
const MOTION_BATCH_SIZE = 5;
const MOTION_CONCURRENCY = 2;

const OPEN_DYNAMIC = 'Animate this historical illustration into a dynamic cinematic shot with clearly visible motion from the first second.';
const OPEN_CALM = 'Animate this historical illustration into a calm but clearly moving cinematic shot.';
const INTENSITY_DYNAMIC = 'Motion intensity medium to high, character motion clear and natural, environmental motion strong across the whole frame.';
const INTENSITY_CALM = 'Motion intensity medium, character motion gentle but visible, environmental motion moderate.';
const ARTIFACT_BAN = 'No face deformation, warped limbs, extra fingers, duplicated people, morphing objects.';
// Only a somber beat gets the calm wrapper; every other cue keeps the clip visibly moving.
const CALM_CUES = new Set(['somber']);

const identityLock = (charCount) => {
  const who = charCount >= 2 ? "all characters' faces and costumes and " : charCount === 1 ? "the character's face and costume and " : '';
  return `Keep ${who}the painted art style, chibi proportions and framing consistent; no new characters, no text or watermark.`;
};

const asSentence = (text) => {
  const t = (text ?? '').trim();
  return !t || /[.!?]$/.test(t) ? t : `${t}.`;
};

// Positive-only wrapper for video models behind a content filter (Plenx's omni-flash-video is
// Google's: it refused a harmless scene whose prompt carried "no text or watermark" and a list of
// body-part negatives, and its error asks to avoid text and people requests). Nothing is asked to be
// absent, so there is nothing for the filter to read as a request for text or for bodies.
const composePlainMotionPrompt = ({ camera, action, env }, calm) => [
  calm ? 'Animate this illustrated scene into a calm cinematic shot with gentle visible motion.' : 'Animate this illustrated scene into a smooth cinematic shot with clearly visible motion.',
  asSentence(camera), asSentence(action), asSentence(env),
  'Keep the original illustration exactly: the same painted look, the same chibi proportions and character design, and the same framing, with every figure staying small and in the style of the still.',
  calm ? 'Gentle, natural motion across the frame.' : 'Natural, steady motion across the whole frame.',
].filter(Boolean).join(' ');

// The prompt a video model receives for one scene: fixed opening, the scene's camera → action →
// env, then the fixed identity lock, intensity and artifact ban (or `plain`, the positive-only
// wrapper above, for filtered models).
export const composeMotionPrompt = ({ camera, action, env }, { cue = '', charCount = 0, plain = false } = {}) => {
  const calm = CALM_CUES.has(cue.toLowerCase());
  if (plain) return composePlainMotionPrompt({ camera, action, env }, calm);
  return [
    calm ? OPEN_CALM : OPEN_DYNAMIC,
    asSentence(camera), asSentence(action), asSentence(env),
    identityLock(charCount),
    calm ? INTENSITY_CALM : INTENSITY_DYNAMIC,
    ARTIFACT_BAN,
  ].filter(Boolean).join(' ');
};

export const hasMotionParts = (parts) => MOTION_FIELDS.some((f) => (parts?.[f] ?? '').trim());

const oneLine = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

const castLine = (names) => {
  if (!names.length) return 'On screen: no main character (extras and setting only).';
  if (names.length === 1) return `On screen: one main character (${names[0]}) — call them "the character".`;
  return `On screen, left to right: ${names.join(', ')} — call them by position, never by name.`;
};

// `context` = { setting, throughLine, outline: [{ scene, beat }] } for continuity; each scene =
// { scene, beat, cue, names } where names are the on-screen cast in left-to-right order.
const motionRequest = (context, batch) => {
  const outline = (context.outline ?? []).map((s) => `${s.scene}. ${s.beat}`).join('\n');
  const blocks = batch.map((s) => `SCENE ${s.scene} — mood: ${s.cue || 'neutral'}
Beat: ${s.beat}
${castLine(s.names ?? [])}`);
  return `${context.setting ? `Video setting: ${context.setting}\n` : ''}${context.throughLine ? `Story through-line: ${context.throughLine}\n` : ''}${outline ? `\nEvery scene beat of the video, for continuity only:\n${outline}\n` : ''}
Write the motion for these scenes:

${blocks.join('\n\n')}

Write the JSON object now.`;
};

// One LLM call for up to MOTION_BATCH_SIZE scenes → [{ scene, camera, action, env, camera_vi,
// action_vi, env_vi }], only for the requested scenes the reply covered with all three fields.
// `system` overrides the project's motion template (map mode brings its own).
export const writeMotions = async ({ context = {}, batch, signal, onLog, system = getTemplates().motionSystem || MOTION_SYSTEM }) => {
  const reply = await chatJson({ system, user: motionRequest(context, batch), signal, onLog, label: 'Viết motion' });
  const wanted = new Set(batch.map((s) => s.scene));
  return (Array.isArray(reply.scenes) ? reply.scenes : [])
    .map((r) => ({
      scene: Number(r?.scene),
      ...Object.fromEntries(MOTION_FIELDS.flatMap((f) => [[f, oneLine(r?.[f])], [`${f}_vi`, oneLine(r?.[`${f}_vi`])]])),
    }))
    .filter((r) => wanted.has(r.scene) && MOTION_FIELDS.every((f) => r[f]));
};

// Every scene in batches, two calls at a time → Map(scene → row). A failed batch is logged and its
// scenes are left without motion (the panel can write them later); a cancel aborts everything.
// onBatch(done, total) fires as batches finish.
export const writeMotionsBatched = async ({ context, scenes, system, signal, onLog = () => {}, onBatch = () => {} }) => {
  const queue = [];
  for (let i = 0; i < scenes.length; i += MOTION_BATCH_SIZE) queue.push(scenes.slice(i, i + MOTION_BATCH_SIZE));
  const rows = new Map();
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const batch = queue.shift();
      const label = batch.length > 1 ? `scene ${batch[0].scene}–${batch.at(-1).scene}` : `scene ${batch[0].scene}`;
      onLog(`▶ Viết motion ${label} (${describeLlm()})…`);
      try {
        const written = await writeMotions({ context, batch, system, signal, onLog });
        for (const row of written) rows.set(row.scene, row);
        onLog(`✓ Motion ${label} (${written.length}/${batch.length})`);
      } catch (error) {
        if (signal?.aborted) throw error;
        onLog(`✗ Motion ${label}: ${error.message}`);
      }
      done += batch.length;
      onBatch(done, scenes.length);
    }
  };
  await Promise.all(Array.from({ length: MOTION_CONCURRENCY }, worker));
  return rows;
};
