// Edits a scene image that already exists: the current picture goes to an image model as its
// reference together with the one change the person typed, wrapped in a system prompt that tells
// the model to leave everything else alone. Unlike generateSceneImage there is no template, style
// DNA or character reference: the picture itself carries the style, faces and composition.
// Providers that cannot edit from one reference image are not offered here (every id the panel's
// image picker lists can: Seedream and Grok take `image(_input)`, muse2api `reference_image`, Meta
// and OpenAI-compatible providers an edit endpoint).

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  NO_TEXT_POLICY, currentAspect, download, imageDir, manifestPath, runImageModel, upsertManifest,
} from './replicate-image.mjs';
import { providerOf } from './providers.mjs';

export const MAX_EDIT_INSTRUCTION = 1500;

const EDIT_SYSTEM = `IMAGE EDIT. The reference image is the finished illustration of one video scene. Change ONLY what the CHANGE below asks for; every other part of the picture stays exactly as it is.

KEEP IDENTICAL: the composition, framing, camera angle and aspect ratio; every character's face, hair, age, expression, costume, pose, position and scale; the background, architecture, props, terrain, sky, weather and time of day; the lighting, shadows, colour palette, art style, line quality and texture; the number and placement of people and objects.

APPLY THE CHANGE: modify, add or remove only the element the CHANGE names, drawn in the picture's own art style and lighting so it looks painted in the same pass. If the CHANGE is ambiguous, make the smallest reasonable edit. Never redraw, restyle, recolour, crop, zoom or re-compose the rest of the scene, and never "improve" it.`;

const EDIT_NEGATIVE = 'NEGATIVE: re-composed scene, different art style, changed faces, changed costumes, new or missing characters, moved objects, altered background, colour shift, added text, caption, watermark, border or frame.';

// The instruction may be Vietnamese; the models read it as typed.
export const buildEditPrompt = (instruction) => `${NO_TEXT_POLICY}

${EDIT_SYSTEM}

CHANGE (may be written in Vietnamese; follow its meaning): ${instruction.trim()}

Everything not named in the CHANGE stays identical to the reference image.

${EDIT_NEGATIVE}`;

const AI_LICENSE = 'AI-generated — no third-party rights; labelled on screen';

// The scene's manifest entry after an edit. An edited picture is AI output even when the image
// before it was the person's own upload, so the label follows the edit, never the old tag.
export const editedManifestEntry = (existing, { scene, id, model, characters = [] }) => {
  const via = `${model} edit`;
  return {
    ...(existing ?? {}),
    id,
    scene,
    type: 'ai_reconstruction',
    subject: existing?.subject ?? `AI-edited image for scene ${scene}`,
    source: `AI edited (${providerOf(model).label}, ${via})`,
    sourceUrl: null,
    license: AI_LICENSE,
    credit: `AI reconstruction (${via})`,
    authenticity: 'AI_RECONSTRUCTION',
    characters: existing?.characters ?? characters,
  };
};

const readManifest = () => (existsSync(manifestPath()) ? JSON.parse(readFileSync(manifestPath(), 'utf8')) : []);

// Edit scene `scene`'s image in place → { file, via }. The result is downloaded beside the image
// and swapped in only once it is complete, so a failed or cancelled edit leaves the current image
// untouched. `signal` cancels the provider call.
export const editSceneImage = async ({ scene, instruction, model, characters, signal, onLog = () => {} }) => {
  const file = `scene-${String(scene).padStart(2, '0')}.jpg`;
  const imagePath = join(imageDir(), file);
  if (!existsSync(imagePath)) throw new Error(`Scene ${scene} chưa có ảnh để sửa.`);
  const prompt = buildEditPrompt(instruction);
  const aspect = currentAspect();
  onLog(`edit: model=${model}, aspect=${aspect}, prompt=${prompt.length} chars`);
  const url = await runImageModel(process.env.REPLICATE_API_TOKEN, model, {
    prompt, refPaths: [imagePath], aspect, onLog, signal,
  });
  signal?.throwIfAborted(); // cancelled while the provider finished: keep the current image
  mkdirSync(imageDir(), { recursive: true });
  const draftPath = `${imagePath}.edit`;
  try {
    onLog(`downloading result → ${imagePath}`);
    await download(url, draftPath);
    renameSync(draftPath, imagePath);
  } finally {
    if (existsSync(draftPath)) unlinkSync(draftPath);
  }
  const id = file.replace(/\.[^.]+$/, '');
  const existing = readManifest().find((m) => m.id === id);
  upsertManifest(editedManifestEntry(existing, { scene, id, model, characters }));
  onLog(`saved: ${imagePath}`);
  return { file, via: `${model} edit` };
};
